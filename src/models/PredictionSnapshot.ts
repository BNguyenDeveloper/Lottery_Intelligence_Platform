import { HydratedDocument, Schema, model } from 'mongoose';

export interface PredictionSnapshotRow {
  rank: number;
  number: string;
  predictionScore: string;
  trendScore: string;
  combinedScore: string;
  source: string;
}

export interface PredictionSnapshotDocumentShape {
  predictionDate: string;
  targetDate: string;
  region: 'mien-bac';
  province: 'xsmb';
  target: 'last2';
  kind: 'prediction' | 'blend';
  rows: PredictionSnapshotRow[];
  modelVersion: string;
  createdAt: Date;
  updatedAt: Date;
}

const predictionSnapshotRowSchema = new Schema<PredictionSnapshotRow>(
  {
    rank: { type: Number, required: true },
    number: { type: String, required: true },
    predictionScore: { type: String, required: true },
    trendScore: { type: String, required: true },
    combinedScore: { type: String, required: true },
    source: { type: String, required: true },
  },
  { _id: false },
);

const predictionSnapshotSchema = new Schema<PredictionSnapshotDocumentShape>(
  {
    predictionDate: { type: String, required: true },
    targetDate: { type: String, required: true },
    region: { type: String, required: true, enum: ['mien-bac'] },
    province: { type: String, required: true, enum: ['xsmb'] },
    target: { type: String, required: true, enum: ['last2'] },
    kind: { type: String, required: true, enum: ['prediction', 'blend'], default: 'blend' },
    rows: { type: [predictionSnapshotRowSchema], required: true, default: [] },
    modelVersion: { type: String, required: true },
  },
  { timestamps: true },
);

predictionSnapshotSchema.index(
  { targetDate: 1, region: 1, province: 1, target: 1, kind: 1, modelVersion: 1 },
  { unique: true },
);
predictionSnapshotSchema.index({ predictionDate: 1 });
predictionSnapshotSchema.index({ targetDate: 1 });

export type PredictionSnapshotDocument = HydratedDocument<PredictionSnapshotDocumentShape>;

export const PredictionSnapshotModel = model<PredictionSnapshotDocumentShape>(
  'PredictionSnapshot',
  predictionSnapshotSchema,
  'prediction_snapshots',
);
