import {
  LotteryNumberMienBacModel,
  LotteryNumberMienNamModel,
  LotteryNumberMienTrungModel,
} from '../models/LotteryNumber';
import { getVietnamDateString, subtractDays } from '../utils/date';

export interface RecentLast2SummaryOptions {
  days: number;
  top: number;
}

export interface RecentLast2SummaryRow {
  rank: number;
  number: string;
  count: number;
  mienBac: number;
  mienTrung: number;
  mienNam: number;
}

type RegionKey = 'mienBac' | 'mienTrung' | 'mienNam';

const REGION_MODELS = [
  { key: 'mienBac', model: LotteryNumberMienBacModel },
  { key: 'mienTrung', model: LotteryNumberMienTrungModel },
  { key: 'mienNam', model: LotteryNumberMienNamModel },
] as const;

export async function getRecentLast2Summary(options: RecentLast2SummaryOptions): Promise<RecentLast2SummaryRow[]> {
  const toDate = getVietnamDateString();
  const fromDate = getVietnamDateString(subtractDays(new Date(), Math.max(options.days - 1, 0)));
  const counts = new Map<string, Record<RegionKey, number>>();

  for (const { key, model } of REGION_MODELS) {
    const rows = await model
      .aggregate<{ _id: string; count: number }>([
        { $match: { date: { $gte: fromDate, $lte: toDate } } },
        { $group: { _id: '$last2', count: { $sum: 1 } } },
      ])
      .exec();

    for (const row of rows) {
      const current = counts.get(row._id) ?? { mienBac: 0, mienTrung: 0, mienNam: 0 };
      current[key] = row.count;
      counts.set(row._id, current);
    }
  }

  return Array.from(counts.entries())
    .map(([number, byRegion]) => ({
      number,
      count: byRegion.mienBac + byRegion.mienTrung + byRegion.mienNam,
      mienBac: byRegion.mienBac,
      mienTrung: byRegion.mienTrung,
      mienNam: byRegion.mienNam,
    }))
    .sort((left, right) => right.count - left.count || left.number.localeCompare(right.number))
    .slice(0, options.top)
    .map((row, index) => ({
      rank: index + 1,
      ...row,
    }));
}
