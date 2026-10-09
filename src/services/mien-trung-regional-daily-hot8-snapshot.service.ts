import { MienTrungRegionalDailyHot8SnapshotModel } from '../models/MienTrungRegionalDailyHot8Snapshot';
import { MienTrungRegionalDailyHot8Prediction } from './mien-trung-regional-daily-hot8.service';

export async function saveMienTrungRegionalDailyHot8Snapshot(
  predictionDate: string,
  prediction: MienTrungRegionalDailyHot8Prediction,
): Promise<void> {
  const identity = { targetDate: prediction.targetDate, target: 'last2' as const, modelVersion: prediction.modelVersion };
  await MienTrungRegionalDailyHot8SnapshotModel.updateOne(identity, { $set: {
    ...identity, predictionDate, region: 'mien-trung', provinces: prediction.provinces,
    historyDraws: prediction.historyDraws, previousDrawDate: prediction.previousDrawDate,
    repeatPenalty: prediction.repeatPenalty, rows: prediction.rows,
  } }, { upsert: true }).exec();
}
