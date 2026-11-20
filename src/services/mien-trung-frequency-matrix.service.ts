import { LotteryNumberMienTrungModel } from '../models/LotteryNumber';
import { getScheduledProvinces } from '../constants/schedules';

export interface MienTrungFrequencyMatrixInputRow {
  date: string;
  province: string;
  prize: string;
  position: number;
  last2: string;
}

export interface MienTrungFrequencyMatrixRow {
  number: string;
  counts: number[];
  totalOccurrences: number;
  drawAppearances: number;
  absentDraws: number;
  currentGap: number;
  longestGap: number;
  recent6Occurrences: number;
  previous6Occurrences: number;
  recent12Occurrences: number;
  trendDelta6: number;
  trend: 'RISING' | 'FALLING' | 'FLAT';
}

export interface MienTrungFrequencyMatrixDraw {
  date: string;
  normalizedRows: number;
  uniqueSlots: number;
  complete: boolean;
}

export interface MienTrungFrequencyMatrixReport {
  province: string;
  scope: 'LATEST' | 'ALL';
  requestedDraws: number;
  drawCount: number;
  firstDate: string;
  lastDate: string;
  dates: string[];
  draws: MienTrungFrequencyMatrixDraw[];
  completeDraws: number;
  missingScheduledDates: string[];
  rows: MienTrungFrequencyMatrixRow[];
  rankings: {
    byTotalOccurrences: string[];
    byDrawAppearances: string[];
    byRecent6Occurrences: string[];
    byRisingTrend: string[];
    byCurrentGap: string[];
  };
}

export async function getMienTrungFrequencyMatrix(options: {
  province: string;
  draws?: number | 'all';
  throughDate?: string;
}): Promise<MienTrungFrequencyMatrixReport> {
  const requestedDraws = options.draws === 'all' ? 'all' : Math.max(1, Math.trunc(options.draws ?? 28));
  const query: Record<string, unknown> = { province: options.province };
  if (options.throughDate) query.date = { $lte: options.throughDate };
  const databaseRows = await LotteryNumberMienTrungModel.find(query)
    .select({ date: 1, province: 1, prize: 1, position: 1, last2: 1, _id: 0 })
    .sort({ date: 1, prize: 1, position: 1 })
    .lean<MienTrungFrequencyMatrixInputRow[]>()
    .exec();
  return buildMienTrungFrequencyMatrix(databaseRows, options.province, requestedDraws);
}

export function buildMienTrungFrequencyMatrix(
  inputRows: MienTrungFrequencyMatrixInputRow[],
  province: string,
  requestedDraws: number | 'all' = 28,
): MienTrungFrequencyMatrixReport {
  const provinceRows = inputRows.filter((row) => row.province === province);
  const allDates = [...new Set(provinceRows.map((row) => row.date))].sort();
  const dates = requestedDraws === 'all' ? allDates : allDates.slice(-Math.max(1, Math.trunc(requestedDraws)));
  const selected = provinceRows.filter((row) => dates.includes(row.date));
  const draws = dates.map((date) => {
    const rows = selected.filter((row) => row.date === date);
    const uniqueSlots = new Set(rows.map((row) => `${row.prize}:${row.position}`)).size;
    return { date, normalizedRows: rows.length, uniqueSlots, complete: rows.length === 18 && uniqueSlots === 18 };
  });
  const matrixRows = Array.from({ length: 100 }, (_, value) => value.toString().padStart(2, '0')).map((number) => {
    const counts = dates.map((date) => selected.filter((row) => row.date === date && row.last2 === number).length);
    const recent6 = sum(counts.slice(-6));
    const previous6 = sum(counts.slice(-12, -6));
    const trendDelta6 = recent6 - previous6;
    return {
      number,
      counts,
      totalOccurrences: sum(counts),
      drawAppearances: counts.filter((count) => count > 0).length,
      absentDraws: counts.filter((count) => count === 0).length,
      currentGap: currentGap(counts),
      longestGap: longestGap(counts),
      recent6Occurrences: recent6,
      previous6Occurrences: previous6,
      recent12Occurrences: sum(counts.slice(-12)),
      trendDelta6,
      trend: trendDelta6 > 0 ? 'RISING' as const : trendDelta6 < 0 ? 'FALLING' as const : 'FLAT' as const,
    };
  });
  return {
    province,
    scope: requestedDraws === 'all' ? 'ALL' : 'LATEST',
    requestedDraws: requestedDraws === 'all' ? dates.length : requestedDraws,
    drawCount: dates.length,
    firstDate: dates[0] ?? '',
    lastDate: dates.at(-1) ?? '',
    dates,
    draws,
    completeDraws: draws.filter((draw) => draw.complete).length,
    missingScheduledDates: scheduledDatesBetween(dates[0], dates.at(-1), province)
      .filter((date) => !dates.includes(date)),
    rows: matrixRows,
    rankings: {
      byTotalOccurrences: rank(matrixRows, (row) => row.totalOccurrences),
      byDrawAppearances: rank(matrixRows, (row) => row.drawAppearances),
      byRecent6Occurrences: rank(matrixRows, (row) => row.recent6Occurrences),
      byRisingTrend: rank(matrixRows, (row) => row.trendDelta6),
      byCurrentGap: rank(matrixRows, (row) => row.currentGap),
    },
  };
}

function scheduledDatesBetween(firstDate: string | undefined, lastDate: string | undefined, province: string): string[] {
  if (!firstDate || !lastDate) return [];
  const dates: string[] = [];
  const current = new Date(`${firstDate}T00:00:00.000Z`);
  const last = new Date(`${lastDate}T00:00:00.000Z`);
  while (current <= last) {
    const date = current.toISOString().slice(0, 10);
    if (getScheduledProvinces('mien-trung', date)?.includes(province)) dates.push(date);
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

function rank(rows: MienTrungFrequencyMatrixRow[], score: (row: MienTrungFrequencyMatrixRow) => number): string[] {
  return [...rows].sort((left, right) =>
    score(right) - score(left) || right.totalOccurrences - left.totalOccurrences || left.number.localeCompare(right.number))
    .slice(0, 10)
    .map((row) => row.number);
}

function currentGap(counts: number[]): number {
  let gap = 0;
  for (let index = counts.length - 1; index >= 0 && counts[index] === 0; index -= 1) gap += 1;
  return gap;
}

function longestGap(counts: number[]): number {
  let longest = 0;
  let current = 0;
  for (const count of counts) {
    if (count === 0) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
