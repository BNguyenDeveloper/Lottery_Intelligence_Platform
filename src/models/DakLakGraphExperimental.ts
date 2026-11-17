import { Schema, model } from 'mongoose';

const rowSchema = new Schema({
  rank: { type: Number, required: true },
  number: { type: String, required: true },
  score: { type: String, required: true },
  degree: { type: String, required: true },
  appearances: { type: Number, required: true },
}, { _id: false });

const snapshotSchema = new Schema({
  predictionDate: { type: String, required: true },
  targetDate: { type: String, required: true },
  region: { type: String, required: true, enum: ['mien-trung'] },
  province: { type: String, required: true, enum: ['dak-lak'] },
  target: { type: String, required: true, enum: ['last2'] },
  modelVersion: { type: String, required: true },
  formula: { type: String, required: true },
  historyDraws: { type: Number, required: true },
  status: { type: String, required: true, enum: ['SHADOW'] },
  signalLevel: { type: String, required: true, enum: ['STRONG', 'SKIP'] },
  consensusCount: { type: Number, required: true },
  consensusNumbers: { type: [String], required: true, default: [] },
  shortWindowRows: { type: [rowSchema], required: true, default: [] },
  rows: { type: [rowSchema], required: true, default: [] },
}, { timestamps: true });
snapshotSchema.index({ targetDate: 1, province: 1, modelVersion: 1 }, { unique: true });

const evaluationSchema = new Schema({
  targetDate: { type: String, required: true },
  province: { type: String, required: true, enum: ['dak-lak'] },
  modelVersion: { type: String, required: true },
  predictedCount: { type: Number, required: true },
  actualCount: { type: Number, required: true },
  hitCount: { type: Number, required: true },
  hitNumbers: { type: [String], required: true },
  missNumbers: { type: [String], required: true },
  randomBaselineHits: { type: Number, required: true },
  liftVsRandom: { type: Number, required: true },
}, { timestamps: true });
evaluationSchema.index({ targetDate: 1, province: 1, modelVersion: 1 }, { unique: true });

export const DakLakGraphSnapshotModel = model('DakLakGraphExperimentalSnapshot', snapshotSchema,
  'dak_lak_graph_degree_experimental_snapshots');
export const DakLakGraphEvaluationModel = model('DakLakGraphExperimentalEvaluation', evaluationSchema,
  'dak_lak_graph_degree_experimental_evaluations');
