import { connectDatabase, disconnectDatabase } from '../config/database';
import { getMienBacLast2PredictionTrendBlend } from '../services/mien-bac-prediction.service';
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

async function main(): Promise<void> {
  const historyDays = parsePositiveInteger('history-days', Number(process.env.PREDICTION_HISTORY_DAYS ?? 365));
  const predictionTop = parsePositiveInteger('prediction-top', 20);
  const recentDays = parsePositiveInteger('recent-days', 30);
  const baselineDays = parsePositiveInteger('baseline-days', 90);
  const trendTop = parsePositiveInteger('trend-top', 20);
  const top = parsePositiveInteger('top', DEFAULT_OUTPUT_TOP);

  await connectDatabase();
  const rows = await getMienBacLast2PredictionTrendBlend({
    historyDays,
    predictionTop,
    recentDays,
    baselineDays,
    trendTop,
    top,
  });

  if (rows.length === 0) {
    logger.warn('No Mien Bac last2 blend rows found', { historyDays, predictionTop, recentDays, baselineDays, trendTop, top });
    return;
  }

  logger.info('Mien Bac last2 prediction/trend blend completed', {
    historyDays,
    predictionTop,
    recentDays,
    baselineDays,
    trendTop,
    top,
    rows: rows.length,
  });
  console.table(rows);
}

main()
  .catch((error) => {
    logger.error('Mien Bac last2 prediction/trend blend failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  })
  .finally(disconnectDatabase);
