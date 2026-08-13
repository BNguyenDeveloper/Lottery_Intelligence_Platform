import { connectDatabase, disconnectDatabase } from '../config/database';
import { backtestMienBacDaSo } from '../services/mien-bac-da-so.service';
import { logger } from '../utils/logger';

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const historyDays = Number(option('history-days') ?? 365);
  const testDays = Number(option('test-days') ?? 60);
  const numberTop = Number(option('number-top') ?? 5);
  const candidatePool = Number(option('candidate-pool') ?? 20);
  const pairTop = Number(option('pair-top') ?? 10);
  await connectDatabase();
  const result = await backtestMienBacDaSo({ historyDays, testDays, numberTop, candidatePool, pairTop, throughDate: option('through-date') });
  if (!result) return logger.warn('No Mien Bac da so backtest available.');
  const { days, ...summary } = result;
  console.table([summary]);
  if (!process.argv.includes('--summary-only')) console.table(days);
}

main().catch((error) => { logger.error('Mien Bac da so backtest failed', { error: error instanceof Error ? error.message : String(error) }); process.exitCode = 1; }).finally(disconnectDatabase);
