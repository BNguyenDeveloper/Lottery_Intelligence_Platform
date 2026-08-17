import { Schema, model } from 'mongoose';

interface MienTrungSpecialLast3SnapshotShape {
  predictionDate: string;
  targetDate: string;
  region: 'mien-trung';
  province: string;
  target: 'special-last3';
  number: string;
  score: string;
  regionalScore: string;
  provinceScore: string;
  trendScore: string;
  transitionScore: string;
  regionalDraws: number;
  provinceDraws: number;
  formula: string;
  modelVersion: string;
}

const schema = new Schema<MienTrungSpecialLast3SnapshotShape>({
  predictionDate: { type: String, required: true },
  targetDate: { type: String, required: true },
  region: { type: String, required: true, enum: ['mien-trung'] },
  province: { type: String, required: true },
  target: { type: String, required: true, enum: ['special-last3'] },
  number: { type: String, required: true },
  score: { type: String, required: true },
  regionalScore: { type: String, required: true },
  provinceScore: { type: String, required: true },
  trendScore: { type: String, required: true },
  transitionScore: { type: String, required: true },
  regionalDraws: { type: Number, required: true },
  provinceDraws: { type: Number, required: true },
  formula: { type: String, required: true },
  modelVersion: { type: String, required: true },
}, { timestamps: true });

schema.index({ targetDate: 1, province: 1, target: 1, modelVersion: 1 }, { unique: true });
schema.index({ predictionDate: 1 });

export const MienTrungSpecialLast3SnapshotModel = model<MienTrungSpecialLast3SnapshotShape>(
  'MienTrungSpecialLast3Snapshot',
  schema,
  'mien_trung_special_last3_prediction_snapshots',
);
