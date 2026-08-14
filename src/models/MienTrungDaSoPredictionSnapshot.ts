import { HydratedDocument, Schema, model } from 'mongoose';
import { DaSoSnapshotPair } from './DaSoPredictionSnapshot';

interface MienTrungDaSoPredictionSnapshotShape {
  predictionDate: string;
  targetDate: string;
  region: 'mien-trung';
  province: string;
  target: 'last2';
  modelVersion: string;
  selectedNumbers: string[];
  pairs: DaSoSnapshotPair[];
  formula: string;
  weights: { individual: number; coOccurrence: number; recentCoOccurrence: number; associationLift: number };
}

const pairSchema = new Schema<DaSoSnapshotPair>(
  {
    rank: Number, pair: String, numberA: String, numberB: String, score: String,
    individualScore: String, coOccurrenceScore: String, recentCoOccurrenceScore: String,
    liftScore: String, estimatedPairRate: String, associationLift: String,
  },
  { _id: false },
);

const schema = new Schema<MienTrungDaSoPredictionSnapshotShape>(
  {
    predictionDate: { type: String, required: true },
    targetDate: { type: String, required: true },
    region: { type: String, enum: ['mien-trung'], required: true },
    province: { type: String, required: true },
    target: { type: String, enum: ['last2'], required: true },
    modelVersion: { type: String, required: true },
    selectedNumbers: { type: [String], required: true },
    pairs: { type: [pairSchema], required: true },
    formula: { type: String, required: true },
    weights: {
      individual: { type: Number, required: true },
      coOccurrence: { type: Number, required: true },
      recentCoOccurrence: { type: Number, required: true },
      associationLift: { type: Number, required: true },
    },
  },
  { timestamps: true },
);

schema.index({ targetDate: 1, province: 1, modelVersion: 1 }, { unique: true });
export type MienTrungDaSoPredictionSnapshotDocument = HydratedDocument<MienTrungDaSoPredictionSnapshotShape>;
export const MienTrungDaSoPredictionSnapshotModel = model<MienTrungDaSoPredictionSnapshotShape>(
  'MienTrungDaSoPredictionSnapshot',
  schema,
  'mien_trung_da_so_prediction_snapshots',
);
