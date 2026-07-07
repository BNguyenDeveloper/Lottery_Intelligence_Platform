import { connectDatabase, disconnectDatabase } from '../config/database';
import { updateMienBacLast2LearningWeights } from '../services/prediction-weight-learning.service';
import { logger } from '../utils/logger';

const DEFAULT_OUTPUT_TOP = 5;

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
  await connectDatabase();
  const result = await updateMienBacLast2LearningWeights({
    historyDays: parsePositiveInteger('history-days', Number(process.env.PREDICTION_HISTORY_DAYS ?? 365)),
    predictionTop: parsePositiveInteger('prediction-top', Number(process.env.PREDICTION_BLEND_PREDICTION_TOP ?? 20)),
    recentDays: parsePositiveInteger('recent-days', Number(process.env.PREDICTION_TREND_RECENT_DAYS ?? 30)),
    baselineDays: parsePositiveInteger('baseline-days', Number(process.env.PREDICTION_TREND_BASELINE_DAYS ?? 90)),
    trendTop: parsePositiveInteger('trend-top', Number(process.env.PREDICTION_BLEND_TREND_TOP ?? 20)),
    top: parsePositiveInteger('top', Number(process.env.PREDICTION_BLEND_TOP ?? DEFAULT_OUTPUT_TOP)),
    backtestDays: parsePositiveInteger('backtest-days', Number(process.env.PREDICTION_LEARNING_BACKTEST_DAYS ?? 60)),
    learningRate: parsePositiveNumber('learning-rate', Number(process.env.PREDICTION_LEARNING_RATE ?? 0.25)),
  });

  logger.info('Mien Bac prediction learning update completed', { ...result });
  console.table([result]);
}

main()
  .catch((error) => {
    logger.error('Mien Bac prediction learning update failed', { error: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  })
  .finally(disconnectDatabase);
