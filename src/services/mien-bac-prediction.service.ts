import { LotteryNumberMienBacModel } from '../models/LotteryNumber';
import {
  DEFAULT_PREDICTION_LEARNING_WEIGHTS,
  getLatestPredictionLearningWeights,
  PredictionLearningWeights,
} from './prediction-learning-weight.service';

export type PredictionTarget = 'last2' | 'last3';

export interface MienBacPredictionOptions {
  target: PredictionTarget;
  historyDays: number;
  top: number;
}

export interface MienBacPredictionBacktestOptions extends MienBacPredictionOptions {
  testDays: number;
}

export interface MienBacBayesianWeightBacktestOptions {
  historyDays: number;
  testDays: number;
  top: number;
  weightGrid: BayesianPredictionWeights[];
}

export interface MienBacBayesianWeightBacktestResult extends BayesianPredictionWeights {
  evaluatedDays: number;
  hitDays: number;
  hitDayRate: string;
  totalHits: number;
  averageHitsPerDay: string;
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

export interface MienBacLast2BlendWeightBacktestOptions extends MienBacLast2BlendOptions {
  backtestDays: number;
  weightGrid: Array<Pick<PredictionLearningWeights, 'predictionWeight' | 'trendWeight' | 'bothListBonus'>>;
}

export interface MienBacPredictionRow {
  rank: number;
  number: string;
  count: number;
  lastSeenDate: string;
  gapDays: number;
  score: string;
  repeatPenalty: string;
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
  randomBaselineAverageHitsPerDay: string;
  liftVsRandom: string;
  randomBaselineHitDayRate: string;
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

export interface MienBacLast2BlendWeightBacktestResult {
  predictionWeight: number;
  trendWeight: number;
  bothListBonus: number;
  evaluatedDays: number;
  hitDays: number;
  hitDayRate: string;
  totalHits: number;
  averageHitsPerDay: string;
  top5HitRate: string;
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
  repeatPenalty: number;
  frequencyScore: number;
  recentScore: number;
  trendScore: number;
  recencyScore: number;
  gapScore: number;
  weekdayScore: number;
  markovScore: number;
}

interface ProbabilitySignals {
  longTerm: number;
  mediumTerm: number;
  shortTerm: number;
  veryRecent: number;
  weekday: number;
}

export type BayesianPredictionWeights = Pick<
  PredictionLearningWeights,
  | 'bayesianLongTermWeight'
  | 'bayesianMediumTermWeight'
  | 'bayesianShortTermWeight'
  | 'bayesianVeryRecentWeight'
  | 'bayesianWeekdayWeight'
>;

interface TrendCandidate {
  number: string;
  recentCount: number;
  baselineCount: number;
  recentRate: number;
  baselineRate: number;
  trendLift: number;
  lastSeenDate: string;
  gapDays: number;
  trendScore: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function backtestMienBacBayesianWeights(
  options: MienBacBayesianWeightBacktestOptions,
): Promise<MienBacBayesianWeightBacktestResult[]> {
  const latest = await LotteryNumberMienBacModel.findOne({ province: 'xsmb' })
    .sort({ date: -1 })
    .select({ date: 1 })
    .lean()
    .exec();

  if (!latest?.date) return [];

  const fromDate = shiftDate(latest.date, -(options.historyDays + options.testDays - 1));
  const rows = await LotteryNumberMienBacModel.find({
    province: 'xsmb',
    date: { $gte: fromDate, $lte: latest.date },
  })
    .select({ date: 1, last2: 1 })
    .sort({ date: 1 })
    .lean<HistoryRow[]>()
    .exec();
  const dailyHits = buildDailyHits(rows, 'last2');
  const candidates = buildCandidates('last2');
  const firstTestIndex = Math.max(1, dailyHits.length - options.testDays);
  const results = options.weightGrid.map((weights) => ({
    ...weights,
    evaluatedDays: 0,
    hitDays: 0,
    totalHits: 0,
  }));

  for (let dayIndex = firstTestIndex; dayIndex < dailyHits.length; dayIndex += 1) {
    const trainingDays = dailyHits.slice(Math.max(0, dayIndex - options.historyDays), dayIndex);
    if (trainingDays.length === 0) continue;

    for (const result of results) {
      const predicted = rankCandidates(candidates, trainingDays, options.top, result);
      const hitCount = predicted.filter((row) => dailyHits[dayIndex].values.has(row.number)).length;
      result.evaluatedDays += 1;
      result.totalHits += hitCount;
      if (hitCount > 0) result.hitDays += 1;
    }
  }

  return results
    .map((result) => ({
      ...result,
      hitDayRate: formatPercent(result.hitDays / Math.max(result.evaluatedDays, 1)),
      averageHitsPerDay: (result.totalHits / Math.max(result.evaluatedDays, 1)).toFixed(2),
    }))
    .sort(
      (left, right) =>
        Number(right.averageHitsPerDay) - Number(left.averageHitsPerDay) ||
        parsePercent(right.hitDayRate) - parsePercent(left.hitDayRate),
    );
}

export async function backtestMienBacLast2BlendWeights(
  options: MienBacLast2BlendWeightBacktestOptions,
): Promise<MienBacLast2BlendWeightBacktestResult[]> {
  const latest = await LotteryNumberMienBacModel.findOne({ province: 'xsmb' })
    .sort({ date: -1 })
    .select({ date: 1 })
    .lean()
    .exec();

  if (!latest?.date) {
    return [];
  }

  const totalDays = options.historyDays + options.baselineDays + options.backtestDays;
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
  if (dailyHits.length <= 1) {
    return [];
  }

  const candidates = buildCandidates('last2');
  const learnedWeights = await getLatestPredictionLearningWeights();
  const bayesianWeights = pickBayesianWeights(learnedWeights);
  const firstTestIndex = Math.max(1, dailyHits.length - options.backtestDays);
  const results = options.weightGrid.map((weights) => ({
    predictionWeight: weights.predictionWeight,
    trendWeight: weights.trendWeight,
    bothListBonus: weights.bothListBonus,
    evaluatedDays: 0,
    hitDays: 0,
    totalHits: 0,
    top5Hits: 0,
  }));

  for (let dayIndex = firstTestIndex; dayIndex < dailyHits.length; dayIndex += 1) {
    const actualDay = dailyHits[dayIndex];
    const trainingDays = dailyHits.slice(Math.max(0, dayIndex - options.historyDays), dayIndex);

    if (trainingDays.length === 0) {
      continue;
    }

    const predictionRows = rankCandidates(candidates, trainingDays, options.predictionTop, bayesianWeights);
    const trendRows = rankTrendCandidates(candidates, trainingDays, options);

    for (const result of results) {
      const predicted = rankBlendNumbers(predictionRows, trendRows, result, options.top);
      const hitCount = predicted.filter((number) => actualDay.values.has(number)).length;
      result.evaluatedDays += 1;
      result.totalHits += hitCount;
      if (hitCount > 0) {
        result.hitDays += 1;
      }
      if (predicted.slice(0, 5).some((number) => actualDay.values.has(number))) {
        result.top5Hits += 1;
      }
    }
  }

  return results
    .map((result) => ({
      predictionWeight: result.predictionWeight,
      trendWeight: result.trendWeight,
      bothListBonus: result.bothListBonus,
      evaluatedDays: result.evaluatedDays,
      hitDays: result.hitDays,
      hitDayRate: formatPercent(result.hitDays / Math.max(result.evaluatedDays, 1)),
      totalHits: result.totalHits,
      averageHitsPerDay: (result.totalHits / Math.max(result.evaluatedDays, 1)).toFixed(2),
      top5HitRate: formatPercent(result.top5Hits / Math.max(result.evaluatedDays, 1)),
    }))
    .sort(
      (left, right) =>
        Number(right.averageHitsPerDay) - Number(left.averageHitsPerDay) ||
        parsePercent(right.hitDayRate) - parsePercent(left.hitDayRate) ||
        parsePercent(right.top5HitRate) - parsePercent(left.top5HitRate),
    );
}

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
  const predictionRankScores = buildRankScoreMap(predictionRows);
  const trendRankScores = buildRankScoreMap(trendRows);
  const numbers = new Set([...predictionByNumber.keys(), ...trendByNumber.keys()]);
  const weights = await getLatestPredictionLearningWeights();

