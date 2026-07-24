import { PredictionLearningWeightModel } from '../models/PredictionLearningWeight';
import { getVietnamDateString } from '../utils/date';

export const MIEN_BAC_LAST2_MODEL_VERSION = 'mien-bac-last2-bayesian-v3-repeat-penalty';
export const MIEN_BAC_LAST2_PREDICTION_SNAPSHOT_VERSION = `${MIEN_BAC_LAST2_MODEL_VERSION}-prediction`;

export interface PredictionLearningWeights {
  modelVersion: string;
  predictionWeight: number;
  trendWeight: number;
  bothListBonus: number;
  bayesianLongTermWeight: number;
  bayesianMediumTermWeight: number;
  bayesianShortTermWeight: number;
  bayesianVeryRecentWeight: number;
  bayesianWeekdayWeight: number;
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
  bayesianLongTermWeight: 0.2,
  bayesianMediumTermWeight: 0.25,
  bayesianShortTermWeight: 0.25,
  bayesianVeryRecentWeight: 0.1,
  bayesianWeekdayWeight: 0.2,
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
    bayesianLongTermWeight: record.bayesianLongTermWeight ?? DEFAULT_PREDICTION_LEARNING_WEIGHTS.bayesianLongTermWeight,
    bayesianMediumTermWeight: record.bayesianMediumTermWeight ?? DEFAULT_PREDICTION_LEARNING_WEIGHTS.bayesianMediumTermWeight,
    bayesianShortTermWeight: record.bayesianShortTermWeight ?? DEFAULT_PREDICTION_LEARNING_WEIGHTS.bayesianShortTermWeight,
    bayesianVeryRecentWeight:
      record.bayesianVeryRecentWeight ?? DEFAULT_PREDICTION_LEARNING_WEIGHTS.bayesianVeryRecentWeight,
    bayesianWeekdayWeight: record.bayesianWeekdayWeight ?? DEFAULT_PREDICTION_LEARNING_WEIGHTS.bayesianWeekdayWeight,
    backtestDays: record.backtestDays,
    hitDayRate: record.hitDayRate,
    averageHitsPerDay: record.averageHitsPerDay,
    effectiveFromDate: record.effectiveFromDate,
  };
}

export async function savePredictionLearningWeights(
  input: Partial<Omit<PredictionLearningWeights, 'modelVersion' | 'effectiveFromDate'>> & {
    modelVersion?: string;
    effectiveFromDate?: string;
  },
): Promise<PredictionLearningWeights> {
  const modelVersion = input.modelVersion ?? MIEN_BAC_LAST2_MODEL_VERSION;
  const effectiveFromDate = input.effectiveFromDate ?? getVietnamDateString();
  const current = await getLatestPredictionLearningWeights(modelVersion);
  const record = await PredictionLearningWeightModel.create({
    modelVersion,
    predictionWeight: input.predictionWeight ?? current.predictionWeight,
    trendWeight: input.trendWeight ?? current.trendWeight,
    bothListBonus: input.bothListBonus ?? current.bothListBonus,
    bayesianLongTermWeight: input.bayesianLongTermWeight ?? current.bayesianLongTermWeight,
    bayesianMediumTermWeight: input.bayesianMediumTermWeight ?? current.bayesianMediumTermWeight,
    bayesianShortTermWeight: input.bayesianShortTermWeight ?? current.bayesianShortTermWeight,
    bayesianVeryRecentWeight: input.bayesianVeryRecentWeight ?? current.bayesianVeryRecentWeight,
    bayesianWeekdayWeight: input.bayesianWeekdayWeight ?? current.bayesianWeekdayWeight,
    backtestDays: input.backtestDays ?? current.backtestDays,
    hitDayRate: input.hitDayRate ?? current.hitDayRate,
    averageHitsPerDay: input.averageHitsPerDay ?? current.averageHitsPerDay,
    effectiveFromDate,
  });

  return {
    modelVersion: record.modelVersion,
    predictionWeight: record.predictionWeight,
    trendWeight: record.trendWeight,
    bothListBonus: record.bothListBonus,
    bayesianLongTermWeight: record.bayesianLongTermWeight,
    bayesianMediumTermWeight: record.bayesianMediumTermWeight,
    bayesianShortTermWeight: record.bayesianShortTermWeight,
    bayesianVeryRecentWeight: record.bayesianVeryRecentWeight,
    bayesianWeekdayWeight: record.bayesianWeekdayWeight,
    backtestDays: record.backtestDays,
    hitDayRate: record.hitDayRate,
    averageHitsPerDay: record.averageHitsPerDay,
    effectiveFromDate: record.effectiveFromDate,
  };
}
