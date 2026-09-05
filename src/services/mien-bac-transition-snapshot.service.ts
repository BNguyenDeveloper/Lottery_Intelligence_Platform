import { MienBacTransitionPredictionSnapshotModel } from '../models/MienBacTransitionPredictionSnapshot';
import {
  MIEN_BAC_TRANSITION_FORMULA,
  MIEN_BAC_TRANSITION_MODEL_VERSION,
  MienBacTransitionConfig,
  MienBacTransitionPredictionRow,
} from './mien-bac-transition-matrix.service';

export async function saveMienBacTransitionSnapshot(input: {
  predictionDate: string;
  targetDate: string;
  rows: MienBacTransitionPredictionRow[];
  config: MienBacTransitionConfig;
}): Promise<void> {
  await MienBacTransitionPredictionSnapshotModel.updateOne(
    { targetDate: input.targetDate, modelVersion: MIEN_BAC_TRANSITION_MODEL_VERSION },
    { $set: {
      predictionDate: input.predictionDate,
      targetDate: input.targetDate,
      region: 'mien-bac',
      province: 'xsmb',
      target: 'last2',
      modelVersion: MIEN_BAC_TRANSITION_MODEL_VERSION,
      formula: MIEN_BAC_TRANSITION_FORMULA,
      config: input.config,
      rows: input.rows,
    } },
    { upsert: true },
  ).exec();
}
