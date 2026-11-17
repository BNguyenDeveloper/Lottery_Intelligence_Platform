import { LotteryNumberMienBacModel } from '../models/LotteryNumber';
import { BayesianPredictionWeights, buildCandidates, DailyHits, pickBayesianWeights, rankCandidates } from './mien-bac-prediction.service';
import { getLatestPredictionLearningWeights } from './prediction-learning-weight.service';

export const MIEN_BAC_TRANSITION_MODEL_VERSION = 'mien-bac-last2-transition-residual-v2-experimental';
export const MIEN_BAC_TRANSITION_FORMULA =
  'finalScore = z(baseScore) + lambda*z(reliabilityWeightedLogOddsResidual); lambda may be 0';
export const TRANSITION_MULTI_HIT_TOP1_TOP5_THRESHOLD = 0.94;
export const TRANSITION_MULTI_HIT_TOP1_TOP2_THRESHOLD = 0.47;
export const TRANSITION_MULTI_HIT_AVERAGE_Z_THRESHOLD = 0.33;

export interface MienBacTransitionConfig {
  priorStrength: number;
  topEdges: number;
  lags: number[];
  lagWeights: number[];
  lambda: number;
}

export const DEFAULT_MIEN_BAC_TRANSITION_CONFIG: MienBacTransitionConfig = {
  priorStrength: 60,
  topEdges: 5,
  lags: [1, 2, 3],
  lagWeights: [0.6, 0.25, 0.15],
  lambda: 0.1,
};

interface HistoryRow { date: string; last2: string }

export interface MienBacTransitionPredictionRow {
  rank: number;
  number: string;
  finalScore: string;
  baseScore: string;
  baseZScore: string;
  transitionResidual: string;
  transitionZScore: string;
  supportingEdges: number;
  drawsSinceLastSeen: number;
  historyDraws: number;
}

export interface MienBacTransitionMultiHitSignal {
  level: 'STRONG' | 'FAIR' | 'NORMAL';
  filterStatus: 'QUALIFIES' | 'WATCH' | 'SKIP';
  conditionsPassed: number;
  top1Top5Spread: string;
  top1Top2Gap: string;
  averageTransitionZ: string;
  transitionContribution: 'Enabled' | 'Disabled (lambda=0)';
  conclusion: string;
  experimentalPlayFilter: MienBacTransitionPlayFilter;
}

export interface MienBacTransitionPlayFilter {
  status: 'PLAY' | 'SKIP';
  spreadPassed: boolean;
  gapPassed: boolean;
  transitionZNotOverheated: boolean;
  conclusion: string;
}

interface TransitionSignal { residual: number; supportingEdges: number }

export async function predictMienBacTransitionMatrix(options: {
  historyDays: number;
  targetDate: string;
  top?: number;
  config?: Partial<MienBacTransitionConfig>;
}): Promise<MienBacTransitionPredictionRow[]> {
  const fromDate = shiftDate(options.targetDate, -(options.historyDays - 1));
  const rows = await LotteryNumberMienBacModel.find({ province: 'xsmb', date: { $gte: fromDate, $lt: options.targetDate } })
    .select({ date: 1, last2: 1 }).sort({ date: 1 }).lean<HistoryRow[]>().exec();
  const weights = pickBayesianWeights(await getLatestPredictionLearningWeights());
  return rankMienBacTransitionMatrix(buildDailyHits(rows), options.top ?? 5, weights, options.targetDate, resolveConfig(options.config));
}

export function rankMienBacTransitionMatrix(
  dailyHits: DailyHits[],
  top = 5,
  weights?: BayesianPredictionWeights,
  targetDate?: string,
  config: MienBacTransitionConfig = DEFAULT_MIEN_BAC_TRANSITION_CONFIG,
): MienBacTransitionPredictionRow[] {
  const resolved = resolveConfig(config);
  if (dailyHits.length <= Math.max(...resolved.lags)) return [];
  const candidates = buildCandidates('last2');
  const baseRows = rankCandidates(candidates, dailyHits, candidates.length, weights, 0.05, targetDate);
  const baseByNumber = new Map(baseRows.map((row) => [row.number, row.score]));
  const transitionByNumber = buildTransitionSignals(dailyHits, candidates, resolved);
  const baseStats = stats(candidates.map((number) => baseByNumber.get(number) ?? 0));
  const transitionStats = stats(candidates.map((number) => transitionByNumber.get(number)?.residual ?? 0));

  return candidates.map((number) => {
    const baseScore = baseByNumber.get(number) ?? 0;
    const transition = transitionByNumber.get(number) ?? { residual: 0, supportingEdges: 0 };
    const baseZScore = zScore(baseScore, baseStats);
    const transitionZScore = zScore(transition.residual, transitionStats);
    return { number, baseScore, baseZScore, transitionResidual: transition.residual, transitionZScore,
      finalScore: baseZScore + resolved.lambda * transitionZScore, supportingEdges: transition.supportingEdges };
  }).sort((left, right) => right.finalScore - left.finalScore || right.baseScore - left.baseScore || left.number.localeCompare(right.number))
    .slice(0, top)
    .map((row, index) => ({ rank: index + 1, number: row.number, finalScore: format(row.finalScore),
      baseScore: format(row.baseScore), baseZScore: format(row.baseZScore), transitionResidual: format(row.transitionResidual),
      transitionZScore: format(row.transitionZScore), supportingEdges: row.supportingEdges,
      drawsSinceLastSeen: countDrawsSinceLastSeen(row.number, dailyHits), historyDraws: dailyHits.length }));
}

