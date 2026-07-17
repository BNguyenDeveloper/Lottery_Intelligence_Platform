import { HydratedDocument, Schema, model } from 'mongoose';

export interface PredictionLearningWeightDocumentShape {
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
  createdAt: Date;
  updatedAt: Date;
}

const predictionLearningWeightSchema = new Schema<PredictionLearningWeightDocumentShape>(
  {
    modelVersion: { type: String, required: true },
    predictionWeight: { type: Number, required: true },
    trendWeight: { type: Number, required: true },
    bothListBonus: { type: Number, required: true },
    bayesianLongTermWeight: { type: Number, required: true, default: 0.2 },
    bayesianMediumTermWeight: { type: Number, required: true, default: 0.25 },
    bayesianShortTermWeight: { type: Number, required: true, default: 0.25 },
    bayesianVeryRecentWeight: { type: Number, required: true, default: 0.1 },
    bayesianWeekdayWeight: { type: Number, required: true, default: 0.2 },
    backtestDays: { type: Number, required: true },
    hitDayRate: { type: String, required: true },
    averageHitsPerDay: { type: String, required: true },
    effectiveFromDate: { type: String, required: true },
  },
  { timestamps: true },
);

predictionLearningWeightSchema.index({ modelVersion: 1, effectiveFromDate: -1 });
predictionLearningWeightSchema.index({ createdAt: -1 });

export type PredictionLearningWeightDocument = HydratedDocument<PredictionLearningWeightDocumentShape>;

export const PredictionLearningWeightModel = model<PredictionLearningWeightDocumentShape>(
  'PredictionLearningWeight',
  predictionLearningWeightSchema,
  'prediction_learning_weights',
);
