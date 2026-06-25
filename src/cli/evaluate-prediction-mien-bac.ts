import { connectDatabase, disconnectDatabase } from '../config/database';
import { evaluateMienBacLast2Prediction } from '../services/prediction-evaluation.service';
import { assertDateString, getVietnamDateString } from '../utils/date';
import { logger } from '../utils/logger';

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const date = option('date') ?? process.env.PREDICTION_EVALUATION_DATE ?? getVietnamDateString();
  assertDateString(date);

  await connectDatabase();
  const result = await evaluateMienBacLast2Prediction(date);

  if (!result) {
    logger.warn('No Mien Bac prediction evaluation result', { date });
    return;
  }

  console.table([result]);
}

main()
  .catch((error) => {
    logger.error('Mien Bac prediction evaluation failed', { error: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  })
  .finally(disconnectDatabase);
