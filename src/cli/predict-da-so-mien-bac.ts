import { connectDatabase, disconnectDatabase } from '../config/database';
import { getMienBacDaSoPrediction } from '../services/mien-bac-da-so.service';
import { logger } from '../utils/logger';
import { saveMienBacDaSoSnapshot } from '../services/da-so-snapshot.service';

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const historyDays = Number(option('history-days') ?? 365);
  const numberTop = Number(option('number-top') ?? 5);
  const candidatePool = Number(option('candidate-pool') ?? 20);
  const pairTop = Number(option('pair-top') ?? 10);
  await connectDatabase();
  const result = await getMienBacDaSoPrediction({ historyDays, numberTop, candidatePool, pairTop, throughDate: option('through-date') });
  if (!result) return logger.warn('No Mien Bac da so prediction available.');
  const targetDate = option('target-date');
  if (targetDate) await saveMienBacDaSoSnapshot(targetDate, result, option('prediction-date'));
  logger.info('Mien Bac da so prediction completed', { throughDate: result.throughDate, formula: result.formula });
  console.log('Da So - Selected Numbers');
  console.table(result.numbers);
  console.log('Da So - Ranked Pairs');
  console.table(result.pairs);
}

main().catch((error) => { logger.error('Mien Bac da so prediction failed', { error: error instanceof Error ? error.message : String(error) }); process.exitCode = 1; }).finally(disconnectDatabase);
