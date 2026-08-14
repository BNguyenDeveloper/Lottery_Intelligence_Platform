import { LotteryNumberMienTrungModel } from '../models/LotteryNumber';
import {
  buildCandidates,
  DailyHits,
  MienBacPredictionRow,
  pickBayesianWeights,
  rankCandidates,
} from './mien-bac-prediction.service';
import { DEFAULT_PREDICTION_LEARNING_WEIGHTS } from './prediction-learning-weight.service';

interface HistoryRow {
  date: string;
  last2: string;
}

export const MIEN_TRUNG_LAST2_MODEL_VERSION = 'mien-trung-last2-bayesian-v1-soi-cau-005';

export async function predictMienTrungProvinceLast2(options: {
  province: string;
  targetDate: string;
  historyDays: number;
  top: number;
}): Promise<MienBacPredictionRow[]> {
  const fromDate = shiftDate(options.targetDate, -(options.historyDays - 1));
  const rows = await LotteryNumberMienTrungModel.find({
    province: options.province,
    date: { $gte: fromDate, $lt: options.targetDate },
  })
    .select({ date: 1, last2: 1 })
    .sort({ date: 1 })
    .lean<HistoryRow[]>()
    .exec();

  const dailyHits = buildDailyHits(rows);
  if (dailyHits.length === 0) return [];

  // Keep the new regional task isolated from Mien Bac's learned production weights.
  const weights = pickBayesianWeights(DEFAULT_PREDICTION_LEARNING_WEIGHTS);
  return rankCandidates(buildCandidates('last2'), dailyHits, options.top, weights, 0.05, options.targetDate).map(
    (row, index) => ({
      rank: index + 1,
      number: row.number,
      count: row.count,
      lastSeenDate: row.lastSeenDate,
      gapDays: row.gapDays,
      score: format(row.score),
      repeatPenalty: format(row.repeatPenalty),
      frequencyScore: format(row.frequencyScore),
      recentScore: format(row.recentScore),
      trendScore: format(row.trendScore),
      recencyScore: format(row.recencyScore),
      gapScore: format(row.gapScore),
      weekdayScore: format(row.weekdayScore),
      markovScore: format(row.markovScore),
      soiCauScore: format(row.soiCauScore),
      reverseScore: format(row.reverseScore),
      cycleScore: format(row.cycleScore),
      digitScore: format(row.digitScore),
      bridgeScore: format(row.bridgeScore),
    }),
  );
}

function buildDailyHits(rows: HistoryRow[]): DailyHits[] {
  const grouped = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.last2) continue;
    if (!grouped.has(row.date)) grouped.set(row.date, new Set());
    grouped.get(row.date)?.add(row.last2);
  }
  return [...grouped.entries()].map(([date, values]) => ({
    date,
    dayOfWeek: new Date(`${date}T00:00:00.000Z`).getUTCDay(),
    values,
  }));
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function format(value: number): string {
  return value.toFixed(6);
}
