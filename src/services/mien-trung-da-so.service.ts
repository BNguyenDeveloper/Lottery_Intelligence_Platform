import { LotteryNumberMienTrungModel } from '../models/LotteryNumber';
import { buildDaSoPredictionFromDailyHits, MienBacDaSoPrediction } from './mien-bac-da-so.service';
import { DailyHits, pickBayesianWeights } from './mien-bac-prediction.service';
import { DEFAULT_PREDICTION_LEARNING_WEIGHTS } from './prediction-learning-weight.service';

interface HistoryRow { date: string; last2: string }
export const MIEN_TRUNG_DA_SO_MODEL_VERSION = 'mien-trung-last2-da-so-v1';

export async function getMienTrungDaSoPrediction(options: {
  province: string;
  targetDate: string;
  historyDays: number;
  numberTop?: number;
  candidatePool?: number;
  pairTop?: number;
}): Promise<MienBacDaSoPrediction | undefined> {
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
  const throughDate = dailyHits.at(-1)?.date;
  if (!throughDate) return undefined;
  return buildDaSoPredictionFromDailyHits(dailyHits, throughDate, {
    historyDays: options.historyDays,
    numberTop: options.numberTop ?? 5,
    candidatePool: options.candidatePool ?? 20,
    pairTop: options.pairTop ?? 10,
    targetDate: options.targetDate,
    predictionWeights: pickBayesianWeights(DEFAULT_PREDICTION_LEARNING_WEIGHTS),
  });
}

function buildDailyHits(rows: HistoryRow[]): DailyHits[] {
  const grouped = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.last2) continue;
    if (!grouped.has(row.date)) grouped.set(row.date, new Set());
    grouped.get(row.date)?.add(row.last2);
  }
  return [...grouped.entries()].map(([date, values]) => ({
    date, values, dayOfWeek: new Date(`${date}T00:00:00.000Z`).getUTCDay(),
  }));
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
