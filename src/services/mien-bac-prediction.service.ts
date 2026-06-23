import { LotteryNumberMienBacModel } from '../models/LotteryNumber';

export type PredictionTarget = 'last2' | 'last3';

export interface MienBacPredictionOptions {
  target: PredictionTarget;
  historyDays: number;
  top: number;
}

export interface MienBacPredictionRow {
  rank: number;
  number: string;
  count: number;
  lastSeenDate: string;
  gapDays: number;
  score: string;
}

interface AggregateRow {
  _id: string;
  count: number;
  lastSeenDate: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function predictMienBacNumbers(options: MienBacPredictionOptions): Promise<MienBacPredictionRow[]> {
  const latest = await LotteryNumberMienBacModel.findOne({ province: 'xsmb' })
    .sort({ date: -1 })
    .select({ date: 1 })
    .lean()
    .exec();

  if (!latest?.date) {
    return [];
  }

  const fromDate = shiftDate(latest.date, -(options.historyDays - 1));
  const rows = await LotteryNumberMienBacModel.aggregate<AggregateRow>([
    {
      $match: {
        province: 'xsmb',
        date: { $gte: fromDate, $lte: latest.date },
      },
    },
    {
      $group: {
        _id: `$${options.target}`,
        count: { $sum: 1 },
        lastSeenDate: { $max: '$date' },
      },
    },
  ]).exec();

  return rows
    .map((row) => {
      const gapDays = diffDays(latest.date, row.lastSeenDate);
      return {
        number: row._id,
        count: row.count,
        lastSeenDate: row.lastSeenDate,
        gapDays,
        rawScore: row.count / Math.sqrt(gapDays + 1),
      };
    })
    .sort((left, right) => right.rawScore - left.rawScore || right.count - left.count || left.number.localeCompare(right.number))
    .slice(0, options.top)
    .map((row, index) => ({
      rank: index + 1,
      number: row.number,
      count: row.count,
      lastSeenDate: row.lastSeenDate,
      gapDays: row.gapDays,
      score: row.rawScore.toFixed(4),
    }));
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function diffDays(toDate: string, fromDate: string): number {
  const to = new Date(`${toDate}T00:00:00.000Z`).getTime();
  const from = new Date(`${fromDate}T00:00:00.000Z`).getTime();
  return Math.max(0, Math.round((to - from) / MS_PER_DAY));
}
