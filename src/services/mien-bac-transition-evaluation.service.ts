import { LotteryNumberMienBacModel } from '../models/LotteryNumber';
import { MienBacTransitionPredictionEvaluationModel } from '../models/MienBacTransitionPredictionEvaluation';
import { MienBacTransitionPredictionSnapshotModel } from '../models/MienBacTransitionPredictionSnapshot';
import { PredictionSnapshotModel } from '../models/PredictionSnapshot';
import { MIEN_BAC_TRANSITION_MODEL_VERSION } from './mien-bac-transition-matrix.service';
import { MIEN_BAC_LAST2_PREDICTION_SNAPSHOT_VERSION } from './prediction-learning-weight.service';

export async function evaluateMienBacTransitionPrediction(targetDate: string) {
  const snapshot = await MienBacTransitionPredictionSnapshotModel.findOne({
    targetDate,
    modelVersion: MIEN_BAC_TRANSITION_MODEL_VERSION,
  }).lean().exec();
  if (!snapshot) return undefined;
  const actualRows = await LotteryNumberMienBacModel.find({ date: targetDate, province: 'xsmb' })
    .select({ last2: 1 }).lean<Array<{ last2: string }>>().exec();
  const actual = new Set(actualRows.map((row) => row.last2));
  if (actual.size === 0) return undefined;
  const baseSnapshot = await PredictionSnapshotModel.findOne({
    targetDate,
    region: 'mien-bac',
    province: 'xsmb',
    target: 'last2',
    kind: 'prediction',
    modelVersion: MIEN_BAC_LAST2_PREDICTION_SNAPSHOT_VERSION,
  }).lean().exec();
  if (!baseSnapshot) return undefined;
  const predicted = [...snapshot.rows].sort((left, right) => left.rank - right.rank).map((row) => row.number);
  const base = [...baseSnapshot.rows].sort((left, right) => left.rank - right.rank).map((row) => row.number);
  const hitNumbers = predicted.filter((number) => actual.has(number));
  const missNumbers = predicted.filter((number) => !actual.has(number));
  const baseHitCount = base.filter((number) => actual.has(number)).length;
  const randomBaseline = predicted.length * actual.size / 100;
  const result = {
    targetDate,
    modelVersion: MIEN_BAC_TRANSITION_MODEL_VERSION,
    predictedCount: predicted.length,
    actualCount: actual.size,
    hitCount: hitNumbers.length,
    baseHitCount,
    hitNumbers,
    missNumbers,
    hitDay: hitNumbers.length > 0,
    randomBaselineHits: randomBaseline.toFixed(3),
    liftVsBase: percent((hitNumbers.length - baseHitCount) / Math.max(baseHitCount, Number.EPSILON)),
    liftVsRandom: percent((hitNumbers.length - randomBaseline) / Math.max(randomBaseline, Number.EPSILON)),
  };
  await MienBacTransitionPredictionEvaluationModel.updateOne(
    { targetDate, modelVersion: MIEN_BAC_TRANSITION_MODEL_VERSION },
    { $set: result },
    { upsert: true },
  ).exec();
  return result;
}

function percent(value: number): string { return `${(value * 100).toFixed(2)}%`; }
