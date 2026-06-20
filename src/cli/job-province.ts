import { connectDatabase, disconnectDatabase } from '../config/database';
import { XsktCrawlerService } from '../services/crawler.service';
import { LotteryResultService } from '../services/lottery-result.service';
import { assertDateString } from '../utils/date';
import { logger } from '../utils/logger';
import { assertProvince, normalizeCode } from '../utils/validator';

async function main(): Promise<void> {
  const province = normalizeCode(process.argv[2] ?? '');
  const date = process.argv[3];
  if (!province || !date) throw new Error('Usage: npm run job:province -- vinh-long YYYY-MM-DD');
  assertProvince(province);
  assertDateString(date);

  await connectDatabase();
  const result = await new XsktCrawlerService().fetchByProvince(date, province);
  if (!result) {
    logger.warn('No lottery result found', { date, province });
    return;
  }

  const summary = await new LotteryResultService().saveMany([result]);
  logger.info('Province job completed', { date, province, fetchedRecords: 1, ...summary });
}

main()
  .catch((error) => {
    logger.error('Province job failed', { error: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  })
  .finally(disconnectDatabase);
