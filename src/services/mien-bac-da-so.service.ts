import { LotteryNumberMienBacModel } from '../models/LotteryNumber';
import { DaSoLearningWeightModel } from '../models/DaSoLearningWeight';
import {
  buildCandidates,
  DailyHits,
  pickBayesianWeights,
  rankCandidates,
  ScoredCandidate,
} from './mien-bac-prediction.service';
import { getLatestPredictionLearningWeights } from './prediction-learning-weight.service';

export interface MienBacDaSoOptions {
  historyDays: number;
  numberTop?: number;
  candidatePool?: number;
  pairTop?: number;
  throughDate?: string;
  weights?: DaSoWeights;
  predictionWeights?: ReturnType<typeof pickBayesianWeights>;
  targetDate?: string;
  selectionIndividualWeight?: number;
}

export interface DaSoWeights { individual: number; coOccurrence: number; recentCoOccurrence: number; associationLift: number; }
export const MIEN_BAC_DA_SO_MODEL_VERSION = 'mien-bac-last2-da-so-v1';
export const DEFAULT_DA_SO_WEIGHTS: DaSoWeights = { individual: 0.4, coOccurrence: 0.35, recentCoOccurrence: 0.15, associationLift: 0.1 };

export interface MienBacDaSoNumberRow {
  rank: number;
  number: string;
  individualScore: string;
  selectionScore: string;
}

export interface MienBacDaSoPairRow {
  rank: number;
  pair: string;
  numberA: string;
  numberB: string;
  score: string;
  individualScore: string;
  coOccurrenceScore: string;
  recentCoOccurrenceScore: string;
  liftScore: string;
  coOccurrenceCount: number;
  recentCoOccurrenceCount: number;
  estimatedPairRate: string;
  associationLift: string;
}

export interface MienBacDaSoPrediction {
  throughDate: string;
  historyDays: number;
  evaluatedHistoryDays: number;
  candidatePool: number;
  formula: string;
  weights: DaSoWeights;
  numbers: MienBacDaSoNumberRow[];
  pairs: MienBacDaSoPairRow[];
}

export interface MienBacDaSoBacktestDay {
  date: string;
  selectedNumbers: string;
  pairHits: number;
  topPairHit: string;
  hitPairs: string;
}

export interface MienBacDaSoBacktestResult {
  historyDays: number;
  testDays: number;
  pairTop: number;
  evaluatedDays: number;
  hitDays: number;
  hitDayRate: string;
  averagePairHitsPerDay: string;
  topPairHitRate: string;
  randomBaselineAveragePairHitsPerDay: string;
  randomBaselineHitDayRate: string;
  randomBaselineTopPairHitRate: string;
  liftVsRandom: string;
  days: MienBacDaSoBacktestDay[];
}

interface PairScore {
  numberA: string;
  numberB: string;
  score: number;
  individualScore: number;
  coOccurrenceScore: number;
  recentCoOccurrenceScore: number;
  liftScore: number;
  coOccurrenceCount: number;
  recentCoOccurrenceCount: number;
  estimatedPairRate: number;
  associationLift: number;
}

interface RankedSelection {
  candidates: ScoredCandidate[];
  pairs: PairScore[];
}

interface HistoryRow {
  date: string;
  last2: string;
}

export function formatDaSoFormula(weights: DaSoWeights): string { return `pairScore = ${weights.individual.toFixed(2)}*individual + ${weights.coOccurrence.toFixed(2)}*bayesianCoOccurrence + ${weights.recentCoOccurrence.toFixed(2)}*recentCoOccurrence + ${weights.associationLift.toFixed(2)}*associationLift`; }

