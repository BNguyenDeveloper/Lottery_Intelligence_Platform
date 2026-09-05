import { LotteryNumberMienBacModel } from '../models/LotteryNumber';
import { MienBacTransitionLearningConfigModel } from '../models/MienBacTransitionLearningConfig';
import { MienBacTransitionPredictionEvaluationModel } from '../models/MienBacTransitionPredictionEvaluation';
import { getVietnamDateString } from '../utils/date';
import { buildCandidates, pickBayesianWeights, rankCandidates } from './mien-bac-prediction.service';
import {
  buildMienBacDailyHits,
  DEFAULT_MIEN_BAC_TRANSITION_CONFIG,
  MIEN_BAC_TRANSITION_MODEL_VERSION,
  MienBacTransitionConfig,
  rankMienBacTransitionMatrix,
  resolveMienBacTransitionConfig,
} from './mien-bac-transition-matrix.service';
import { getLatestPredictionLearningWeights } from './prediction-learning-weight.service';

interface NumberRow { date: string; last2: string }
interface BacktestResult { config: MienBacTransitionConfig; evaluatedDays: number; baseHits: number; transitionHits: number }

export async function getLatestMienBacTransitionConfig(): Promise<MienBacTransitionConfig> {
  const row = await MienBacTransitionLearningConfigModel.findOne({ modelVersion: MIEN_BAC_TRANSITION_MODEL_VERSION })
    .sort({ createdAt: -1 }).lean().exec();
  return row ? resolveMienBacTransitionConfig({
    priorStrength: row.priorStrength,
    topEdges: row.topEdges,
    lags: row.lags,
    lagWeights: row.lagWeights,
    lambda: row.lambda,
  }) : resolveMienBacTransitionConfig();
}

export async function updateMienBacTransitionLearning(options: {
  historyDays: number;
  backtestDays: number;
  top: number;
  learningRate: number;
  evaluationDate: string;
}) {
  const existing = await MienBacTransitionLearningConfigModel.findOne({
    modelVersion: MIEN_BAC_TRANSITION_MODEL_VERSION,
    sourceEvaluationDate: options.evaluationDate,
  }).lean().exec();
  if (existing) return { updated: false, reason: 'Transition learning already processed this evaluation date.', evaluationDate: options.evaluationDate };
  const liveRows = await MienBacTransitionPredictionEvaluationModel.find({ modelVersion: MIEN_BAC_TRANSITION_MODEL_VERSION })
    .sort({ targetDate: -1 }).limit(30).lean().exec();
  const liveEvaluatedDays = liveRows.length;
  const liveTransitionAverage = average(liveRows.map((row) => row.hitCount));
  const liveBaseAverage = average(liveRows.map((row) => row.baseHitCount));
  if (liveEvaluatedDays < 14) {
    return {
      updated: false,
      reason: 'At least 14 live transition evaluations are required before parameter updates.',
      liveEvaluatedDays,
      liveTransitionHitsPerDraw: liveTransitionAverage.toFixed(3),
      liveBaseHitsPerDraw: liveBaseAverage.toFixed(3),
    };
  }

  const current = await getLatestMienBacTransitionConfig();
  const blocked = liveTransitionAverage < liveBaseAverage;
  if (blocked) {
    const fallback = { ...current, lambda: 0 };
    await saveLearningConfig(fallback, options.evaluationDate, options.backtestDays, 0, 0, liveEvaluatedDays, liveBaseAverage, liveTransitionAverage, true);
    return { updated: true, learningBlocked: true, reason: 'Live transition performance is below base; lambda set to 0.', config: fallback };
  }

  const rows = await LotteryNumberMienBacModel.find({ province: 'xsmb' })
    .select({ date: 1, last2: 1 }).sort({ date: 1 }).lean<NumberRow[]>().exec();
  const allDraws = buildMienBacDailyHits(rows);
  const weights = pickBayesianWeights(await getLatestPredictionLearningWeights());
  const grid = transitionGrid(current);
  const results = grid.map((config) => backtestConfig(allDraws, options.historyDays, options.backtestDays, options.top, weights, config));
  const best = results.sort((left, right) =>
    right.transitionHits - left.transitionHits || left.config.lambda - right.config.lambda)[0];
  if (!best) return { updated: false, reason: 'No transition backtest result available.', liveEvaluatedDays };
  const target = best.transitionHits > best.baseHits ? best.config : { ...best.config, lambda: 0 };
  const rate = clamp(options.learningRate, 0.01, 0.5);
  const learned = resolveMienBacTransitionConfig({
    ...target,
    lambda: round(current.lambda * (1 - rate) + target.lambda * rate),
  });
  await saveLearningConfig(learned, options.evaluationDate, best.evaluatedDays, best.baseHits, best.transitionHits,
    liveEvaluatedDays, liveBaseAverage, liveTransitionAverage, false);
  return {
    updated: true,
    learningBlocked: false,
    selectedConfig: best.config,
    learnedConfig: learned,
    backtestDays: best.evaluatedDays,
    baseHits: best.baseHits,
    transitionHits: best.transitionHits,
    liveEvaluatedDays,
    liveBaseHitsPerDraw: liveBaseAverage.toFixed(3),
    liveTransitionHitsPerDraw: liveTransitionAverage.toFixed(3),
  };
}

