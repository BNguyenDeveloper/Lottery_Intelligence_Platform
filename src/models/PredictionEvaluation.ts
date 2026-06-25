import { HydratedDocument, Schema, model } from 'mongoose';

export interface PredictionEvaluationDocumentShape {
  targetDate: string;
  region: 'mien-bac';
  province: 'xsmb';
  target: 'last2';
  modelVersion: string;
  predictedCount: number;
  actualCount: number;
  hitCount: number;
  hitNumbers: string[];
  missNumbers: string[];
  top1Hit: boolean;
  top3Hit: boolean;
  top5Hit: boolean;
  top10Hit: boolean;
  hitRate: string;
  createdAt: Date;
  updatedAt: Date;
}

const predictionEvaluationSchema = new Schema<PredictionEvaluationDocumentShape>(
  {
    targetDate: { type: String, required: true },
    region: { type: String, required: true, enum: ['mien-bac'] },
    province: { type: String, required: true, enum: ['xsmb'] },
    target: { type: String, required: true, enum: ['last2'] },
    modelVersion: { type: String, required: true },
    predictedCount: { type: Number, required: true },
    actualCount: { type: Number, required: true },
    hitCount: { type: Number, required: true },
    hitNumbers: { type: [String], required: true, default: [] },
    missNumbers: { type: [String], required: true, default: [] },
    top1Hit: { type: Boolean, required: true },
    top3Hit: { type: Boolean, required: true },
    top5Hit: { type: Boolean, required: true },
    top10Hit: { type: Boolean, required: true },
    hitRate: { type: String, required: true },
  },
  { timestamps: true },
);

predictionEvaluationSchema.index({ targetDate: 1, region: 1, province: 1, target: 1, modelVersion: 1 }, { unique: true });
predictionEvaluationSchema.index({ targetDate: 1 });

export type PredictionEvaluationDocument = HydratedDocument<PredictionEvaluationDocumentShape>;

export const PredictionEvaluationModel = model<PredictionEvaluationDocumentShape>(
  'PredictionEvaluation',
  predictionEvaluationSchema,
  'prediction_evaluations',
);
