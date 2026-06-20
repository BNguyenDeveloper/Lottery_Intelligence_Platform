import { connectDatabase, disconnectDatabase } from '../config/database';
import { XsktCrawlerService } from '../services/crawler.service';
import { LotteryResultService } from '../services/lottery-result.service';
import { assertDateString, getVietnamDateString } from '../utils/date';
import { logger } from '../utils/logger';
import { assertRegion, normalizeCode } from '../utils/validator';

async function main(): Promise<void> {
  const region = normalizeCode(process.argv[2] ?? '');
  const date = process.argv[3] ?? getVietnamDateString();
  if (!region) throw new Error('Usage: npm run job:region -- mien-nam [YYYY-MM-DD]');
  assertRegion(region);
  assertDateString(date);

  await connectDatabase();
  const results = await new XsktCrawlerService().fetchByRegion(date, region);
  const summary = await new LotteryResultService().saveMany(results);
  logger.info('Region job completed', { date, region, fetchedRecords: results.length, ...summary });
}

main()
  .catch((error) => {
    logger.error('Region job failed', { error: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  })
  .finally(disconnectDatabase);