export async function getMienBacDaSoPrediction(options: MienBacDaSoOptions): Promise<MienBacDaSoPrediction | undefined> {
  validateOptions(options);
  const latest = await LotteryNumberMienBacModel.findOne({
    province: 'xsmb',
    ...(options.throughDate ? { date: { $lte: options.throughDate } } : {}),
  })
    .sort({ date: -1 })
    .select({ date: 1 })
    .lean()
    .exec();
  if (!latest?.date) return undefined;

  const rows = await loadRows(shiftDate(latest.date, -(options.historyDays - 1)), latest.date);
  const dailyHits = buildDailyHits(rows);
  if (dailyHits.length === 0) return undefined;

  const resolvedOptions = { ...options, weights: options.weights ?? await getLatestDaSoWeights() };
  const selection = await rankSelection(dailyHits, resolvedOptions);
  return formatPrediction(latest.date, dailyHits.length, resolvedOptions, selection);
}

export async function buildDaSoPredictionFromDailyHits(
  dailyHits: DailyHits[],
  throughDate: string,
  options: MienBacDaSoOptions,
): Promise<MienBacDaSoPrediction | undefined> {
  validateOptions(options);
  if (dailyHits.length === 0) return undefined;
  const resolvedOptions = { ...options, weights: options.weights ?? DEFAULT_DA_SO_WEIGHTS };
  const selection = await rankSelection(dailyHits, resolvedOptions);
  return formatPrediction(throughDate, dailyHits.length, resolvedOptions, selection);
}

export async function backtestMienBacDaSo(options: MienBacDaSoOptions & { testDays: number }): Promise<MienBacDaSoBacktestResult | undefined> {
  validateOptions(options);
  if (!Number.isInteger(options.testDays) || options.testDays <= 0) throw new Error('testDays must be a positive integer.');
  const latest = await LotteryNumberMienBacModel.findOne({
    province: 'xsmb',
    ...(options.throughDate ? { date: { $lte: options.throughDate } } : {}),
  })
    .sort({ date: -1 })
    .select({ date: 1 })
    .lean()
    .exec();
  if (!latest?.date) return undefined;

  const rows = await loadRows(shiftDate(latest.date, -(options.historyDays + options.testDays - 1)), latest.date);
  const allDays = buildDailyHits(rows);
  if (allDays.length <= 1) return undefined;

  const firstTestIndex = Math.max(1, allDays.length - options.testDays);
  const days: MienBacDaSoBacktestDay[] = [];
  let randomPairHits = 0;
  let randomHitDayProbability = 0;
  let randomTopPairHitProbability = 0;
  const pairTop = options.pairTop ?? 10;
  const resolvedOptions = { ...options, weights: options.weights ?? await getLatestDaSoWeights() };

  for (let index = firstTestIndex; index < allDays.length; index += 1) {
    const trainingDays = allDays.slice(Math.max(0, index - options.historyDays), index);
    if (trainingDays.length === 0) continue;
    const selection = await rankSelection(trainingDays, resolvedOptions);
    const predictedPairs = selection.pairs.slice(0, pairTop);
    const actual = allDays[index].values;
    const hits = predictedPairs.filter((pair) => actual.has(pair.numberA) && actual.has(pair.numberB));
    days.push({
      date: allDays[index].date,
      selectedNumbers: selection.candidates.map((row) => row.number).join(', '),
      pairHits: hits.length,
      topPairHit: hits.some((pair) => pair === predictedPairs[0]) ? 'yes' : 'no',
      hitPairs: hits.map((pair) => pairKey(pair.numberA, pair.numberB)).join(', ') || '-',
    });

    const actualPairCount = choose2(actual.size);
    randomPairHits += pairTop * actualPairCount / choose2(100);
    randomHitDayProbability += pairTop === choose2(5)
      ? 1 - hypergeometricProbabilityLessThanTwo(100, actual.size, 5)
      : 1 - hypergeometricMissProbability(choose2(100), actualPairCount, pairTop);
    randomTopPairHitProbability += actualPairCount / choose2(100);
  }

  const evaluatedDays = days.length;
  const hitDays = days.filter((day) => day.pairHits > 0).length;
  const totalPairHits = days.reduce((sum, day) => sum + day.pairHits, 0);
  const modelAverage = totalPairHits / Math.max(evaluatedDays, 1);
  const baselineAverage = randomPairHits / Math.max(evaluatedDays, 1);
  return {
    historyDays: options.historyDays,
    testDays: options.testDays,
    pairTop,
    evaluatedDays,
    hitDays,
    hitDayRate: percent(hitDays / Math.max(evaluatedDays, 1)),
    averagePairHitsPerDay: modelAverage.toFixed(3),
    topPairHitRate: percent(days.filter((day) => day.topPairHit === 'yes').length / Math.max(evaluatedDays, 1)),
    randomBaselineAveragePairHitsPerDay: baselineAverage.toFixed(3),
    randomBaselineHitDayRate: percent(randomHitDayProbability / Math.max(evaluatedDays, 1)),
    randomBaselineTopPairHitRate: percent(randomTopPairHitProbability / Math.max(evaluatedDays, 1)),
    liftVsRandom: percent(modelAverage / Math.max(baselineAverage, Number.EPSILON) - 1),
    days,
  };
}

