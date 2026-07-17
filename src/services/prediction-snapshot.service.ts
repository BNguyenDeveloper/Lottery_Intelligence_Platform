import { PredictionSnapshotModel, PredictionSnapshotRow } from '../models/PredictionSnapshot';
import { getVietnamDateString } from '../utils/date';
import { logger } from '../utils/logger';
import { MIEN_BAC_LAST2_MODEL_VERSION } from './prediction-learning-weight.service';

export interface SavePredictionSnapshotInput {
  predictionDate?: string;
  targetDate: string;
  rows: PredictionSnapshotRow[];
  kind?: 'prediction' | 'blend';
  modelVersion?: string;
}

export async function saveMienBacLast2PredictionSnapshot(input: SavePredictionSnapshotInput): Promise<void> {
  const predictionDate = input.predictionDate ?? getVietnamDateString();
  const modelVersion = input.modelVersion ?? MIEN_BAC_LAST2_MODEL_VERSION;
  const kind = input.kind ?? 'blend';
  const identity = {
    targetDate: input.targetDate,
    region: 'mien-bac' as const,
    province: 'xsmb' as const,
    target: 'last2' as const,
    modelVersion,
    ...(kind === 'prediction' ? { kind } : {}),
  };

  await PredictionSnapshotModel.updateOne(
    identity,
    {
      $set: {
        predictionDate,
        targetDate: input.targetDate,
        region: 'mien-bac',
        province: 'xsmb',
        target: 'last2',
        kind,
        rows: input.rows,
        modelVersion,
      },
    },
    { upsert: true },
  ).exec();

  logger.info('Mien Bac last2 prediction snapshot saved', {
    predictionDate,
    targetDate: input.targetDate,
    rows: input.rows.length,
    kind,
    modelVersion,
  });
}