  return Array.from(numbers)
    .map((number) => {
      const prediction = predictionByNumber.get(number);
      const trend = trendByNumber.get(number);
      const predictionScore = predictionRankScores.get(number) ?? 0;
      const trendScore = trendRankScores.get(number) ?? 0;
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

  return rankTrendCandidates(buildCandidates('last2'), dailyHits, options)
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

function rankTrendCandidates(candidates: string[], dailyHits: DailyHits[], options: MienBacLast2TrendOptions): TrendCandidate[] {
  const totalDays = options.recentDays + options.baselineDays;
  const recentDays = dailyHits.slice(-options.recentDays);
  const baselineDays = dailyHits.slice(Math.max(0, dailyHits.length - options.recentDays - options.baselineDays), -options.recentDays);
  const latestDay = dailyHits[dailyHits.length - 1];

  return candidates
    .map((candidate) => {
      const recentCount = countHits(candidate, recentDays);
      const baselineCount = countHits(candidate, baselineDays);
      const recentRate = recentCount / Math.max(recentDays.length, 1);
      const baselineRate = baselineCount / Math.max(baselineDays.length, 1);
      const smoothedBaselineRate = (baselineCount + 1) / (Math.max(baselineDays.length, 1) + 100);
      const trendLift = recentRate / smoothedBaselineRate;
      const lastSeenDate = findLastSeenDate(candidate, dailyHits);
      const gapDays = lastSeenDate ? diffDays(latestDay.date, lastSeenDate) : totalDays;
      const readinessScore = calculateNextDayReadinessScore(gapDays);
      const trendScore = clamp(
        normalize(trendLift, 3) * 0.65 + normalize(recentRate, 0.35) * 0.25 + readinessScore * 0.1,
        0,
        1,
      );

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
    .slice(0, options.top);
}

function rankBlendNumbers(
  predictionRows: ScoredCandidate[],
  trendRows: TrendCandidate[],
  weights: Pick<PredictionLearningWeights, 'predictionWeight' | 'trendWeight' | 'bothListBonus'>,
  top: number,
): string[] {
  const predictionByNumber = new Map(predictionRows.map((row) => [row.number, row]));
  const trendByNumber = new Map(trendRows.map((row) => [row.number, row]));
  const predictionRankScores = buildRankScoreMap(predictionRows);
  const trendRankScores = buildRankScoreMap(trendRows);
  const numbers = new Set([...predictionByNumber.keys(), ...trendByNumber.keys()]);

  return Array.from(numbers)
    .map((number) => {
      const prediction = predictionByNumber.get(number);
      const trend = trendByNumber.get(number);
      const bothBonus = prediction && trend ? weights.bothListBonus : 0;
      const predictionScore = predictionRankScores.get(number) ?? 0;
      const trendScore = trendRankScores.get(number) ?? 0;
      const combinedScore = clamp(
        predictionScore * weights.predictionWeight + trendScore * weights.trendWeight + bothBonus,
        0,
        1,
      );

      return {
        number,
        combinedScore,
        predictionScore,
        trendScore,
      };
    })
    .sort(
      (left, right) =>
        right.combinedScore - left.combinedScore ||
        right.predictionScore - left.predictionScore ||
        right.trendScore - left.trendScore ||
        left.number.localeCompare(right.number),
    )
    .slice(0, top)
    .map((row) => row.number);
}

function buildRankScoreMap<T extends { number: string }>(rows: T[]): Map<string, number> {
  const denominator = Math.max(rows.length - 1, 1);
  return new Map(rows.map((row, index) => [row.number, 1 - index / denominator]));
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
  const learnedWeights = await getLatestPredictionLearningWeights();
  const bayesianWeights = pickBayesianWeights(learnedWeights);
  const firstTestIndex = Math.max(1, dailyHits.length - options.testDays);
  const days: MienBacPredictionBacktestDay[] = [];

  for (let dayIndex = firstTestIndex; dayIndex < dailyHits.length; dayIndex += 1) {
    const actualDay = dailyHits[dayIndex];
    const trainingDays = dailyHits.slice(Math.max(0, dayIndex - options.historyDays), dayIndex);

    if (trainingDays.length === 0) {
      continue;
    }

    const predicted = rankCandidates(candidates, trainingDays, options.top, bayesianWeights).map((row) => row.number);
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
  const averageActualPerDay = totalActual / Math.max(evaluatedDays, 1);
  const candidateCount = options.target === 'last2' ? 100 : 1000;
  const randomBaselineAverage = options.top * averageActualPerDay / candidateCount;
  const randomMissProbability = hypergeometricMissProbability(candidateCount, averageActualPerDay, options.top);
  const modelAverage = totalHits / Math.max(evaluatedDays, 1);

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
    averageHitsPerDay: modelAverage.toFixed(2),
    randomBaselineAverageHitsPerDay: randomBaselineAverage.toFixed(2),
    liftVsRandom: formatPercent(modelAverage / Math.max(randomBaselineAverage, Number.EPSILON) - 1),
    randomBaselineHitDayRate: formatPercent(1 - randomMissProbability),
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
  const learnedWeights = await getLatestPredictionLearningWeights();
  const scored = rankCandidates(candidates, dailyHits, options.top, pickBayesianWeights(learnedWeights));

  return scored
    .map((row, index) => ({
      rank: index + 1,
      number: row.number,
      count: row.count,
      lastSeenDate: row.lastSeenDate,
      gapDays: row.gapDays,
      score: formatScore(row.score),
      repeatPenalty: formatScore(row.repeatPenalty),
      frequencyScore: formatScore(row.frequencyScore),
      recentScore: formatScore(row.recentScore),
      trendScore: formatScore(row.trendScore),
      recencyScore: formatScore(row.recencyScore),
      gapScore: formatScore(row.gapScore),
      weekdayScore: formatScore(row.weekdayScore),
      markovScore: formatScore(row.markovScore),
    }));
}

function rankCandidates(
  candidates: string[],
  dailyHits: DailyHits[],
  top: number,
  weights: BayesianPredictionWeights = pickBayesianWeights(DEFAULT_PREDICTION_LEARNING_WEIGHTS),
): ScoredCandidate[] {
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

function scoreCandidate(
  candidate: string,
  dailyHits: DailyHits[],
  weights: BayesianPredictionWeights,
): ScoredCandidate {
  const signals = calculateCandidateSignals(candidate, dailyHits);
  const bayesianScore = calculateBayesianProbabilityScore(candidate, dailyHits, weights);
  const repeatPenalty = calculateRepeatPenalty(signals.gapDays);
  const score = bayesianScore * repeatPenalty;

  return {
    ...signals,
    score,
    repeatPenalty,
  };
}

/**
 * Reduces short-term hot-number bias without excluding repeat occurrences.
 *
 * A candidate seen on the latest draw receives the strongest discount because
 * that same hit also raises its 14-day and 30-day Bayesian signals. The penalty
 * fades quickly and disappears after three draw days.
 */
function calculateRepeatPenalty(gapDays: number): number {
  if (gapDays <= 0) return 0.55;
  if (gapDays === 1) return 0.75;
  if (gapDays === 2) return 0.9;
  return 1;
}

/**
 * Estimates the next-draw occurrence probability with Beta-Binomial shrinkage.
 *
 * Lottery histories are short relative to the number of candidates. Raw hot/cold
 * rates therefore overreact to noise. Each window is pulled toward the observed
 * market-wide occurrence rate; shorter windows receive stronger regularisation.
 * The weights are fixed before the backtest, so no part of the test day is used
 * to choose or calibrate them.
 */
function calculateBayesianProbabilityScore(
  candidate: string,
  dailyHits: DailyHits[],
  weights: BayesianPredictionWeights,
): number {
  const totalDays = dailyHits.length;
  const universeSize = inferUniverseSize(candidate);
  const prior = clamp(
    dailyHits.reduce((sum, day) => sum + day.values.size, 0) / Math.max(totalDays * universeSize, 1),
    1 / universeSize,
    0.95,
  );
  const latestDate = dailyHits[dailyHits.length - 1].date;
  const tomorrowDayOfWeek = new Date(`${shiftDate(latestDate, 1)}T00:00:00.000Z`).getUTCDay();
  const matchingWeekdays = dailyHits.filter((day) => day.dayOfWeek === tomorrowDayOfWeek);

  const probabilitySignals: ProbabilitySignals = {
    longTerm: smoothedOccurrenceRate(candidate, dailyHits, prior, 120),
    mediumTerm: smoothedOccurrenceRate(candidate, dailyHits.slice(-90), prior, 70),
    shortTerm: smoothedOccurrenceRate(candidate, dailyHits.slice(-30), prior, 45),
    veryRecent: smoothedOccurrenceRate(candidate, dailyHits.slice(-14), prior, 35),
    weekday: smoothedOccurrenceRate(candidate, matchingWeekdays, prior, 45),
  };

  return clamp(
    probabilitySignals.longTerm * weights.bayesianLongTermWeight +
      probabilitySignals.mediumTerm * weights.bayesianMediumTermWeight +
      probabilitySignals.shortTerm * weights.bayesianShortTermWeight +
      probabilitySignals.veryRecent * weights.bayesianVeryRecentWeight +
      probabilitySignals.weekday * weights.bayesianWeekdayWeight,
    0,
    1,
  );
}

function pickBayesianWeights(weights: PredictionLearningWeights): BayesianPredictionWeights {
  return {
    bayesianLongTermWeight: weights.bayesianLongTermWeight,
    bayesianMediumTermWeight: weights.bayesianMediumTermWeight,
    bayesianShortTermWeight: weights.bayesianShortTermWeight,
    bayesianVeryRecentWeight: weights.bayesianVeryRecentWeight,
    bayesianWeekdayWeight: weights.bayesianWeekdayWeight,
  };
}

function smoothedOccurrenceRate(candidate: string, days: DailyHits[], prior: number, priorStrength: number): number {
  return (countHits(candidate, days) + prior * priorStrength) / (days.length + priorStrength);
}

function inferUniverseSize(candidate: string): number {
  return candidate.length === 2 ? 100 : 1000;
}

function calculateCandidateSignals(
  candidate: string,
  dailyHits: DailyHits[],
): Omit<ScoredCandidate, 'score' | 'repeatPenalty'> {
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
  const recencyScore = calculateNextDayReadinessScore(gapDays);
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

function calculateNextDayReadinessScore(gapDays: number): number {
  if (gapDays <= 0) {
    return 0.05;
  }

  if (gapDays === 1) {
    return 0.25;
  }

  const idealGapDays = 8;
  const spread = 14;
  return clamp(Math.exp(-((gapDays - idealGapDays) ** 2) / (2 * spread * spread)), 0, 1);
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

function parsePercent(value: string): number {
  return Number(value.replace('%', ''));
}

function hypergeometricMissProbability(universeSize: number, actualCount: number, picks: number): number {
  const roundedActualCount = Math.max(0, Math.min(universeSize, Math.round(actualCount)));
  const safePicks = Math.max(0, Math.min(universeSize, picks));
  let probability = 1;

  for (let index = 0; index < safePicks; index += 1) {
    probability *= (universeSize - roundedActualCount - index) / (universeSize - index);
  }

  return clamp(probability, 0, 1);
}