async function rankSelection(dailyHits: DailyHits[], options: MienBacDaSoOptions): Promise<RankedSelection> {
  const numberTop = options.numberTop ?? 5;
  const candidatePool = Math.max(numberTop, options.candidatePool ?? 20);
  const predictionWeights = options.predictionWeights
    ?? pickBayesianWeights(await getLatestPredictionLearningWeights());
  const pool = rankCandidates(
    buildCandidates('last2'),
    dailyHits,
    candidatePool,
    predictionWeights,
    0.05,
    options.targetDate,
  );
  const normalized = normalizeCandidateScores(pool);
  const weights = options.weights ?? await getLatestDaSoWeights();
  const allPairs = buildPairScores(pool, normalized, dailyHits, weights);
  const pairMap = new Map(allPairs.map((pair) => [pairKey(pair.numberA, pair.numberB), pair]));

  let best: ScoredCandidate[] = [];
  let bestScore = Number.NEGATIVE_INFINITY;
  forEachCombination(pool, numberTop, (combination) => {
    const individual = average(combination.map((row) => normalized.get(row.number) ?? 0));
    const pairs = pairsFor(combination, pairMap);
    const individualWeight = options.selectionIndividualWeight ?? 0.5;
    const score = individualWeight * individual + (1 - individualWeight) * average(pairs.map((pair) => pair.score));
    if (score > bestScore) {
      bestScore = score;
      best = combination;
    }
  });

  const selectedPairs = pairsFor(best, pairMap).sort((left, right) => right.score - left.score || pairKey(left.numberA, left.numberB).localeCompare(pairKey(right.numberA, right.numberB)));
  return { candidates: best, pairs: selectedPairs };
}

function buildPairScores(pool: ScoredCandidate[], normalized: Map<string, number>, days: DailyHits[], weights: DaSoWeights): PairScore[] {
  const recent = days.slice(-30);
  const raw = pairsFor(pool).map(([left, right]) => {
    const leftRate = occurrenceRate(left.number, days);
    const rightRate = occurrenceRate(right.number, days);
    const independentRate = Math.max(leftRate * rightRate, 1 / choose2(100));
    const coOccurrenceCount = countBoth(left.number, right.number, days);
    const recentCoOccurrenceCount = countBoth(left.number, right.number, recent);
    const estimatedPairRate = (coOccurrenceCount + 30 * independentRate) / (days.length + 30);
    const recentPairRate = (recentCoOccurrenceCount + 15 * independentRate) / (recent.length + 15);
    const associationLift = estimatedPairRate / independentRate;
    return { left, right, coOccurrenceCount, recentCoOccurrenceCount, estimatedPairRate, recentPairRate, associationLift };
  });
  const maxLong = Math.max(...raw.map((row) => row.estimatedPairRate), Number.EPSILON);
  const maxRecent = Math.max(...raw.map((row) => row.recentPairRate), Number.EPSILON);
  return raw.map((row) => {
    const individualScore = average([normalized.get(row.left.number) ?? 0, normalized.get(row.right.number) ?? 0]);
    const coOccurrenceScore = row.estimatedPairRate / maxLong;
    const recentCoOccurrenceScore = row.recentPairRate / maxRecent;
    const liftScore = clamp(row.associationLift / 3, 0, 1);
    return {
      numberA: row.left.number,
      numberB: row.right.number,
      score: weights.individual * individualScore + weights.coOccurrence * coOccurrenceScore + weights.recentCoOccurrence * recentCoOccurrenceScore + weights.associationLift * liftScore,
      individualScore,
      coOccurrenceScore,
      recentCoOccurrenceScore,
      liftScore,
      coOccurrenceCount: row.coOccurrenceCount,
      recentCoOccurrenceCount: row.recentCoOccurrenceCount,
      estimatedPairRate: row.estimatedPairRate,
      associationLift: row.associationLift,
    };
  });
}

