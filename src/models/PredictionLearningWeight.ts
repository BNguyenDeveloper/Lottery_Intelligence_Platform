import { HydratedDocument, Schema, model } from 'mongoose';

export interface PredictionLearningWeightDocumentShape {
  modelVersion: string;
  predictionWeight: number;
  trendWeight: number;
  bothListBonus: number;
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
