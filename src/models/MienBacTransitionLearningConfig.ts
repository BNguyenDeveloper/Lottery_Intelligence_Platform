import { HydratedDocument, Schema, model } from 'mongoose';

export interface MienBacTransitionLearningConfigShape {
  modelVersion: string;
  priorStrength: number;
  topEdges: number;
  lags: number[];
  lagWeights: number[];
  lambda: number;
  backtestDays: number;
  baseHitsPerDraw: string;
  transitionHitsPerDraw: string;
  liftVsBase: string;
  liveEvaluatedDays: number;
  liveBaseHitsPerDraw: string;
  liveTransitionHitsPerDraw: string;
  learningBlocked: boolean;
  sourceEvaluationDate: string;
  effectiveFromDate: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<MienBacTransitionLearningConfigShape>({
  modelVersion: { type: String, required: true },
  priorStrength: { type: Number, required: true },
  topEdges: { type: Number, required: true },
  lags: { type: [Number], required: true },
  lagWeights: { type: [Number], required: true },
  lambda: { type: Number, required: true },
  backtestDays: { type: Number, required: true },
  baseHitsPerDraw: { type: String, required: true },
  transitionHitsPerDraw: { type: String, required: true },
  liftVsBase: { type: String, required: true },
  liveEvaluatedDays: { type: Number, required: true },
  liveBaseHitsPerDraw: { type: String, required: true },
  liveTransitionHitsPerDraw: { type: String, required: true },
  learningBlocked: { type: Boolean, required: true },
  sourceEvaluationDate: { type: String, required: true },
  effectiveFromDate: { type: String, required: true },
}, { timestamps: true });

schema.index({ modelVersion: 1, effectiveFromDate: -1 });
schema.index({ modelVersion: 1, sourceEvaluationDate: 1 }, { unique: true });
schema.index({ createdAt: -1 });

export type MienBacTransitionLearningConfigDocument = HydratedDocument<MienBacTransitionLearningConfigShape>;
export const MienBacTransitionLearningConfigModel = model<MienBacTransitionLearningConfigShape>(
  'MienBacTransitionLearningConfig',
  schema,
  'mien_bac_transition_learning_configs',
);
