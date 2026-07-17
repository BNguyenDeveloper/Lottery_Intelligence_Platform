import { PredictionLearningWeightModel } from '../models/PredictionLearningWeight';
import { getVietnamDateString } from '../utils/date';

export const MIEN_BAC_LAST2_MODEL_VERSION = 'mien-bac-last2-bayesian-v2';

export interface PredictionLearningWeights {
  modelVersion: string;
  predictionWeight: number;
  trendWeight: number;
  bothListBonus: number;
  backtestDays: number;
  hitDayRate: string;
  averageHitsPerDay: string;
  effectiveFromDate: string;
}

export const DEFAULT_PREDICTION_LEARNING_WEIGHTS: PredictionLearningWeights = {
  modelVersion: MIEN_BAC_LAST2_MODEL_VERSION,
  predictionWeight: 0.65,
  trendWeight: 0.35,
  bothListBonus: 0.05,
  backtestDays: 0,
  hitDayRate: '0.00%',
  averageHitsPerDay: '0.00',
  effectiveFromDate: 'default',
};

export async function getLatestPredictionLearningWeights(
  modelVersion = MIEN_BAC_LAST2_MODEL_VERSION,
): Promise<PredictionLearningWeights> {
  const record = await PredictionLearningWeightModel.findOne({ modelVersion })
    .sort({ effectiveFromDate: -1, createdAt: -1 })
    .lean()
    .exec();

  if (!record) {
    return { ...DEFAULT_PREDICTION_LEARNING_WEIGHTS, modelVersion };
  }

  return {
    modelVersion: record.modelVersion,
    predictionWeight: record.predictionWeight,
    trendWeight: record.trendWeight,
    bothListBonus: record.bothListBonus,
    backtestDays: record.backtestDays,
    hitDayRate: record.hitDayRate,
    averageHitsPerDay: record.averageHitsPerDay,
    effectiveFromDate: record.effectiveFromDate,
  };
}

export async function savePredictionLearningWeights(
  input: Omit<PredictionLearningWeights, 'modelVersion' | 'effectiveFromDate'> & {
    modelVersion?: string;
    effectiveFromDate?: string;
  },
): Promise<PredictionLearningWeights> {
  const modelVersion = input.modelVersion ?? MIEN_BAC_LAST2_MODEL_VERSION;
  const effectiveFromDate = input.effectiveFromDate ?? getVietnamDateString();
  const record = await PredictionLearningWeightModel.create({
    modelVersion,
    predictionWeight: input.predictionWeight,
    trendWeight: input.trendWeight,
    bothListBonus: input.bothListBonus,
    backtestDays: input.backtestDays,
    hitDayRate: input.hitDayRate,
    averageHitsPerDay: input.averageHitsPerDay,
    effectiveFromDate,
  });

  return {
    modelVersion: record.modelVersion,
    predictionWeight: record.predictionWeight,
    trendWeight: record.trendWeight,
    bothListBonus: record.bothListBonus,
    backtestDays: record.backtestDays,
    hitDayRate: record.hitDayRate,
    averageHitsPerDay: record.averageHitsPerDay,
    effectiveFromDate: record.effectiveFromDate,
  };
}
