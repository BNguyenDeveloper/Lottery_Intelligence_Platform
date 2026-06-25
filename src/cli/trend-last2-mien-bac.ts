import { connectDatabase, disconnectDatabase } from '../config/database';
import { getTrendingMienBacLast2 } from '../services/mien-bac-prediction.service';
import { logger } from '../utils/logger';

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
  const recentDays = parsePositiveInteger('recent-days', 30);
  const baselineDays = parsePositiveInteger('baseline-days', 90);
  const top = parsePositiveInteger('top', 5);

  await connectDatabase();
  const rows = await getTrendingMienBacLast2({ recentDays, baselineDays, top });

  if (rows.length === 0) {
    logger.warn('No Mien Bac last2 trend rows found', { recentDays, baselineDays, top });
    return;
  }

  logger.info('Mien Bac last2 trend completed', { recentDays, baselineDays, top, rows: rows.length });
  console.table(rows);
}

main()
  .catch((error) => {
    logger.error('Mien Bac last2 trend failed', { error: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  })
  .finally(disconnectDatabase);
