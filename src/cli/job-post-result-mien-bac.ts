import { connectDatabase, disconnectDatabase } from '../config/database';
import { evaluateMienBacLast2Prediction } from '../services/prediction-evaluation.service';
import { updateMienBacBayesianLearningWeights } from '../services/prediction-bayesian-learning.service';
import { updateMienBacLast2LearningWeights } from '../services/prediction-weight-learning.service';
import { MIEN_BAC_LAST2_PREDICTION_SNAPSHOT_VERSION } from '../services/prediction-learning-weight.service';
import { assertDateString, getVietnamDateString } from '../utils/date';
import { logger } from '../utils/logger';

const DEFAULT_OUTPUT_TOP = 10;

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function parsePositiveInteger(name: string, fallback: number): number {
  const value = Number(option(name) ?? fallback);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return value;
}

function parsePositiveNumber(name: string, fallback: number): number {
  const value = Number(option(name) ?? fallback);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }

  return value;
}

async function main(): Promise<void> {
  const date = option('date') ?? process.env.PREDICTION_EVALUATION_DATE ?? getVietnamDateString();
  const historyDays = parsePositiveInteger('history-days', Number(process.env.PREDICTION_HISTORY_DAYS ?? 365));
  const predictionTop = parsePositiveInteger('prediction-top', Number(process.env.PREDICTION_BLEND_PREDICTION_TOP ?? 20));
  const recentDays = parsePositiveInteger('recent-days', Number(process.env.PREDICTION_TREND_RECENT_DAYS ?? 30));
  const baselineDays = parsePositiveInteger('baseline-days', Number(process.env.PREDICTION_TREND_BASELINE_DAYS ?? 90));
  const trendTop = parsePositiveInteger('trend-top', Number(process.env.PREDICTION_BLEND_TREND_TOP ?? 20));
  const top = parsePositiveInteger('top', Number(process.env.PREDICTION_BLEND_TOP ?? DEFAULT_OUTPUT_TOP));
  const backtestDays = parsePositiveInteger('backtest-days', Number(process.env.PREDICTION_LEARNING_BACKTEST_DAYS ?? 60));
  const learningRate = parsePositiveNumber('learning-rate', Number(process.env.PREDICTION_LEARNING_RATE ?? 0.25));
  assertDateString(date);

  await connectDatabase();
  const predictionEvaluation = await evaluateMienBacLast2Prediction(
    date,
    MIEN_BAC_LAST2_PREDICTION_SNAPSHOT_VERSION,
    'prediction',
  );
  const evaluation = await evaluateMienBacLast2Prediction(date, undefined, 'blend');

  if (predictionEvaluation) {
    logger.info('Mien Bac standalone Prediction evaluation completed', {
      date,
      hitCount: predictionEvaluation.hitCount,
      hitRate: predictionEvaluation.hitRate,
      top5Hit: predictionEvaluation.top5Hit,
    });
  } else {
    logger.warn('Mien Bac standalone Prediction evaluation skipped', { date });
  }

  if (!evaluation) {
    logger.warn('Mien Bac post-result learning skipped evaluation', { date });
  } else {
    logger.info('Mien Bac post-result evaluation completed', {
      date,
      hitCount: evaluation.hitCount,
      hitRate: evaluation.hitRate,
      top1Hit: evaluation.top1Hit,
      top3Hit: evaluation.top3Hit,
      top5Hit: evaluation.top5Hit,
      top10Hit: evaluation.top10Hit,
    });
  }

  const bayesianLearning = await updateMienBacBayesianLearningWeights({
    historyDays,
    backtestDays,
    top,
    learningRate,
  });
  logger.info('Mien Bac post-result Bayesian learning completed', { date, ...bayesianLearning });

  const learning = await updateMienBacLast2LearningWeights({
    historyDays,
    predictionTop,
    recentDays,
    baselineDays,
    trendTop,
    top,
    backtestDays,
    learningRate,
  });
  logger.info('Mien Bac post-result learning completed', { date, ...learning });
}

main()
  .catch((error) => {
    logger.error('Mien Bac post-result learning failed', { error: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  })
  .finally(disconnectDatabase);
