import { LotteryNumberMienTrungModel } from '../models/LotteryNumber';
import {
  BayesianPredictionWeights,
  buildCandidates,
  DailyHits,
  MienBacPredictionRow,
  rankCandidates,
  ScoredCandidate,
} from './mien-bac-prediction.service';

export const MIEN_TRUNG_LAST2_MODEL_VERSION = 'mien-trung-last2-hierarchical-v2';
export const MIEN_TRUNG_PROVINCE_PRIOR_STRENGTH = 52;
export const MIEN_TRUNG_HIERARCHICAL_FORMULA =
  'score = provinceWeight*provinceRankScore + (1-provinceWeight)*regionalRankScore; provinceWeight = provinceDraws/(provinceDraws+52)';
export const MIEN_TRUNG_MULTI_HIT_AVERAGE_SCORE_THRESHOLD = 0.918305;
export const MIEN_TRUNG_MULTI_HIT_MINIMUM_SCORE_THRESHOLD = 0.880383;
export const MIEN_TRUNG_MULTI_HIT_AVERAGE_ABSENCE_THRESHOLD = 2.2;
export const MIEN_TRUNG_MULTI_HIT_TOP1_TOP2_GAP_THRESHOLD = 0.023801;

// Mien Trung owns these weights. Weekday is zero because a province normally
// draws on a fixed weekday, so province and weekday encode the same information.
export const MIEN_TRUNG_BAYESIAN_WEIGHTS: BayesianPredictionWeights = {
  bayesianLongTermWeight: 0.1874,
  bayesianMediumTermWeight: 0.2482,
  bayesianShortTermWeight: 0.3317,
  bayesianVeryRecentWeight: 0.2327,
  bayesianWeekdayWeight: 0,
};

export interface MienTrungHistoryDraw extends DailyHits {
  province: string;
}

export interface MienTrungHierarchicalPredictionRow extends MienBacPredictionRow {
  provinceRankScore: string;
  regionalRankScore: string;
  provinceWeight: string;
  drawsSinceLastSeen: number;
  provinceDraws: number;
  regionalDraws: number;
}

export interface MienTrungProvinceMultiHitSignal {
  level: 'STRONG' | 'FAIR' | 'NORMAL';
  filterStatus: 'QUALIFIES' | 'WATCH' | 'SKIP';
  conditionsPassed: number;
  averageScore: string;
  minimumScore: string;
  averageDrawsSinceLastSeen: string;
  top1Top2Gap: string;
  referenceHitAtLeast2Rate: string;
  referenceSampleSize: number;
  conclusion: string;
}

interface HistoryRow {
  date: string;
  province: string;
  last2: string;
}

export async function predictMienTrungProvinceLast2(options: {
  province: string;
  targetDate: string;
  historyDays: number;
  top: number;
}): Promise<MienTrungHierarchicalPredictionRow[]> {
  const fromDate = shiftDate(options.targetDate, -(options.historyDays - 1));
  const rows = await LotteryNumberMienTrungModel.find({
    date: { $gte: fromDate, $lt: options.targetDate },
  })
    .select({ date: 1, province: 1, last2: 1 })
    .sort({ date: 1, province: 1 })
    .lean<HistoryRow[]>()
    .exec();

  return predictMienTrungHierarchicalFromDraws(buildProvinceDraws(rows), options.province, options.targetDate, options.top);
}

export function predictMienTrungHierarchicalFromDraws(
  history: MienTrungHistoryDraw[],
  province: string,
  targetDate: string,
  top = 5,
  priorStrength = MIEN_TRUNG_PROVINCE_PRIOR_STRENGTH,
): MienTrungHierarchicalPredictionRow[] {
  const eligible = history.filter((draw) => draw.date < targetDate);
  const provinceDraws = eligible.filter((draw) => draw.province === province);
  if (provinceDraws.length === 0) return [];

  const firstProvinceDate = provinceDraws[0].date;
  const regionalDraws = groupRegionalDraws(
    eligible.filter((draw) => draw.province !== province && draw.date >= firstProvinceDate),
  );
  const regionalTraining = regionalDraws.length > 0 ? regionalDraws : provinceDraws;
  const candidates = buildCandidates('last2');
  const provinceRanked = rankCandidates(candidates, provinceDraws, candidates.length, MIEN_TRUNG_BAYESIAN_WEIGHTS, 0.05, targetDate);
  const regionalRanked = rankCandidates(candidates, regionalTraining, candidates.length, MIEN_TRUNG_BAYESIAN_WEIGHTS, 0.05, targetDate);
  const provinceByNumber = new Map(provinceRanked.map((row) => [row.number, row]));
  const provinceRanks = rankScores(provinceRanked);
  const regionalRanks = rankScores(regionalRanked);
  const provinceWeight = provinceDraws.length / (provinceDraws.length + Math.max(priorStrength, 0));

  return candidates
    .map((number) => {
      const provinceRow = provinceByNumber.get(number) as ScoredCandidate;
      const provinceRankScore = provinceRanks.get(number) ?? 0;
      const regionalRankScore = regionalRanks.get(number) ?? 0;
      return {
        provinceRow,
        provinceRankScore,
        regionalRankScore,
        score: provinceWeight * provinceRankScore + (1 - provinceWeight) * regionalRankScore,
      };
    })
    .sort((left, right) =>
      right.score - left.score || right.provinceRankScore - left.provinceRankScore ||
      left.provinceRow.number.localeCompare(right.provinceRow.number))
    .slice(0, top)
    .map((entry, index) => ({
      rank: index + 1,
      number: entry.provinceRow.number,
      count: entry.provinceRow.count,
      lastSeenDate: entry.provinceRow.lastSeenDate,
      gapDays: entry.provinceRow.gapDays,
      score: format(entry.score),
      repeatPenalty: format(entry.provinceRow.repeatPenalty),
      frequencyScore: format(entry.provinceRow.frequencyScore),
      recentScore: format(entry.provinceRow.recentScore),
      trendScore: format(entry.provinceRow.trendScore),
      recencyScore: format(entry.provinceRow.recencyScore),
      gapScore: format(entry.provinceRow.gapScore),
      weekdayScore: format(entry.provinceRow.weekdayScore),
      markovScore: format(entry.provinceRow.markovScore),
      soiCauScore: format(entry.provinceRow.soiCauScore),
      reverseScore: format(entry.provinceRow.reverseScore),
      cycleScore: format(entry.provinceRow.cycleScore),
      digitScore: format(entry.provinceRow.digitScore),
      bridgeScore: format(entry.provinceRow.bridgeScore),
      provinceRankScore: format(entry.provinceRankScore),
      regionalRankScore: format(entry.regionalRankScore),
      provinceWeight: format(provinceWeight),
      drawsSinceLastSeen: countDrawsSinceLastSeen(entry.provinceRow.number, provinceDraws),
      provinceDraws: provinceDraws.length,
      regionalDraws: regionalTraining.length,
    }));
}

