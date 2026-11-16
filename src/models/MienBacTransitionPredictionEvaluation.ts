import { HydratedDocument, Schema, model } from 'mongoose';

export interface MienBacTransitionPredictionEvaluationShape {
  targetDate: string;
  modelVersion: string;
  predictedCount: number;
  actualCount: number;
  hitCount: number;
  baseHitCount: number;
  hitNumbers: string[];
  missNumbers: string[];
  hitDay: boolean;
  hitAtLeast2?: boolean;
  signalLevel?: 'STRONG' | 'FAIR' | 'NORMAL';
  filterStatus?: 'QUALIFIES' | 'WATCH' | 'SKIP';
  conditionsPassed?: number;
  filterOutcome?: 'HIT_AT_LEAST_2' | 'MISS_UNDER_2' | 'NOT_QUALIFIED';
  randomBaselineHits: string;
  liftVsBase: string;
  liftVsRandom: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<MienBacTransitionPredictionEvaluationShape>({
  targetDate: { type: String, required: true },
  modelVersion: { type: String, required: true },
  predictedCount: { type: Number, required: true },
  actualCount: { type: Number, required: true },
  hitCount: { type: Number, required: true },
  baseHitCount: { type: Number, required: true },
  hitNumbers: { type: [String], required: true, default: [] },
  missNumbers: { type: [String], required: true, default: [] },
  hitDay: { type: Boolean, required: true },
  hitAtLeast2: { type: Boolean, required: false },
  signalLevel: { type: String, required: false, enum: ['STRONG', 'FAIR', 'NORMAL'] },
  filterStatus: { type: String, required: false, enum: ['QUALIFIES', 'WATCH', 'SKIP'] },
  conditionsPassed: { type: Number, required: false },
  filterOutcome: { type: String, required: false, enum: ['HIT_AT_LEAST_2', 'MISS_UNDER_2', 'NOT_QUALIFIED'] },
  randomBaselineHits: { type: String, required: true },
  liftVsBase: { type: String, required: true },
  liftVsRandom: { type: String, required: true },
}, { timestamps: true });

schema.index({ targetDate: 1, modelVersion: 1 }, { unique: true });
schema.index({ targetDate: -1 });

export type MienBacTransitionPredictionEvaluationDocument = HydratedDocument<MienBacTransitionPredictionEvaluationShape>;
export const MienBacTransitionPredictionEvaluationModel = model<MienBacTransitionPredictionEvaluationShape>(
  'MienBacTransitionPredictionEvaluation',
  schema,
  'mien_bac_transition_prediction_evaluations',
);
