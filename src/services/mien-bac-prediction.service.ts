import { LotteryNumberMienBacModel } from '../models/LotteryNumber';
import { getLatestPredictionLearningWeights } from './prediction-learning-weight.service';

export type PredictionTarget = 'last2' | 'last3';

export interface MienBacPredictionOptions {
  target: PredictionTarget;
  historyDays: number;
  top: number;
}

export interface MienBacPredictionBacktestOptions extends MienBacPredictionOptions {
  testDays: number;
}

export interface MienBacLast2TrendOptions {
  recentDays: number;
  baselineDays: number;
  top: number;
}

export interface MienBacLast2BlendOptions {
  historyDays: number;
  predictionTop: number;
  recentDays: number;
  baselineDays: number;
  trendTop: number;
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

export interface MienBacPredictionBacktestDay {
  date: string;
  actualCount: number;
  hitCount: number;
  hitRate: string;
  hits: string;
  predicted: string;
}

export interface MienBacPredictionBacktestResult {
  target: PredictionTarget;
  historyDays: number;
  testDays: number;
  top: number;
  evaluatedDays: number;
  hitDays: number;
  hitDayRate: string;
  totalHits: number;
  totalActual: number;
  numberHitRate: string;
  averageHitsPerDay: string;
  days: MienBacPredictionBacktestDay[];
}

export interface MienBacLast2TrendRow {
  rank: number;
  number: string;
  recentCount: number;
  baselineCount: number;
  recentRate: string;
  baselineRate: string;
  trendLift: string;
  lastSeenDate: string;
  gapDays: number;
  trendScore: string;
}

export interface MienBacLast2BlendRow {
  rank: number;
  number: string;
  combinedScore: string;
  predictionRank: string;
  predictionScore: string;
  predictionCount: string;
  predictionGapDays: string;
  trendRank: string;
  trendScore: string;
  trendLift: string;
  trendRecentCount: string;
  trendBaselineCount: string;
  trendGapDays: string;
  source: string;
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

export async function getMienBacLast2PredictionTrendBlend(
  options: MienBacLast2BlendOptions,
): Promise<MienBacLast2BlendRow[]> {
  const predictionRows = await predictMienBacNumbers({
    target: 'last2',
    historyDays: options.historyDays,
    top: options.predictionTop,
  });
  const trendRows = await getTrendingMienBacLast2({
    recentDays: options.recentDays,
    baselineDays: options.baselineDays,
    top: options.trendTop,
  });

  const predictionByNumber = new Map(predictionRows.map((row) => [row.number, row]));
  const trendByNumber = new Map(trendRows.map((row) => [row.number, row]));
  const numbers = new Set([...predictionByNumber.keys(), ...trendByNumber.keys()]);
  const weights = await getLatestPredictionLearningWeights();

  return Array.from(numbers)
    .map((number) => {
      const prediction = predictionByNumber.get(number);
      const trend = trendByNumber.get(number);
      const predictionScore = prediction ? Number(prediction.score) : 0;
      const trendScore = trend ? Number(trend.trendScore) : 0;
      const bothBonus = prediction && trend ? weights.bothListBonus : 0;
      const combinedScore = clamp(
        predictionScore * weights.predictionWeight + trendScore * weights.trendWeight + bothBonus,
        0,
        1,
      );

      return {
        number,
        combinedScore,
        prediction,
        trend,
        source: prediction && trend ? 'prediction+trend' : prediction ? 'prediction' : 'trend',
      };
    })
    .sort(
      (left, right) =>
        right.combinedScore - left.combinedScore ||
        Number(right.prediction?.score ?? 0) - Number(left.prediction?.score ?? 0) ||
        Number(right.trend?.trendScore ?? 0) - Number(left.trend?.trendScore ?? 0) ||
        left.number.localeCompare(right.number),
    )
    .slice(0, options.top)
    .map((row, index) => ({
      rank: index + 1,
      number: row.number,
      combinedScore: formatScore(row.combinedScore),
      predictionRank: row.prediction ? String(row.prediction.rank) : '-',
      predictionScore: row.prediction?.score ?? '-',
      predictionCount: row.prediction ? String(row.prediction.count) : '-',
      predictionGapDays: row.prediction ? String(row.prediction.gapDays) : '-',
      trendRank: row.trend ? String(row.trend.rank) : '-',
      trendScore: row.trend?.trendScore ?? '-',
      trendLift: row.trend?.trendLift ?? '-',
      trendRecentCount: row.trend ? String(row.trend.recentCount) : '-',
      trendBaselineCount: row.trend ? String(row.trend.baselineCount) : '-',
      trendGapDays: row.trend ? String(row.trend.gapDays) : '-',
      source: row.source,
    }));
}

export async function getTrendingMienBacLast2(options: MienBacLast2TrendOptions): Promise<MienBacLast2TrendRow[]> {
  const latest = await LotteryNumberMienBacModel.findOne({ province: 'xsmb' })
    .sort({ date: -1 })
    .select({ date: 1 })
    .lean()
    .exec();

  if (!latest?.date) {
    return [];
  }

  const totalDays = options.recentDays + options.baselineDays;
  const fromDate = shiftDate(latest.date, -(totalDays - 1));
  const rows = await LotteryNumberMienBacModel.find({
    province: 'xsmb',
    date: { $gte: fromDate, $lte: latest.date },
  })
    .select({ date: 1, last2: 1 })
    .sort({ date: 1 })
    .lean<HistoryRow[]>()
    .exec();

  const dailyHits = buildDailyHits(rows, 'last2');
  if (dailyHits.length === 0) {
    return [];
  }

  const recentDays = dailyHits.slice(-options.recentDays);
  const baselineDays = dailyHits.slice(Math.max(0, dailyHits.length - options.recentDays - options.baselineDays), -options.recentDays);
  const latestDay = dailyHits[dailyHits.length - 1];

  return buildCandidates('last2')
    .map((candidate) => {
      const recentCount = countHits(candidate, recentDays);
      const baselineCount = countHits(candidate, baselineDays);
      const recentRate = recentCount / Math.max(recentDays.length, 1);
      const baselineRate = baselineCount / Math.max(baselineDays.length, 1);
      const smoothedBaselineRate = (baselineCount + 1) / (Math.max(baselineDays.length, 1) + 100);
      const trendLift = recentRate / smoothedBaselineRate;
      const lastSeenDate = findLastSeenDate(candidate, dailyHits);
      const gapDays = lastSeenDate ? diffDays(latestDay.date, lastSeenDate) : totalDays;
      const recencyBoost = Math.exp(-gapDays / 14);
      const trendScore = clamp(normalize(trendLift, 3) * 0.65 + normalize(recentRate, 0.35) * 0.25 + recencyBoost * 0.1, 0, 1);

      return {
        number: candidate,
        recentCount,
        baselineCount,
        recentRate,
        baselineRate,
        trendLift,
        lastSeenDate: lastSeenDate ?? '-',
        gapDays,
        trendScore,
      };
    })
    .filter((row) => row.recentCount >= 2)
    .sort(
      (left, right) =>
        right.trendScore - left.trendScore ||
        right.trendLift - left.trendLift ||
        right.recentCount - left.recentCount ||
        left.number.localeCompare(right.number),
    )
    .slice(0, options.top)
    .map((row, index) => ({
      rank: index + 1,
      number: row.number,
      recentCount: row.recentCount,
      baselineCount: row.baselineCount,
      recentRate: formatScore(row.recentRate),
      baselineRate: formatScore(row.baselineRate),
      trendLift: formatScore(row.trendLift),
      lastSeenDate: row.lastSeenDate,
      gapDays: row.gapDays,
      trendScore: formatScore(row.trendScore),
    }));
}

export async function backtestMienBacPrediction(
  options: MienBacPredictionBacktestOptions,
): Promise<MienBacPredictionBacktestResult | undefined> {
  const latest = await LotteryNumberMienBacModel.findOne({ province: 'xsmb' })
    .sort({ date: -1 })
    .select({ date: 1 })
    .lean()
    .exec();

  if (!latest?.date) {
    return undefined;
  }

  const fromDate = shiftDate(latest.date, -(options.historyDays + options.testDays - 1));
  const rows = await LotteryNumberMienBacModel.find({
    province: 'xsmb',
    date: { $gte: fromDate, $lte: latest.date },
  })
    .select({ date: 1, [options.target]: 1 })
    .sort({ date: 1 })
    .lean<HistoryRow[]>()
    .exec();

  const dailyHits = buildDailyHits(rows, options.target);
  if (dailyHits.length <= 1) {
    return undefined;
  }

  const candidates = buildCandidates(options.target);
  const firstTestIndex = Math.max(1, dailyHits.length - options.testDays);
  const days: MienBacPredictionBacktestDay[] = [];

  for (let dayIndex = firstTestIndex; dayIndex < dailyHits.length; dayIndex += 1) {
    const actualDay = dailyHits[dayIndex];
    const trainingDays = dailyHits.slice(Math.max(0, dayIndex - options.historyDays), dayIndex);

    if (trainingDays.length === 0) {
      continue;
    }

    const predicted = rankCandidates(candidates, trainingDays, options.top).map((row) => row.number);
    const hits = predicted.filter((candidate) => actualDay.values.has(candidate));

    days.push({
      date: actualDay.date,
      actualCount: actualDay.values.size,
      hitCount: hits.length,
      hitRate: formatPercent(hits.length / Math.max(actualDay.values.size, 1)),
      hits: hits.join(', ') || '-',
      predicted: predicted.join(', '),
    });
  }

  const evaluatedDays = days.length;
  const hitDays = days.filter((day) => day.hitCount > 0).length;
  const totalHits = days.reduce((sum, day) => sum + day.hitCount, 0);
  const totalActual = days.reduce((sum, day) => sum + day.actualCount, 0);

  return {
    target: options.target,
    historyDays: options.historyDays,
    testDays: options.testDays,
    top: options.top,
    evaluatedDays,
    hitDays,
    hitDayRate: formatPercent(hitDays / Math.max(evaluatedDays, 1)),
    totalHits,
    totalActual,
    numberHitRate: formatPercent(totalHits / Math.max(totalActual, 1)),
    averageHitsPerDay: (totalHits / Math.max(evaluatedDays, 1)).toFixed(2),
    days,
  };
}

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
  const scored = rankCandidates(candidates, dailyHits, options.top);

  return scored
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

function rankCandidates(candidates: string[], dailyHits: DailyHits[], top: number): ScoredCandidate[] {
  const weights = calibrateWeights(candidates, dailyHits);
  return candidates
    .map((candidate) => scoreCandidate(candidate, dailyHits, weights))
    .sort((left, right) => right.score - left.score || right.count - left.count || left.number.localeCompare(right.number))
    .slice(0, top);
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

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}
