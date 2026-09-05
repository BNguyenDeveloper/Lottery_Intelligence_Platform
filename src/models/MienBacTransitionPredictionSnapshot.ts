import { HydratedDocument, Schema, model } from 'mongoose';

interface MienBacTransitionSnapshotRow {
  rank: number;
  number: string;
  finalScore: string;
  baseScore: string;
  baseZScore: string;
  transitionResidual: string;
  transitionZScore: string;
  supportingEdges: number;
  drawsSinceLastSeen: number;
  historyDraws: number;
}

interface MienBacTransitionPredictionSnapshotShape {
  predictionDate: string;
  targetDate: string;
  region: 'mien-bac';
  province: 'xsmb';
  target: 'last2';
  modelVersion: string;
  formula: string;
  config: {
    priorStrength: number;
    topEdges: number;
    lags: number[];
    lagWeights: number[];
    lambda: number;
  };
  rows: MienBacTransitionSnapshotRow[];
}

const rowSchema = new Schema<MienBacTransitionSnapshotRow>({
  rank: { type: Number, required: true },
  number: { type: String, required: true },
  finalScore: { type: String, required: true },
  baseScore: { type: String, required: true },
  baseZScore: { type: String, required: true },
  transitionResidual: { type: String, required: true },
  transitionZScore: { type: String, required: true },
  supportingEdges: { type: Number, required: true },
  drawsSinceLastSeen: { type: Number, required: true },
  historyDraws: { type: Number, required: true },
}, { _id: false });

const schema = new Schema<MienBacTransitionPredictionSnapshotShape>({
  predictionDate: { type: String, required: true },
  targetDate: { type: String, required: true },
  region: { type: String, required: true, enum: ['mien-bac'] },
  province: { type: String, required: true, enum: ['xsmb'] },
  target: { type: String, required: true, enum: ['last2'] },
  modelVersion: { type: String, required: true },
  formula: { type: String, required: true },
  config: {
    priorStrength: { type: Number, required: true },
    topEdges: { type: Number, required: true },
    lags: { type: [Number], required: true },
    lagWeights: { type: [Number], required: true },
    lambda: { type: Number, required: true },
  },
  rows: { type: [rowSchema], required: true, default: [] },
}, { timestamps: true });

schema.index({ targetDate: 1, modelVersion: 1 }, { unique: true });
schema.index({ predictionDate: 1 });

export type MienBacTransitionPredictionSnapshotDocument = HydratedDocument<MienBacTransitionPredictionSnapshotShape>;
export const MienBacTransitionPredictionSnapshotModel = model<MienBacTransitionPredictionSnapshotShape>(
  'MienBacTransitionResidualPredictionSnapshot',
  schema,
  'mien_bac_transition_residual_prediction_snapshots',
);
