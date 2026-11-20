import { LotteryCrawler } from '../interfaces/crawler.interface';
import { XsktCrawlerService } from '../services/crawler.service';
import { LotteryResultService } from '../services/lottery-result.service';
import { getVietnamDateString } from '../utils/date';
import { logger } from '../utils/logger';
import { refreshMienTrungFrequencyMatrixSnapshotsAfterImport } from '../services/mien-trung-frequency-matrix-snapshot.service';

export class DailyLotteryJob {
  constructor(
    private readonly crawler: LotteryCrawler = new XsktCrawlerService(),
    private readonly service = new LotteryResultService(),
  ) {}

  async run(date = getVietnamDateString()): Promise<void> {
    logger.info('Daily lottery job started', { date });
    const results = await this.crawler.fetchByDate(date);
    const summary = await this.service.saveMany(results);
    await refreshMienTrungFrequencyMatrixSnapshotsAfterImport(results);

    logger.info('Daily lottery job completed', {
      date,
      fetchedRecords: results.length,
      savedRecords: summary.savedRecords,
      normalizedRecords: summary.normalizedRecords,
      failures: summary.failures,
    });
  }
}