function formatPrediction(throughDate: string, evaluatedHistoryDays: number, options: MienBacDaSoOptions, selection: RankedSelection): MienBacDaSoPrediction {
  const selectionScores = new Map<string, number>();
  for (const number of selection.candidates) {
    const related = selection.pairs.filter((pair) => pair.numberA === number.number || pair.numberB === number.number);
    selectionScores.set(number.number, average(related.map((pair) => pair.score)));
  }
  const weights = options.weights ?? DEFAULT_DA_SO_WEIGHTS;
  return {
    throughDate,
    historyDays: options.historyDays,
    evaluatedHistoryDays,
    candidatePool: Math.max(options.numberTop ?? 5, options.candidatePool ?? 20),
    formula: formatDaSoFormula(weights),
    weights,
    numbers: [...selection.candidates]
      .sort((left, right) => (selectionScores.get(right.number) ?? 0) - (selectionScores.get(left.number) ?? 0))
      .map((row, index) => ({ rank: index + 1, number: row.number, individualScore: row.score.toFixed(6), selectionScore: (selectionScores.get(row.number) ?? 0).toFixed(6) })),
    pairs: selection.pairs.slice(0, options.pairTop ?? 10).map((row, index) => ({
      rank: index + 1,
      pair: pairKey(row.numberA, row.numberB),
      numberA: row.numberA,
      numberB: row.numberB,
      score: row.score.toFixed(6),
      individualScore: row.individualScore.toFixed(6),
      coOccurrenceScore: row.coOccurrenceScore.toFixed(6),
      recentCoOccurrenceScore: row.recentCoOccurrenceScore.toFixed(6),
      liftScore: row.liftScore.toFixed(6),
      coOccurrenceCount: row.coOccurrenceCount,
      recentCoOccurrenceCount: row.recentCoOccurrenceCount,
      estimatedPairRate: percent(row.estimatedPairRate),
      associationLift: row.associationLift.toFixed(3),
    })),
  };
}

async function loadRows(fromDate: string, throughDate: string): Promise<HistoryRow[]> {
  return LotteryNumberMienBacModel.find({ province: 'xsmb', date: { $gte: fromDate, $lte: throughDate } })
    .select({ date: 1, last2: 1 })
    .sort({ date: 1 })
    .lean<HistoryRow[]>()
    .exec();
}

function buildDailyHits(rows: HistoryRow[]): DailyHits[] {
  const grouped = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!grouped.has(row.date)) grouped.set(row.date, new Set());
    grouped.get(row.date)?.add(row.last2);
  }
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, values]) => ({ date, dayOfWeek: new Date(`${date}T00:00:00.000Z`).getUTCDay(), values }));
}

function normalizeCandidateScores(rows: ScoredCandidate[]): Map<string, number> {
  const min = Math.min(...rows.map((row) => row.score));
  const max = Math.max(...rows.map((row) => row.score));
  return new Map(rows.map((row) => [row.number, (row.score - min) / Math.max(max - min, Number.EPSILON)]));
}

