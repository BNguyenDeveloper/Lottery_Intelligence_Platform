import { LotteryNumberMienBacModel } from '../models/LotteryNumber';

export type PredictionTarget = 'last2' | 'last3';

export interface MienBacPredictionOptions {
  target: PredictionTarget;
  historyDays: number;
  top: number;
}

export interface MienBacPredictionRow {
  rank: number;
  number: string;
  count: number;
  lastSeenDate: string;
  gapDays: number;
  score: string;
  frequencyScore: string;
  recentScore: string;
  trendScore: string;
  recencyScore: string;
  gapScore: string;
  weekdayScore: string;
  markovScore: string;
}

interface HistoryRow {
  date: string;
  last2?: string;
  last3?: string;
}

interface DailyHits {
  date: string;
  dayOfWeek: number;
  values: Set<string>;
}

interface ScoredCandidate {
  number: string;
  count: number;
  lastSeenDate: string;
  gapDays: number;
  score: number;
  frequencyScore: number;
  recentScore: number;
  trendScore: number;
  recencyScore: number;
  gapScore: number;
  weekdayScore: number;
  markovScore: number;
}

type ScoreKey =
  | 'frequencyScore'
  | 'recentScore'
  | 'trendScore'
  | 'recencyScore'
  | 'gapScore'
  | 'weekdayScore'
  | 'markovScore';

type PredictionWeights = Record<ScoreKey, number>;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MIN_CALIBRATION_DAYS = 45;
const MAX_VALIDATION_DAYS = 60;

const SCORE_KEYS: ScoreKey[] = [
  'frequencyScore',
  'recentScore',
  'trendScore',
  'recencyScore',
  'gapScore',
  'weekdayScore',
  'markovScore',
];

const DEFAULT_WEIGHTS: PredictionWeights = {
  frequencyScore: 0.22,
  recentScore: 0.2,
  trendScore: 0.13,
  recencyScore: 0.13,
  gapScore: 0.11,
  weekdayScore: 0.1,
  markovScore: 0.11,
};

export async function predictMienBacNumbers(options: MienBacPredictionOptions): Promise<MienBacPredictionRow[]> {
  const latest = await LotteryNumberMienBacModel.findOne({ province: 'xsmb' })
    .sort({ date: -1 })
    .select({ date: 1 })
    .lean()
    .exec();

  if (!latest?.date) {
    return [];
  }

  const fromDate = shiftDate(latest.date, -(options.historyDays - 1));
  const rows = await LotteryNumberMienBacModel.find({
    province: 'xsmb',
    date: { $gte: fromDate, $lte: latest.date },
  })
    .select({ date: 1, [options.target]: 1 })
    .sort({ date: 1 })
    .lean<HistoryRow[]>()
    .exec();

  const dailyHits = buildDailyHits(rows, options.target);
  if (dailyHits.length === 0) {
    return [];
  }

  const candidates = buildCandidates(options.target);
  const weights = calibrateWeights(candidates, dailyHits);
  const scored = candidates.map((candidate) => scoreCandidate(candidate, dailyHits, weights));

  return scored
    .sort((left, right) => right.score - left.score || right.count - left.count || left.number.localeCompare(right.number))
    .slice(0, options.top)
    .map((row, index) => ({
      rank: index + 1,
      number: row.number,
      count: row.count,
      lastSeenDate: row.lastSeenDate,
      gapDays: row.gapDays,
      score: formatScore(row.score),
      frequencyScore: formatScore(row.frequencyScore),
      recentScore: formatScore(row.recentScore),
      trendScore: formatScore(row.trendScore),
      recencyScore: formatScore(row.recencyScore),
      gapScore: formatScore(row.gapScore),
      weekdayScore: formatScore(row.weekdayScore),
      markovScore: formatScore(row.markovScore),
    }));
}

