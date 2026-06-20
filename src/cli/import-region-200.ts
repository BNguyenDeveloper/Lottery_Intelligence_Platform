import { connectDatabase, disconnectDatabase } from '../config/database';
import { RegionCode } from '../constants/regions';
import { XsktCrawlerService } from '../services/crawler.service';
import { LotteryResultService } from '../services/lottery-result.service';
import { assertDateString, getVietnamDateString } from '../utils/date';
import { logger } from '../utils/logger';
import { assertRegion, normalizeCode } from '../utils/validator';

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getDefaultEndDate(): string {
  const today = new Date(`${getVietnamDateString()}T00:00:00.000Z`);
  return toDateString(addDays(today, -1));
}

function buildDateRange(endDate: string, days: number): string[] {
  assertDateString(endDate);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  const start = addDays(end, -(days - 1));
  return Array.from({ length: days }, (_, index) => toDateString(addDays(start, index)));
}

async function main(): Promise<void> {
  const region = normalizeCode(process.argv[2] ?? '') as RegionCode;
  const days = Number(process.argv[3] ?? 200);
  const endDate = process.argv[4] ?? getDefaultEndDate();

  if (!region) {
    throw new Error('Usage: npm run import:xsmn:200 -- [days] [endDate]');
  }

  assertRegion(region);

  if (!Number.isInteger(days) || days <= 0) {
    throw new Error('Days must be a positive integer.');
  }

  const dates = buildDateRange(endDate, days);
  const crawler = new XsktCrawlerService();
  const service = new LotteryResultService();
  const summary = {
    region,
    requestedDays: days,
    startDate: dates[0],
    endDate: dates[dates.length - 1],
    fetchedRecords: 0,
    savedRecords: 0,
    normalizedRecords: 0,
    failures: 0,
  };

  await connectDatabase();

  for (const date of dates) {
    try {
      const results = await crawler.fetchByRegion(date, region);
      if (results.length === 0) {
        summary.failures += 1;
        logger.warn('No regional results found', { date, region });
        continue;
      }

      const saved = await service.saveMany(results);
      summary.fetchedRecords += results.length;
      summary.savedRecords += saved.savedRecords;
      summary.normalizedRecords += saved.normalizedRecords;
      summary.failures += saved.failures;

      logger.info('Regional date imported', {
        date,
        region,
        fetchedRecords: results.length,
        savedRecords: saved.savedRecords,
        normalizedRecords: saved.normalizedRecords,
        failures: saved.failures,
      });
    } catch (error) {
      summary.failures += 1;
      logger.error('Failed to import regional date', {
        date,
        region,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info('Regional import completed', summary);
}

main()
  .catch((error) => {
    logger.error('Regional import failed', { error: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  })
  .finally(disconnectDatabase);
