import { MienTrungPredictionSnapshotModel } from '../models/MienTrungPredictionSnapshot';
import { MIEN_TRUNG_LAST2_MODEL_VERSION, MienTrungHierarchicalPredictionRow } from './mien-trung-prediction.service';

export async function saveMienTrungPredictionSnapshot(input: {
  predictionDate: string;
  targetDate: string;
  province: string;
  rows: MienTrungHierarchicalPredictionRow[];
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
          bridgeScore, provinceRankScore, regionalRankScore, provinceWeight, provinceDraws, regionalDraws }) => ({ rank, number, score, repeatPenalty, frequencyScore, recentScore, trendScore,
          recencyScore, gapScore, weekdayScore, markovScore, soiCauScore, reverseScore, cycleScore, digitScore,
          bridgeScore, provinceRankScore, regionalRankScore, provinceWeight, provinceDraws, regionalDraws })),
      },
    },
    { upsert: true },
  ).exec();
}
