import { LotteryNumberMienBacModel } from '../models/LotteryNumber';
import { DaSoPredictionSnapshotModel } from '../models/DaSoPredictionSnapshot';
import { DaSoPredictionEvaluationModel } from '../models/DaSoPredictionEvaluation';
import { logger } from '../utils/logger';
import { MIEN_BAC_DA_SO_MODEL_VERSION } from './mien-bac-da-so.service';

export async function evaluateMienBacDaSo(targetDate: string) {
  const snapshot = await DaSoPredictionSnapshotModel.findOne({ targetDate, modelVersion: MIEN_BAC_DA_SO_MODEL_VERSION }).lean().exec();
  if (!snapshot) { logger.warn('No Mien Bac da so snapshot found', { targetDate }); return undefined; }
  const rows = await LotteryNumberMienBacModel.find({ date: targetDate, province: 'xsmb' }).select({ last2: 1 }).lean<Array<{ last2: string }>>().exec();
  const actual = new Set(rows.map((row) => row.last2));
  if (actual.size === 0) { logger.warn('No Mien Bac actual values for da so evaluation', { targetDate }); return undefined; }
  const hitPairs = snapshot.pairs.filter((pair) => actual.has(pair.numberA) && actual.has(pair.numberB)).map((pair) => pair.pair);
  const missPairs = snapshot.pairs.filter((pair) => !hitPairs.includes(pair.pair)).map((pair) => pair.pair);
  const actualPairCount = choose2(actual.size);
  const randomAverage = snapshot.pairs.length * actualPairCount / choose2(100);
  const randomHitDayRate = 1 - missProbability(choose2(100), actualPairCount, snapshot.pairs.length);
  const pairHitCount = hitPairs.length;
  const result = { targetDate, modelVersion: MIEN_BAC_DA_SO_MODEL_VERSION, predictedPairCount: snapshot.pairs.length, actualNumberCount: actual.size, actualPairCount, pairHitCount, hitPairs, missPairs, topPairHit: snapshot.pairs[0] ? hitPairs.includes(snapshot.pairs[0].pair) : false, hitDay: pairHitCount > 0, pairHitRate: percent(pairHitCount / Math.max(snapshot.pairs.length, 1)), randomBaselineAveragePairHits: randomAverage.toFixed(3), randomBaselineHitDayRate: percent(randomHitDayRate), liftVsRandom: percent(pairHitCount / Math.max(randomAverage, Number.EPSILON) - 1) };
  await DaSoPredictionEvaluationModel.updateOne({ targetDate, modelVersion: MIEN_BAC_DA_SO_MODEL_VERSION }, { $set: result }, { upsert: true }).exec();
  logger.info('Mien Bac da so evaluated', result);
  return result;
}
function choose2(value: number): number { return value * (value - 1) / 2; }
function missProbability(universe: number, successes: number, draws: number): number { let value = 1; for (let i = 0; i < draws; i += 1) value *= (universe - successes - i) / (universe - i); return Math.max(0, Math.min(1, value)); }
function percent(value: number): string { return `${(value * 100).toFixed(2)}%`; }
