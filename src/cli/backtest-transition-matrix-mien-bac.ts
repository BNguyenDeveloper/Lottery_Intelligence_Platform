import { connectDatabase, disconnectDatabase } from '../config/database';
import { LotteryNumberMienBacModel } from '../models/LotteryNumber';
import { buildCandidates, pickBayesianWeights, rankCandidates } from '../services/mien-bac-prediction.service';
import {
  buildMienBacDailyHits,
  DEFAULT_MIEN_BAC_TRANSITION_CONFIG,
  MIEN_BAC_TRANSITION_MODEL_VERSION,
  rankMienBacTransitionMatrix,
  resolveMienBacTransitionConfig,
} from '../services/mien-bac-transition-matrix.service';
import { getLatestPredictionLearningWeights } from '../services/prediction-learning-weight.service';
import { logger } from '../utils/logger';

interface NumberRow { date: string; last2: string }

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const testDraws = Number(option('test-draws') ?? 250);
  const historyDraws = Number(option('history-draws') ?? 365);
  const top = Number(option('top') ?? 5);
  const throughDate = option('through-date');
  const requestedLags = parseNumberList(option('lags'));
  const requestedLagWeights = parseNumberList(option('lag-weights'));
  const config = resolveMienBacTransitionConfig({
    priorStrength: Number(option('prior-strength') ?? DEFAULT_MIEN_BAC_TRANSITION_CONFIG.priorStrength),
    topEdges: Number(option('top-edges') ?? DEFAULT_MIEN_BAC_TRANSITION_CONFIG.topEdges),
    lambda: Number(option('lambda') ?? DEFAULT_MIEN_BAC_TRANSITION_CONFIG.lambda),
    ...(requestedLags ? { lags: requestedLags } : {}),
    ...(requestedLagWeights ? { lagWeights: requestedLagWeights } : {}),
  });
  for (const [name, value] of [['test-draws', testDraws], ['history-draws', historyDraws], ['top', top]] as const) {
    if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`);
  }

  await connectDatabase();
  try {
    const rows = await LotteryNumberMienBacModel.find({
      province: 'xsmb',
      ...(throughDate ? { date: { $lte: throughDate } } : {}),
    })
      .select({ date: 1, last2: 1 })
      .sort({ date: 1 })
      .lean<NumberRow[]>()
      .exec();
    const allDraws = buildMienBacDailyHits(rows);
    const targets = allDraws.slice(-testDraws);
    const weights = pickBayesianWeights(await getLatestPredictionLearningWeights());
    const candidates = buildCandidates('last2');
    let evaluatedDraws = 0;
    let baseHits = 0;
    let transitionHits = 0;
    let randomHits = 0;
    let transitionHitDraws = 0;

    for (const actual of targets) {
      const history = allDraws.filter((draw) => draw.date < actual.date).slice(-historyDraws);
      if (history.length < 2) continue;
      const base = rankCandidates(candidates, history, top, weights, 0.05, actual.date);
      const transition = rankMienBacTransitionMatrix(history, top, weights, actual.date, config);
      if (base.length === 0 || transition.length === 0) continue;
      const baseHitCount = base.filter((row) => actual.values.has(row.number)).length;
      const transitionHitCount = transition.filter((row) => actual.values.has(row.number)).length;
      evaluatedDraws += 1;
      baseHits += baseHitCount;
      transitionHits += transitionHitCount;
      if (transitionHitCount > 0) transitionHitDraws += 1;
      randomHits += top * actual.values.size / 100;
    }

    logger.info('Mien Bac transition matrix walk-forward backtest completed', {
      modelVersion: MIEN_BAC_TRANSITION_MODEL_VERSION,
      throughDate: throughDate ?? 'latest',
      testDraws,
      historyDraws,
      top,
      config,
      evaluatedDraws,
      baseHits,
      transitionHits,
      baseHitsPerDraw: ratio(baseHits, evaluatedDraws),
      transitionHitsPerDraw: ratio(transitionHits, evaluatedDraws),
      randomHitsPerDraw: ratio(randomHits, evaluatedDraws),
      liftVsBase: percent((transitionHits - baseHits) / Math.max(baseHits, Number.EPSILON)),
      liftVsRandom: percent((transitionHits - randomHits) / Math.max(randomHits, Number.EPSILON)),
      transitionHitDrawRate: percent(transitionHitDraws / Math.max(evaluatedDraws, 1)),
      warning: 'Experimental reference only. Historical performance does not guarantee future results.',
    });
  } finally {
    await disconnectDatabase();
  }
}

function parseNumberList(value: string | undefined): number[] | undefined {
  if (!value) return undefined;
  const values = value.split(',').map(Number);
  if (values.length === 0 || values.some((entry) => !Number.isFinite(entry))) {
    throw new Error(`Invalid numeric list: ${value}`);
  }
  return values;
}

function ratio(value: number, denominator: number): string {
  return (value / Math.max(denominator, 1)).toFixed(3);
}

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

main().catch((error) => {
  logger.error('Mien Bac transition matrix backtest failed', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
