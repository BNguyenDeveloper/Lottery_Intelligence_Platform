import { LotteryNumberMienBacModel } from '../models/LotteryNumber';

export interface MienBacMissingHeadFollowUpOptions {
  topPerHead: number;
}

export interface MienBacMissingHeadFollowUpRow {
  rank: number;
  latestDate: string;
  missingHead: string;
  number: string;
  count: number;
  hitDays: number;
  eventDays: number;
  hitRate: string;
}

interface HistoryRow {
  date: string;
  last2: string;
}

export async function getMienBacMissingHeadFollowUp(
  options: MienBacMissingHeadFollowUpOptions,
): Promise<MienBacMissingHeadFollowUpRow[]> {
  const rows = await LotteryNumberMienBacModel.find({ province: 'xsmb' })
    .select({ date: 1, last2: 1 })
    .sort({ date: 1, position: 1 })
    .lean<HistoryRow[]>()
    .exec();
  const dailyValues = groupByDate(rows);
  const dates = Array.from(dailyValues.keys()).sort();
  const latestDate = dates[dates.length - 1];

  if (!latestDate || dates.length < 2) {
    return [];
  }

  const latestValues = dailyValues.get(latestDate) ?? [];
  const missingHeads = getMissingHeads(latestValues);
  const result: MienBacMissingHeadFollowUpRow[] = [];

  for (const missingHead of missingHeads) {
    const counts = new Map<string, number>();
    const hitDays = new Map<string, number>();
    let eventDays = 0;

    for (let index = 0; index < dates.length - 1; index += 1) {
      const values = dailyValues.get(dates[index]) ?? [];
      if (hasHead(values, missingHead)) {
        continue;
      }

      eventDays += 1;
      const nextValues = dailyValues.get(dates[index + 1]) ?? [];
      const nextHeadValues = nextValues.filter((value) => value.startsWith(missingHead));

      for (const value of nextHeadValues) {
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }

      for (const value of new Set(nextHeadValues)) {
        hitDays.set(value, (hitDays.get(value) ?? 0) + 1);
      }
    }

    const ranked = Array.from(counts.entries())
      .map(([number, count]) => ({
        latestDate,
        missingHead,
        number,
        count,
        hitDays: hitDays.get(number) ?? 0,
        eventDays,
      }))
      .sort(
        (left, right) =>
          right.hitDays - left.hitDays ||
          right.count - left.count ||
          left.number.localeCompare(right.number),
      )
      .slice(0, options.topPerHead);

    result.push(
      ...ranked.map((row, index) => ({
        rank: index + 1,
        ...row,
        hitRate: formatPercent(row.hitDays / Math.max(row.eventDays, 1)),
      })),
    );
  }

  return result;
}

function groupByDate(rows: HistoryRow[]): Map<string, string[]> {
  const byDate = new Map<string, string[]>();

  for (const row of rows) {
    const values = byDate.get(row.date) ?? [];
    values.push(row.last2);
    byDate.set(row.date, values);
  }

  return byDate;
}

function getMissingHeads(values: string[]): string[] {
  return Array.from({ length: 10 }, (_, index) => String(index)).filter((head) => !hasHead(values, head));
}

function hasHead(values: string[], head: string): boolean {
  return values.some((value) => value.startsWith(head));
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}
