import { connectDatabase, disconnectDatabase } from '../config/database';
import { PredictionTarget, predictMienBacNumbers } from '../services/mien-bac-prediction.service';
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

async function main(): Promise<void> {
  const target = parseTarget(option('target') ?? process.env.PREDICTION_TARGET);
  const historyDays = Number(option('history-days') ?? process.env.PREDICTION_HISTORY_DAYS ?? 365);
  const top = Number(option('top') ?? process.env.PREDICTION_TOP ?? 10);

  if (!Number.isInteger(historyDays) || historyDays <= 0) {
    throw new Error('history-days must be a positive integer.');
  }

  if (!Number.isInteger(top) || top <= 0) {
    throw new Error('top must be a positive integer.');
  }

  await connectDatabase();
  const rows = await predictMienBacNumbers({ target, historyDays, top });

  if (rows.length === 0) {
    logger.warn('No Mien Bac prediction rows found', { target, historyDays, top });
    return;
  }

  console.table(rows);
  logger.info('Mien Bac prediction completed', {
    target,
    historyDays,
    top,
    bestNumber: rows[0].number,
    bestScore: rows[0].score,
  });
}

main()
  .catch((error) => {
    logger.error('Mien Bac prediction failed', { error: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  })
  .finally(disconnectDatabase);