function countDrawsSinceLastSeen(candidate: string, draws: DailyHits[]): number {
  for (let index = draws.length - 1; index >= 0; index -= 1) {
    if (draws[index].values.has(candidate)) return draws.length - index - 1;
  }
  return draws.length;
}

function buildTransitionSignals(dailyHits: DailyHits[], candidates: string[], config: MienBacTransitionConfig): Map<string, TransitionSignal> {
  const result = new Map(candidates.map((number) => [number, { residual: 0, supportingEdges: 0 }]));
  const normalizedLagWeights = normalizeWeights(config.lagWeights);
  config.lags.forEach((lag, lagIndex) => {
    const destinationDays = dailyHits.slice(lag);
    const baselineCounts = new Map(candidates.map((number) => [number, 0]));
    const sourceCounts = new Map<string, number>();
    const transitionCounts = new Map<string, Map<string, number>>();
    for (let index = lag; index < dailyHits.length; index += 1) {
      const previous = dailyHits[index - lag].values;
      const current = dailyHits[index].values;
      for (const target of current) baselineCounts.set(target, (baselineCounts.get(target) ?? 0) + 1);
      for (const source of previous) {
        sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
        const targets = transitionCounts.get(source) ?? new Map<string, number>();
        for (const target of current) targets.set(target, (targets.get(target) ?? 0) + 1);
        transitionCounts.set(source, targets);
      }
    }
    const latestSources = dailyHits[dailyHits.length - lag].values;
    for (const target of candidates) {
      const baseline = clamp((baselineCounts.get(target) ?? 0) / Math.max(destinationDays.length, 1), 1e-6, 1 - 1e-6);
      const edges = [...latestSources].flatMap((source) => {
        const sourceTotal = sourceCounts.get(source) ?? 0;
        if (sourceTotal === 0) return [];
        const count = transitionCounts.get(source)?.get(target) ?? 0;
        const conditional = clamp((count + config.priorStrength * baseline) / (sourceTotal + config.priorStrength), 1e-6, 1 - 1e-6);
        const reliability = sourceTotal / (sourceTotal + config.priorStrength);
        return [reliability * (logit(conditional) - logit(baseline))];
      });
      const positive = edges.filter((edge) => edge > 0).sort((left, right) => right - left).slice(0, config.topEdges);
      const current = result.get(target) as TransitionSignal;
      current.residual += normalizedLagWeights[lagIndex] * average(positive);
      current.supportingEdges += positive.length;
    }
  });
  return result;
}

export function buildMienBacDailyHits(rows: HistoryRow[]): DailyHits[] { return buildDailyHits(rows); }
export function resolveMienBacTransitionConfig(config?: Partial<MienBacTransitionConfig>): MienBacTransitionConfig { return resolveConfig(config); }

export function buildMienBacTransitionMultiHitSignal(
  rows: MienBacTransitionPredictionRow[],
  config: MienBacTransitionConfig,
): MienBacTransitionMultiHitSignal {
  const ranked = [...rows].sort((left, right) => left.rank - right.rank);
  const finalScores = ranked.map((row) => Number(row.finalScore));
  const transitionZScores = ranked.map((row) => Number(row.transitionZScore));
  const top1Top5Spread = finalScores.length >= 5 ? finalScores[0] - finalScores[4] : 0;
  const top1Top2Gap = finalScores.length >= 2 ? finalScores[0] - finalScores[1] : 0;
  const averageTransitionZ = transitionZScores.length > 0
    ? transitionZScores.reduce((sum, value) => sum + value, 0) / transitionZScores.length
    : 0;
  const conditionsPassed = [
    top1Top5Spread > TRANSITION_MULTI_HIT_TOP1_TOP5_THRESHOLD,
    top1Top2Gap > TRANSITION_MULTI_HIT_TOP1_TOP2_THRESHOLD,
    averageTransitionZ > TRANSITION_MULTI_HIT_AVERAGE_Z_THRESHOLD,
  ].filter(Boolean).length;
  const transitionEnabled = config.lambda > 0;
  const level: MienBacTransitionMultiHitSignal['level'] = transitionEnabled && conditionsPassed === 3
    ? 'STRONG'
    : transitionEnabled && conditionsPassed >= 2
      ? 'FAIR'
      : 'NORMAL';
  const filterStatus: MienBacTransitionMultiHitSignal['filterStatus'] = level === 'STRONG'
    ? 'QUALIFIES'
    : level === 'FAIR'
      ? 'WATCH'
      : 'SKIP';
  const conclusion = !transitionEnabled
    ? 'No strong >=2 indication: transition contribution is disabled, so transition residual does not affect Final score.'
    : level === 'STRONG'
      ? 'Strong experimental >=2 signal: all score-separation and transition conditions passed.'
      : level === 'FAIR'
        ? 'Fair experimental >=2 signal: two reference conditions passed.'
        : 'No strong >=2 indication: fewer than two reference conditions passed.';
  const experimentalPlayFilter = buildMienBacTransitionPlayFilter(top1Top5Spread, top1Top2Gap, averageTransitionZ);

  return {
    level,
    filterStatus,
    conditionsPassed,
    top1Top5Spread: top1Top5Spread.toFixed(6),
    top1Top2Gap: top1Top2Gap.toFixed(6),
    averageTransitionZ: averageTransitionZ.toFixed(6),
    transitionContribution: transitionEnabled ? 'Enabled' : 'Disabled (lambda=0)',
    conclusion,
    experimentalPlayFilter,
  };
}

