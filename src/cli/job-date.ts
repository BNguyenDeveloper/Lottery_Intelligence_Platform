import { connectDatabase, disconnectDatabase } from '../config/database';
import { DailyLotteryJob } from '../jobs/daily-lottery.job';
import { assertDateString } from '../utils/date';
import { logger } from '../utils/logger';

async function main(): Promise<void> {
  const date = process.argv[2];
  if (!date) throw new Error('Usage: npm run job:date -- YYYY-MM-DD');
  assertDateString(date);

  await connectDatabase();
  await new DailyLotteryJob().run(date);
}

main()
  .catch((error) => {
    logger.error('Date job failed', { error: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  })
  .finally(disconnectDatabase);