function buildDailyHits(rows: HistoryRow[], target: PredictionTarget): DailyHits[] {
  const byDate = new Map<string, Set<string>>();

  for (const row of rows) {
    const value = row[target];
    if (!value) {
      continue;
    }

    if (!byDate.has(row.date)) {
      byDate.set(row.date, new Set<string>());
    }

    byDate.get(row.date)?.add(value);
  }

  return Array.from(byDate.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, values]) => ({
      date,
      dayOfWeek: new Date(`${date}T00:00:00.000Z`).getUTCDay(),
      values,
    }));
}

function buildCandidates(target: PredictionTarget): string[] {
  const width = target === 'last2' ? 2 : 3;
  const count = target === 'last2' ? 100 : 1000;
  return Array.from({ length: count }, (_, index) => index.toString().padStart(width, '0'));
}

function scoreCandidate(candidate: string, dailyHits: DailyHits[], weights: PredictionWeights): ScoredCandidate {
  const signals = calculateCandidateSignals(candidate, dailyHits);
  const score = calculateWeightedScore(signals, weights);

  return {
    ...signals,
    score,
  };
}

function calculateCandidateSignals(candidate: string, dailyHits: DailyHits[]): Omit<ScoredCandidate, 'score'> {
  const totalDays = dailyHits.length;
  const recentWindow = Math.min(30, totalDays);
  const olderWindow = Math.min(90, Math.max(totalDays - recentWindow, 1));
  const recentDays = dailyHits.slice(-recentWindow);
  const olderDays = dailyHits.slice(Math.max(0, totalDays - recentWindow - olderWindow), totalDays - recentWindow);
  const latestDay = dailyHits[dailyHits.length - 1];
  const latestValues = latestDay.values;
  const count = countHits(candidate, dailyHits);
  const recentCount = countHits(candidate, recentDays);
  const olderCount = countHits(candidate, olderDays);
  const lastSeenDate = findLastSeenDate(candidate, dailyHits);
  const gapDays = lastSeenDate ? diffDays(latestDay.date, lastSeenDate) : totalDays;

  const frequencyScore = normalize(count / totalDays, 0.45);
  const recentScore = normalize(recentCount / recentWindow, 0.55);
  const trendScore = clamp((recentCount / recentWindow - olderCount / Math.max(olderDays.length, 1)) / 0.5 + 0.5, 0, 1);
  const recencyScore = Math.exp(-gapDays / 18);
  const gapScore = 1 - Math.exp(-gapDays / 28);
  const weekdayScore = calculateWeekdayScore(candidate, dailyHits, latestDay.date);
  const markovScore = calculateMarkovScore(candidate, dailyHits, latestValues);

  return {
    number: candidate,
    count,
    lastSeenDate: lastSeenDate ?? '-',
    gapDays,
    frequencyScore,
    recentScore,
    trendScore,
    recencyScore,
    gapScore,
    weekdayScore,
    markovScore,
  };
}

function calibrateWeights(candidates: string[], dailyHits: DailyHits[]): PredictionWeights {
  if (dailyHits.length < MIN_CALIBRATION_DAYS) {
    return DEFAULT_WEIGHTS;
  }

  const validationDays = Math.min(MAX_VALIDATION_DAYS, Math.max(14, Math.floor(dailyHits.length * 0.2)));
  const firstValidationIndex = Math.max(30, dailyHits.length - validationDays);
  const signalTotals = createScoreMap(0);
  const hitSignalTotals = createScoreMap(0);
  let evaluatedCandidates = 0;
  let hitCandidates = 0;

  for (let dayIndex = firstValidationIndex; dayIndex < dailyHits.length; dayIndex += 1) {
    const trainingDays = dailyHits.slice(0, dayIndex);
    const actualValues = dailyHits[dayIndex].values;

    for (const candidate of candidates) {
      const signals = calculateCandidateSignals(candidate, trainingDays);
      evaluatedCandidates += 1;

      for (const key of SCORE_KEYS) {
        signalTotals[key] += signals[key];
      }

      if (!actualValues.has(candidate)) {
        continue;
      }

      hitCandidates += 1;
      for (const key of SCORE_KEYS) {
        hitSignalTotals[key] += signals[key];
      }
    }
  }

  if (evaluatedCandidates === 0 || hitCandidates === 0) {
    return DEFAULT_WEIGHTS;
  }

  const calibrated = createScoreMap(0);
  for (const key of SCORE_KEYS) {
    const overallAverage = signalTotals[key] / evaluatedCandidates;
    const hitAverage = hitSignalTotals[key] / hitCandidates;
    const lift = overallAverage > 0 ? hitAverage / overallAverage : 1;
    calibrated[key] = DEFAULT_WEIGHTS[key] * clamp(lift, 0.55, 1.65);
  }

  return normalizeWeights(calibrated);
}