function transitionGrid(current: MienBacTransitionConfig): MienBacTransitionConfig[] {
  const values: Array<Partial<MienBacTransitionConfig>> = [
    current,
    { ...current, lambda: 0 },
    { priorStrength: 60, topEdges: 5, lags: [1], lagWeights: [1], lambda: 0.05 },
    { priorStrength: 60, topEdges: 5, lags: [1], lagWeights: [1], lambda: 0.1 },
    { priorStrength: 60, topEdges: 5, lags: [1, 2, 3], lagWeights: [0.6, 0.25, 0.15], lambda: 0.05 },
    DEFAULT_MIEN_BAC_TRANSITION_CONFIG,
    { priorStrength: 100, topEdges: 5, lags: [1], lagWeights: [1], lambda: 0.05 },
    { priorStrength: 60, topEdges: 10, lags: [1], lagWeights: [1], lambda: 0.05 },
  ];
  const unique = new Map<string, MienBacTransitionConfig>();
  for (const value of values) {
    const config = resolveMienBacTransitionConfig(value);
    unique.set(JSON.stringify(config), config);
  }
  return [...unique.values()];
}

function backtestConfig(
  allDraws: ReturnType<typeof buildMienBacDailyHits>,
  historyDays: number,
  testDays: number,
  top: number,
  weights: ReturnType<typeof pickBayesianWeights>,
  config: MienBacTransitionConfig,
): BacktestResult {
  const candidates = buildCandidates('last2');
  const targets = allDraws.slice(-testDays);
  let evaluatedDays = 0;
  let baseHits = 0;
  let transitionHits = 0;
  for (const actual of targets) {
    const history = allDraws.filter((draw) => draw.date < actual.date).slice(-historyDays);
    if (history.length <= Math.max(...config.lags)) continue;
    const base = rankCandidates(candidates, history, top, weights, 0.05, actual.date);
    const transition = rankMienBacTransitionMatrix(history, top, weights, actual.date, config);
    evaluatedDays += 1;
    baseHits += base.filter((row) => actual.values.has(row.number)).length;
    transitionHits += transition.filter((row) => actual.values.has(row.number)).length;
  }
  return { config, evaluatedDays, baseHits, transitionHits };
}

async function saveLearningConfig(
  config: MienBacTransitionConfig,
  sourceEvaluationDate: string,
  backtestDays: number,
  baseHits: number,
  transitionHits: number,
  liveEvaluatedDays: number,
  liveBaseAverage: number,
  liveTransitionAverage: number,
  learningBlocked: boolean,
): Promise<void> {
  await MienBacTransitionLearningConfigModel.create({
    modelVersion: MIEN_BAC_TRANSITION_MODEL_VERSION,
    ...config,
    backtestDays,
    baseHitsPerDraw: ratio(baseHits, backtestDays),
    transitionHitsPerDraw: ratio(transitionHits, backtestDays),
    liftVsBase: percent((transitionHits - baseHits) / Math.max(baseHits, Number.EPSILON)),
    liveEvaluatedDays,
    liveBaseHitsPerDraw: liveBaseAverage.toFixed(3),
    liveTransitionHitsPerDraw: liveTransitionAverage.toFixed(3),
    learningBlocked,
    sourceEvaluationDate,
    effectiveFromDate: getVietnamDateString(),
  });
}

function average(values: number[]): number { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function clamp(value: number, minimum: number, maximum: number): number { return Math.min(Math.max(value, minimum), maximum); }
function round(value: number): number { return Number(value.toFixed(4)); }
function ratio(value: number, denominator: number): string { return (value / Math.max(denominator, 1)).toFixed(3); }
function percent(value: number): string { return `${(value * 100).toFixed(2)}%`; }
