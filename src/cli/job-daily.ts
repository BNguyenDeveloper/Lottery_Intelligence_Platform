import { connectDatabase, disconnectDatabase } from '../config/database';
import { DailyLotteryJob } from '../jobs/daily-lottery.job';
import { logger } from '../utils/logger';

async function main(): Promise<void> {
  await connectDatabase();
  await new DailyLotteryJob().run();
}

main()
  .catch((error) => {
    logger.error('Daily job failed', { error: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  })
  .finally(disconnectDatabase);
