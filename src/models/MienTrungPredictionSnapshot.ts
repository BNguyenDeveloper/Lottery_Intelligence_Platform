import { HydratedDocument, Schema, model } from 'mongoose';

export interface MienTrungPredictionSnapshotRow {
  rank: number;
  number: string;
  score: string;
  repeatPenalty: string;
  frequencyScore: string;
  recentScore: string;
  trendScore: string;
  recencyScore: string;
  gapScore: string;
  weekdayScore: string;
  markovScore: string;
  soiCauScore: string;
  reverseScore: string;
  cycleScore: string;
  digitScore: string;
  bridgeScore: string;
  provinceRankScore: string;
  regionalRankScore: string;
  provinceWeight: string;
  drawsSinceLastSeen: number;
  provinceDraws: number;
  regionalDraws: number;
}

interface MienTrungPredictionSnapshotShape {
  predictionDate: string;
  targetDate: string;
  region: 'mien-trung';
  province: string;
  target: 'last2';
  rows: MienTrungPredictionSnapshotRow[];
  modelVersion: string;
  multiHitSignal?: {
    level: 'STRONG' | 'FAIR' | 'NORMAL';
    filterStatus: 'QUALIFIES' | 'WATCH' | 'SKIP';
    conditionsPassed: number;
    averageScore: string;
    minimumScore: string;
    averageDrawsSinceLastSeen: string;
    top1Top2Gap: string;
    referenceHitAtLeast2Rate: string;
    referenceSampleSize: number;
    conclusion: string;
  };
}

const rowSchema = new Schema<MienTrungPredictionSnapshotRow>(
  {
    rank: { type: Number, required: true },
    number: { type: String, required: true },
    score: { type: String, required: true },
    repeatPenalty: { type: String, required: true },
    frequencyScore: { type: String, required: true },
    recentScore: { type: String, required: true },
    trendScore: { type: String, required: true },
    recencyScore: { type: String, required: true },
    gapScore: { type: String, required: true },
    weekdayScore: { type: String, required: true },
    markovScore: { type: String, required: true },
    soiCauScore: { type: String, required: true },
    reverseScore: { type: String, required: true },
    cycleScore: { type: String, required: true },
    digitScore: { type: String, required: true },
    bridgeScore: { type: String, required: true },
    provinceRankScore: { type: String, required: true },
    regionalRankScore: { type: String, required: true },
    provinceWeight: { type: String, required: true },
    drawsSinceLastSeen: { type: Number, required: true },
    provinceDraws: { type: Number, required: true },
    regionalDraws: { type: Number, required: true },
  },
  { _id: false },
);

const multiHitSignalSchema = new Schema({
  level: { type: String, required: true, enum: ['STRONG', 'FAIR', 'NORMAL'] },
  filterStatus: { type: String, required: true, enum: ['QUALIFIES', 'WATCH', 'SKIP'] },
  conditionsPassed: { type: Number, required: true },
  averageScore: { type: String, required: true },
  minimumScore: { type: String, required: true },
  averageDrawsSinceLastSeen: { type: String, required: true },
  top1Top2Gap: { type: String, required: true },
  referenceHitAtLeast2Rate: { type: String, required: true },
  referenceSampleSize: { type: Number, required: true },
  conclusion: { type: String, required: true },
}, { _id: false });

const schema = new Schema<MienTrungPredictionSnapshotShape>(
  {
    predictionDate: { type: String, required: true },
    targetDate: { type: String, required: true },
    region: { type: String, required: true, enum: ['mien-trung'] },
    province: { type: String, required: true },
    target: { type: String, required: true, enum: ['last2'] },
    rows: { type: [rowSchema], required: true, default: [] },
    modelVersion: { type: String, required: true },
    multiHitSignal: { type: multiHitSignalSchema, required: false },
  },
  { timestamps: true },
);

schema.index({ targetDate: 1, province: 1, target: 1, modelVersion: 1 }, { unique: true });
schema.index({ predictionDate: 1 });

export type MienTrungPredictionSnapshotDocument = HydratedDocument<MienTrungPredictionSnapshotShape>;
export const MienTrungPredictionSnapshotModel = model<MienTrungPredictionSnapshotShape>(
  'MienTrungPredictionSnapshot',
  schema,
  'mien_trung_prediction_snapshots',
);
