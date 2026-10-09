import { HydratedDocument, Schema, model } from 'mongoose';

export interface MienTrungRegionalDailyHot8SnapshotRow {
  rank: number;
  number: string;
  score: string;
  appearances: number;
  appearanceRate: string;
  appearedPreviousDraw: boolean;
}

interface MienTrungRegionalDailyHot8SnapshotShape {
  predictionDate: string;
  targetDate: string;
  region: 'mien-trung';
  provinces: string[];
  target: 'last2';
  historyDraws: number;
  previousDrawDate?: string;
  repeatPenalty: number;
  rows: MienTrungRegionalDailyHot8SnapshotRow[];
  modelVersion: string;
}

const rowSchema = new Schema<MienTrungRegionalDailyHot8SnapshotRow>({
  rank: { type: Number, required: true },
  number: { type: String, required: true },
  score: { type: String, required: true },
  appearances: { type: Number, required: true },
  appearanceRate: { type: String, required: true },
  appearedPreviousDraw: { type: Boolean, required: true },
}, { _id: false });

const schema = new Schema<MienTrungRegionalDailyHot8SnapshotShape>({
  predictionDate: { type: String, required: true },
  targetDate: { type: String, required: true },
  region: { type: String, required: true, enum: ['mien-trung'] },
  provinces: { type: [String], required: true },
  target: { type: String, required: true, enum: ['last2'] },
  historyDraws: { type: Number, required: true },
  previousDrawDate: String,
  repeatPenalty: { type: Number, required: true },
  rows: { type: [rowSchema], required: true, default: [] },
  modelVersion: { type: String, required: true },
}, { timestamps: true });

schema.index({ targetDate: 1, target: 1, modelVersion: 1 }, { unique: true });
schema.index({ predictionDate: 1 });

export type MienTrungRegionalDailyHot8SnapshotDocument = HydratedDocument<MienTrungRegionalDailyHot8SnapshotShape>;
export const MienTrungRegionalDailyHot8SnapshotModel = model<MienTrungRegionalDailyHot8SnapshotShape>(
  'MienTrungRegionalDailyHot8Snapshot',
  schema,
  'mien_trung_regional_daily_hot8_prediction_snapshots',
);
