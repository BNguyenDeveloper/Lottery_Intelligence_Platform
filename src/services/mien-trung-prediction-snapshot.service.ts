import { MienTrungPredictionSnapshotModel } from '../models/MienTrungPredictionSnapshot';
import { MienBacPredictionRow } from './mien-bac-prediction.service';
import { MIEN_TRUNG_LAST2_MODEL_VERSION } from './mien-trung-prediction.service';

export async function saveMienTrungPredictionSnapshot(input: {
  predictionDate: string;
  targetDate: string;
  province: string;
  rows: MienBacPredictionRow[];
}): Promise<void> {
  const identity = {
    targetDate: input.targetDate,
    province: input.province,
    target: 'last2' as const,
    modelVersion: MIEN_TRUNG_LAST2_MODEL_VERSION,
  };
  await MienTrungPredictionSnapshotModel.updateOne(
    identity,
    {
      $set: {
        ...identity,
        predictionDate: input.predictionDate,
        region: 'mien-trung',
        rows: input.rows.map(({ rank, number, score, repeatPenalty, frequencyScore, recentScore, trendScore,
          recencyScore, gapScore, weekdayScore, markovScore, soiCauScore, reverseScore, cycleScore, digitScore,
          bridgeScore }) => ({ rank, number, score, repeatPenalty, frequencyScore, recentScore, trendScore,
          recencyScore, gapScore, weekdayScore, markovScore, soiCauScore, reverseScore, cycleScore, digitScore,
          bridgeScore })),
      },
    },
    { upsert: true },
  ).exec();
}