export function buildMienBacTransitionPlayFilter(
  top1Top5Spread: number,
  top1Top2Gap: number,
  averageTransitionZ: number,
): MienBacTransitionPlayFilter {
  const spreadPassed = top1Top5Spread > TRANSITION_MULTI_HIT_TOP1_TOP5_THRESHOLD;
  const gapPassed = top1Top2Gap > TRANSITION_MULTI_HIT_TOP1_TOP2_THRESHOLD;
  const transitionZNotOverheated = averageTransitionZ <= TRANSITION_MULTI_HIT_AVERAGE_Z_THRESHOLD;
  const status = spreadPassed && gapPassed && transitionZNotOverheated ? 'PLAY' : 'SKIP';
  return {
    status,
    spreadPassed,
    gapPassed,
    transitionZNotOverheated,
    conclusion: status === 'PLAY'
      ? 'Experimental PLAY filter qualifies: both score-separation thresholds passed and Average Transition Z is not overheated.'
      : 'Experimental PLAY filter does not qualify for this draw.',
  };
}

function resolveConfig(config?: Partial<MienBacTransitionConfig>): MienBacTransitionConfig {
  const resolved = { ...DEFAULT_MIEN_BAC_TRANSITION_CONFIG, ...config };
  resolved.lags = [...resolved.lags];
  resolved.lagWeights = config?.lagWeights ? [...config.lagWeights] : defaultLagWeights(resolved.lags);
  if (!Number.isFinite(resolved.priorStrength) || resolved.priorStrength <= 0) throw new Error('priorStrength must be positive.');
  if (!Number.isInteger(resolved.topEdges) || resolved.topEdges <= 0) throw new Error('topEdges must be a positive integer.');
  if (!Number.isFinite(resolved.lambda) || resolved.lambda < 0) throw new Error('lambda must be non-negative.');
  if (resolved.lags.length === 0 || resolved.lags.some((lag) => !Number.isInteger(lag) || lag <= 0)) throw new Error('lags must contain positive integers.');
  if (resolved.lagWeights.length !== resolved.lags.length || resolved.lagWeights.some((weight) => weight < 0)) throw new Error('lagWeights must match lags and be non-negative.');
  if (resolved.lagWeights.every((weight) => weight === 0)) throw new Error('At least one lag weight must be positive.');
  return resolved;
}

function defaultLagWeights(lags: number[]): number[] {
  const defaults = new Map([[1, 0.6], [2, 0.25], [3, 0.15]]);
  return lags.map((lag) => defaults.get(lag) ?? 1 / lags.length);
}
function buildDailyHits(rows: HistoryRow[]): DailyHits[] {
  const grouped = new Map<string, Set<string>>();
  for (const row of rows) { if (row.last2) { const values = grouped.get(row.date) ?? new Set<string>(); values.add(row.last2); grouped.set(row.date, values); } }
  return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([date, values]) => ({ date, values, dayOfWeek: new Date(`${date}T00:00:00.000Z`).getUTCDay() }));
}
function stats(values: number[]): { mean: number; standardDeviation: number } {
  const mean = average(values); return { mean, standardDeviation: Math.sqrt(average(values.map((value) => (value - mean) ** 2))) };
}
function zScore(value: number, summary: { mean: number; standardDeviation: number }): number {
  return summary.standardDeviation > Number.EPSILON ? (value - summary.mean) / summary.standardDeviation : 0;
}
function normalizeWeights(weights: number[]): number[] { const total = weights.reduce((sum, weight) => sum + weight, 0); return weights.map((weight) => weight / total); }
function logit(value: number): number { return Math.log(value / (1 - value)); }
function average(values: number[]): number { return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function clamp(value: number, minimum: number, maximum: number): number { return Math.min(Math.max(value, minimum), maximum); }
function shiftDate(date: string, days: number): string { const value = new Date(`${date}T00:00:00.000Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
function format(value: number): string { return value.toFixed(6); }