function countDrawsSinceLastSeen(candidate: string, draws: MienTrungHistoryDraw[]): number {
  for (let index = draws.length - 1; index >= 0; index -= 1) {
    if (draws[index].values.has(candidate)) return draws.length - index - 1;
  }
  return draws.length;
}

export function buildProvinceDraws(rows: HistoryRow[]): MienTrungHistoryDraw[] {
  const grouped = new Map<string, MienTrungHistoryDraw>();
  for (const row of rows) {
    if (!row.last2) continue;
    const key = `${row.province}|${row.date}`;
    const current = grouped.get(key) ?? {
      province: row.province,
      date: row.date,
      dayOfWeek: dayOfWeek(row.date),
      values: new Set<string>(),
    };
    current.values.add(row.last2);
    grouped.set(key, current);
  }
  return [...grouped.values()].sort((left, right) =>
    left.date.localeCompare(right.date) || left.province.localeCompare(right.province));
}

export function buildMienTrungProvinceMultiHitSignal(
  rows: MienTrungHierarchicalPredictionRow[],
): MienTrungProvinceMultiHitSignal {
  const ranked = [...rows].sort((left, right) => left.rank - right.rank);
  const scores = ranked.map((row) => Number(row.score));
  const averageScore = average(scores);
  const minimumScore = scores.length > 0 ? Math.min(...scores) : 0;
  const averageDrawsSinceLastSeen = average(ranked.map((row) => row.drawsSinceLastSeen));
  const top1Top2Gap = scores.length >= 2 ? scores[0] - scores[1] : 0;
  const conditionsPassed = [
    averageScore > MIEN_TRUNG_MULTI_HIT_AVERAGE_SCORE_THRESHOLD,
    minimumScore > MIEN_TRUNG_MULTI_HIT_MINIMUM_SCORE_THRESHOLD,
    averageDrawsSinceLastSeen > MIEN_TRUNG_MULTI_HIT_AVERAGE_ABSENCE_THRESHOLD,
    top1Top2Gap > MIEN_TRUNG_MULTI_HIT_TOP1_TOP2_GAP_THRESHOLD,
  ].filter(Boolean).length;
  const level: MienTrungProvinceMultiHitSignal['level'] = conditionsPassed >= 3
    ? 'STRONG' : conditionsPassed === 2 ? 'FAIR' : 'NORMAL';
  const filterStatus: MienTrungProvinceMultiHitSignal['filterStatus'] = level === 'STRONG'
    ? 'QUALIFIES' : level === 'FAIR' ? 'WATCH' : 'SKIP';
  const reference = level === 'STRONG'
    ? { rate: '36.84%', sample: 19 }
    : level === 'FAIR'
      ? { rate: '22.97%', sample: 74 }
      : { rate: '13.84%', sample: 159 };
  const conclusion = level === 'STRONG'
    ? 'Strong experimental >=2 signal for this province; reference sample is small.'
    : level === 'FAIR'
      ? 'Fair experimental >=2 signal for this province; watch rather than qualify.'
      : 'No strong >=2 indication for this province.';
  return { level, filterStatus, conditionsPassed, averageScore: format(averageScore), minimumScore: format(minimumScore),
    averageDrawsSinceLastSeen: averageDrawsSinceLastSeen.toFixed(2), top1Top2Gap: format(top1Top2Gap),
    referenceHitAtLeast2Rate: reference.rate, referenceSampleSize: reference.sample, conclusion };
}

function groupRegionalDraws(draws: MienTrungHistoryDraw[]): DailyHits[] {
  const grouped = new Map<string, Set<string>>();
  for (const draw of draws) {
    const values = grouped.get(draw.date) ?? new Set<string>();
    for (const value of draw.values) values.add(value);
    grouped.set(draw.date, values);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, values]) => ({ date, dayOfWeek: dayOfWeek(date), values }));
}

function rankScores(rows: ScoredCandidate[]): Map<string, number> {
  const denominator = Math.max(rows.length - 1, 1);
  return new Map(rows.map((row, index) => [row.number, 1 - index / denominator]));
}

function dayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function format(value: number): string {
  return value.toFixed(6);
}

function average(values: number[]): number {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}
