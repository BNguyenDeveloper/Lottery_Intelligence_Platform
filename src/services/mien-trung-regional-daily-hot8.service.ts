import { LotteryNumberMienTrungModel } from '../models/LotteryNumber';

export const MIEN_TRUNG_REGIONAL_DAILY_HOT8_MODEL_VERSION =
  'mien-trung-regional-daily-hot8-v1-experimental';
export const MIEN_TRUNG_REGIONAL_DAILY_HOT8_FORMULA =
  'score = appearances in last 8 same-weekday regional draws - 0.25 if appeared in the previous same-weekday draw';
export const MIEN_TRUNG_REGIONAL_DAILY_HOT8_HISTORY_DRAWS = 8;
export const MIEN_TRUNG_REGIONAL_DAILY_HOT8_REPEAT_PENALTY = 0.25;

export interface MienTrungRegionalDailyHot8Row {
  rank: number;
  number: string;
  score: string;
  appearances: number;
  appearanceRate: string;
  appearedPreviousDraw: boolean;
}

export interface MienTrungRegionalDailyHot8Prediction {
  modelVersion: string;
  formula: string;
  targetDate: string;
  provinces: string[];
  historyDraws: number;
  previousDrawDate?: string;
  repeatPenalty: number;
  rows: MienTrungRegionalDailyHot8Row[];
}

interface NumberRow { date: string; last2: string }

export async function predictMienTrungRegionalDailyHot8(options: {
  targetDate: string;
  provinces: string[];
  historyDays: number;
  top?: number;
}): Promise<MienTrungRegionalDailyHot8Prediction | null> {
  const fromDate = shiftDate(options.targetDate, -(options.historyDays - 1));
  const targetDay = dayOfWeek(options.targetDate);
  const numberRows = await LotteryNumberMienTrungModel.find({
    date: { $gte: fromDate, $lt: options.targetDate },
    province: { $in: options.provinces },
  }).select({ _id: 0, date: 1, last2: 1 }).sort({ date: 1 }).lean<NumberRow[]>().exec();

  const grouped = new Map<string, Set<string>>();
  for (const row of numberRows) {
    if (dayOfWeek(row.date) !== targetDay) continue;
    const values = grouped.get(row.date) ?? new Set<string>();
    values.add(row.last2);
    grouped.set(row.date, values);
  }
  const history = [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))
    .slice(-MIEN_TRUNG_REGIONAL_DAILY_HOT8_HISTORY_DRAWS)
    .map(([date, values]) => ({ date, values }));
  if (history.length === 0) return null;

  const previous = history.at(-1);
  const counts = new Map<string, number>();
  for (let value = 0; value < 100; value += 1) counts.set(String(value).padStart(2, '0'), 0);
  for (const draw of history) for (const number of draw.values) counts.set(number, (counts.get(number) ?? 0) + 1);

  const rows = [...counts].map(([number, appearances]) => {
    const appearedPreviousDraw = previous?.values.has(number) ?? false;
    return { number, appearances, appearedPreviousDraw,
      score: appearances - (appearedPreviousDraw ? MIEN_TRUNG_REGIONAL_DAILY_HOT8_REPEAT_PENALTY : 0) };
  }).sort((left, right) => right.score - left.score || right.appearances - left.appearances || left.number.localeCompare(right.number))
    .slice(0, options.top ?? 5)
    .map((row, index) => ({ rank: index + 1, number: row.number, score: row.score.toFixed(2),
      appearances: row.appearances, appearanceRate: `${((row.appearances / history.length) * 100).toFixed(2)}%`,
      appearedPreviousDraw: row.appearedPreviousDraw }));

  return { modelVersion: MIEN_TRUNG_REGIONAL_DAILY_HOT8_MODEL_VERSION,
    formula: MIEN_TRUNG_REGIONAL_DAILY_HOT8_FORMULA, targetDate: options.targetDate,
    provinces: options.provinces, historyDraws: history.length, previousDrawDate: previous?.date,
    repeatPenalty: MIEN_TRUNG_REGIONAL_DAILY_HOT8_REPEAT_PENALTY, rows };
}

function dayOfWeek(date: string): number { return new Date(`${date}T00:00:00.000Z`).getUTCDay(); }
function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`); value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
