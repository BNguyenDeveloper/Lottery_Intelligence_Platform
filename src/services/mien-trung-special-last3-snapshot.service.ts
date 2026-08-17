import { MienTrungSpecialLast3SnapshotModel } from '../models/MienTrungSpecialLast3Snapshot';
import { MienTrungSpecialLast3Prediction } from './mien-trung-special-last3.service';

export async function saveMienTrungSpecialLast3Snapshot(
  predictionDate: string,
  prediction: MienTrungSpecialLast3Prediction,
): Promise<void> {
  const identity = {
    targetDate: prediction.targetDate,
    province: prediction.province,
    target: 'special-last3' as const,
    modelVersion: prediction.modelVersion,
  };
  await MienTrungSpecialLast3SnapshotModel.updateOne(identity, {
    $set: {
      ...identity,
      predictionDate,
      region: 'mien-trung',
      number: prediction.number,
      score: prediction.score,
      regionalScore: prediction.regionalScore,
      provinceScore: prediction.provinceScore,
      trendScore: prediction.trendScore,
      transitionScore: prediction.transitionScore,
      regionalDraws: prediction.regionalDraws,
      provinceDraws: prediction.provinceDraws,
      formula: prediction.formula,
    },
  }, { upsert: true }).exec();
}
