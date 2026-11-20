import { Schema, model } from 'mongoose';

const drawSchema = new Schema({
  date: { type: String, required: true },
  normalizedRows: { type: Number, required: true },
  uniqueSlots: { type: Number, required: true },
  complete: { type: Boolean, required: true },
}, { _id: false });

const rowSchema = new Schema({
  number: { type: String, required: true },
  counts: { type: [Number], required: true },
  totalOccurrences: { type: Number, required: true },
  drawAppearances: { type: Number, required: true },
  absentDraws: { type: Number, required: true },
  currentGap: { type: Number, required: true },
  longestGap: { type: Number, required: true },
  recent6Occurrences: { type: Number, required: true },
  previous6Occurrences: { type: Number, required: true },
  recent12Occurrences: { type: Number, required: true },
  trendDelta6: { type: Number, required: true },
  trend: { type: String, required: true, enum: ['RISING', 'FALLING', 'FLAT'] },
}, { _id: false });

const rankingsSchema = new Schema({
  byTotalOccurrences: { type: [String], required: true },
  byDrawAppearances: { type: [String], required: true },
  byRecent6Occurrences: { type: [String], required: true },
  byRisingTrend: { type: [String], required: true },
  byCurrentGap: { type: [String], required: true },
}, { _id: false });

const snapshotSchema = new Schema({
  province: { type: String, required: true },
  scope: { type: String, required: true, enum: ['LATEST', 'ALL'], default: 'LATEST' },
  throughDate: { type: String, required: true },
  requestedDraws: { type: Number, required: true },
  drawCount: { type: Number, required: true },
  firstDate: { type: String, required: true },
  lastDate: { type: String, required: true },
  dates: { type: [String], required: true },
  draws: { type: [drawSchema], required: true },
  completeDraws: { type: Number, required: true },
  missingScheduledDates: { type: [String], required: true, default: [] },
  rows: { type: [rowSchema], required: true },
  rankings: { type: rankingsSchema, required: true },
}, { timestamps: true });

snapshotSchema.index({ province: 1, throughDate: 1, scope: 1, requestedDraws: 1 }, { unique: true });
snapshotSchema.index({ throughDate: 1 });

export const MIEN_TRUNG_FREQUENCY_MATRIX_SNAPSHOT_COLLECTION = 'mien_trung_frequency_matrix_snapshots';

export const MienTrungFrequencyMatrixSnapshotModel = model(
  'MienTrungFrequencyMatrixSnapshot',
  snapshotSchema,
  MIEN_TRUNG_FREQUENCY_MATRIX_SNAPSHOT_COLLECTION,
);
