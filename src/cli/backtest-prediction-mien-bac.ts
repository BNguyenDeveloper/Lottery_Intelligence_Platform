import { connectDatabase, disconnectDatabase } from '../config/database';
import {
  backtestMienBacPrediction,
  DEFAULT_SOI_CAU_WEIGHT,
  PredictionTarget,
} from '../services/mien-bac-prediction.service';
import { logger } from '../utils/logger';

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function parseTarget(value: string | undefined): PredictionTarget {
  if (!value || value === 'last2') return 'last2';
  if (value === 'last3') return 'last3';
  throw new Error('Target must be last2 or last3.');
}

function parsePositiveInteger(name: string, fallback: number): number {
  const value = Number(option(name) ?? fallback);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return value;
}

function parseWeight(name: string, fallback: number): number {
  const value = Number(option(name) ?? fallback);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be between 0 and 1.`);
  }
  return value;
}

async function main(): Promise<void> {
  const target = parseTarget(option('target') ?? process.env.PREDICTION_TARGET);
  const historyDays = parsePositiveInteger('history-days', Number(process.env.PREDICTION_HISTORY_DAYS ?? 365));
  const testDays = parsePositiveInteger('test-days', Number(process.env.PREDICTION_TEST_DAYS ?? 60));
  const top = parsePositiveInteger('top', Number(process.env.PREDICTION_TOP ?? 5));
  const soiCauWeight = parseWeight(
    'soi-cau-weight',
    Number(process.env.PREDICTION_SOI_CAU_WEIGHT ?? DEFAULT_SOI_CAU_WEIGHT),
  );
  const throughDate = option('through-date');

  await connectDatabase();
  const result = await backtestMienBacPrediction({ target, historyDays, testDays, top, soiCauWeight, throughDate });

  if (!result) {
    logger.warn('No Mien Bac prediction backtest rows found', { target, historyDays, testDays, top });
    return;
  }

  logger.info('Mien Bac prediction backtest completed', {
    target: result.target,
    historyDays: result.historyDays,
    testDays: result.testDays,
    top: result.top,
    soiCauWeight,
    throughDate: throughDate ?? 'latest',
    evaluatedDays: result.evaluatedDays,
    hitDays: result.hitDays,
    hitDayRate: result.hitDayRate,
    totalHits: result.totalHits,
    totalActual: result.totalActual,
    numberHitRate: result.numberHitRate,
    averageHitsPerDay: result.averageHitsPerDay,
    randomBaselineAverageHitsPerDay: result.randomBaselineAverageHitsPerDay,
    liftVsRandom: result.liftVsRandom,
    randomBaselineHitDayRate: result.randomBaselineHitDayRate,
  });

  console.table(result.days);
}

main()
  .catch((error) => {
    logger.error('Mien Bac prediction backtest failed', { error: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  })
  .finally(disconnectDatabase);
