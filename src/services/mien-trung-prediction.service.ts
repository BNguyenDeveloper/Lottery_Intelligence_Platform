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
  provinceDraws: number;
  regionalDraws: number;
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
      provinceDraws: provinceDraws.length,
      regionalDraws: regionalTraining.length,
    }));
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
