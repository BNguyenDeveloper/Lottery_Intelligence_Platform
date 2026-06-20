import { LotteryNumberRepository, NumberStatsFilter } from '../repositories/lottery-number.repository';
import { getVietnamDateString, subtractDays } from '../utils/date';

export interface StatsOptions {
  region?: string;
  province?: string;
  days?: number;
  limit?: number;
}

export class StatisticsService {
  constructor(private readonly repository = new LotteryNumberRepository()) {}

  topLast2(options: StatsOptions) {
    return this.repository.top('last2', this.toFilter(options), options.limit ?? 10);
  }

  topLast3(options: StatsOptions) {
    return this.repository.top('last3', this.toFilter(options), options.limit ?? 10);
  }

  async countLast2(value: string, options: StatsOptions): Promise<number> {
    const rows = await this.topLast2({ ...options, limit: 100 });
    return rows.find((row) => row.value === value)?.count ?? 0;
  }

  async countLast3(value: string, options: StatsOptions): Promise<number> {
    const rows = await this.topLast3({ ...options, limit: 1000 });
    return rows.find((row) => row.value === value)?.count ?? 0;
  }

  private toFilter(options: StatsOptions): NumberStatsFilter {
    const today = getVietnamDateString();
    const days = options.days ?? 30;
    const fromDate = getVietnamDateString(subtractDays(new Date(), Math.max(days - 1, 0)));

    return {
      region: options.region,
      province: options.province,
      fromDate,
      toDate: today,
    };
  }
}