function calculateWeightedScore(candidate: Omit<ScoredCandidate, 'score'>, weights: PredictionWeights): number {
  return clamp(
    SCORE_KEYS.reduce((sum, key) => sum + candidate[key] * weights[key], 0),
    0,
    1,
  );
}

function createScoreMap(value: number): PredictionWeights {
  return {
    frequencyScore: value,
    recentScore: value,
    trendScore: value,
    recencyScore: value,
    gapScore: value,
    weekdayScore: value,
    markovScore: value,
  };
}

function normalizeWeights(weights: PredictionWeights): PredictionWeights {
  const total = SCORE_KEYS.reduce((sum, key) => sum + weights[key], 0);
  if (total <= 0) {
    return DEFAULT_WEIGHTS;
  }

  const normalized = createScoreMap(0);
  for (const key of SCORE_KEYS) {
    normalized[key] = weights[key] / total;
  }

  return normalized;
}

function calculateWeekdayScore(candidate: string, dailyHits: DailyHits[], latestDate: string): number {
  const tomorrow = shiftDate(latestDate, 1);
  const targetDayOfWeek = new Date(`${tomorrow}T00:00:00.000Z`).getUTCDay();
  const matchingDays = dailyHits.filter((day) => day.dayOfWeek === targetDayOfWeek);

  if (matchingDays.length === 0) {
    return 0;
  }

  return normalize(countHits(candidate, matchingDays) / matchingDays.length, 0.5);
}

function calculateMarkovScore(candidate: string, dailyHits: DailyHits[], latestValues: Set<string>): number {
  let transitionCount = 0;
  let hitAfterTransitionCount = 0;

  for (let index = 1; index < dailyHits.length; index += 1) {
    const previousValues = dailyHits[index - 1].values;
    const hasSharedPreviousState = Array.from(latestValues).some((value) => previousValues.has(value));

    if (!hasSharedPreviousState) {
      continue;
    }

    transitionCount += 1;
    if (dailyHits[index].values.has(candidate)) {
      hitAfterTransitionCount += 1;
    }
  }

  if (transitionCount === 0) {
    return 0;
  }

  return normalize(hitAfterTransitionCount / transitionCount, 0.55);
}

function countHits(candidate: string, dailyHits: DailyHits[]): number {
  return dailyHits.reduce((count, day) => count + (day.values.has(candidate) ? 1 : 0), 0);
}

function findLastSeenDate(candidate: string, dailyHits: DailyHits[]): string | undefined {
  for (let index = dailyHits.length - 1; index >= 0; index -= 1) {
    if (dailyHits[index].values.has(candidate)) {
      return dailyHits[index].date;
    }
  }

  return undefined;
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function diffDays(toDate: string, fromDate: string): number {
  const to = new Date(`${toDate}T00:00:00.000Z`).getTime();
  const from = new Date(`${fromDate}T00:00:00.000Z`).getTime();
  return Math.max(0, Math.round((to - from) / MS_PER_DAY));
}

function normalize(value: number, expectedHigh: number): number {
  return clamp(value / expectedHigh, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatScore(value: number): string {
  return value.toFixed(4);
}