function pairsFor(rows: ScoredCandidate[]): Array<[ScoredCandidate, ScoredCandidate]>;
function pairsFor(rows: ScoredCandidate[], map: Map<string, PairScore>): PairScore[];
function pairsFor(rows: ScoredCandidate[], map?: Map<string, PairScore>): Array<PairScore | [ScoredCandidate, ScoredCandidate]> {
  const result: Array<PairScore | [ScoredCandidate, ScoredCandidate]> = [];
  for (let left = 0; left < rows.length; left += 1) for (let right = left + 1; right < rows.length; right += 1) {
    if (map) {
      const pair = map.get(pairKey(rows[left].number, rows[right].number));
      if (pair) result.push(pair);
    } else result.push([rows[left], rows[right]]);
  }
  return result;
}

function forEachCombination<T>(items: T[], size: number, visit: (items: T[]) => void): void {
  const chosen: T[] = [];
  const walk = (start: number): void => {
    if (chosen.length === size) return visit([...chosen]);
    for (let index = start; index <= items.length - (size - chosen.length); index += 1) {
      chosen.push(items[index]);
      walk(index + 1);
      chosen.pop();
    }
  };
  walk(0);
}

function countBoth(a: string, b: string, days: DailyHits[]): number { return days.filter((day) => day.values.has(a) && day.values.has(b)).length; }
function occurrenceRate(number: string, days: DailyHits[]): number { return days.filter((day) => day.values.has(number)).length / Math.max(days.length, 1); }
function pairKey(a: string, b: string): string { return [a, b].sort().join('-'); }
function average(values: number[]): number { return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1); }
function choose2(value: number): number { return value * (value - 1) / 2; }
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
function percent(value: number): string { return `${(value * 100).toFixed(2)}%`; }
function shiftDate(date: string, days: number): string { const value = new Date(`${date}T00:00:00.000Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
function hypergeometricProbabilityLessThanTwo(universe: number, successes: number, draws: number): number {
  const combination = (n: number, k: number): number => {
    if (k < 0 || k > n) return 0;
    let result = 1;
    for (let index = 1; index <= k; index += 1) result = result * (n - k + index) / index;
    return result;
  };
  const denominator = combination(universe, draws);
  return (combination(successes, 0) * combination(universe - successes, draws) + combination(successes, 1) * combination(universe - successes, draws - 1)) / denominator;
}
function hypergeometricMissProbability(universe: number, successes: number, draws: number): number {
  let probability = 1;
  for (let index = 0; index < draws; index += 1) probability *= (universe - successes - index) / (universe - index);
  return clamp(probability, 0, 1);
}
function validateOptions(options: MienBacDaSoOptions): void {
  for (const [name, value] of [['historyDays', options.historyDays], ['numberTop', options.numberTop ?? 5], ['candidatePool', options.candidatePool ?? 20], ['pairTop', options.pairTop ?? 10]] as const) {
    if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`);
  }
  if ((options.numberTop ?? 5) < 2) throw new Error('numberTop must be at least 2.');
  if ((options.pairTop ?? 10) > choose2(options.numberTop ?? 5)) throw new Error('pairTop cannot exceed the number of pairs produced by numberTop.');
  if (options.selectionIndividualWeight !== undefined && (options.selectionIndividualWeight < 0 || options.selectionIndividualWeight > 1)) throw new Error('selectionIndividualWeight must be between 0 and 1.');
  if (options.weights) {
    const total = Object.values(options.weights).reduce((sum, value) => sum + value, 0);
    if (Object.values(options.weights).some((value) => !Number.isFinite(value) || value < 0) || Math.abs(total - 1) > 0.0001) throw new Error('Da so weights must be non-negative and sum to 1.');
  }
}

export async function getLatestDaSoWeights(): Promise<DaSoWeights> {
  const row = await DaSoLearningWeightModel.findOne({ modelVersion: MIEN_BAC_DA_SO_MODEL_VERSION }).sort({ effectiveFromDate: -1, createdAt: -1 }).lean().exec();
  return row ? { individual: row.individualWeight, coOccurrence: row.coOccurrenceWeight, recentCoOccurrence: row.recentCoOccurrenceWeight, associationLift: row.associationLiftWeight } : { ...DEFAULT_DA_SO_WEIGHTS };
}
