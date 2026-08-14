import { MienTrungDaSoPredictionSnapshotModel } from '../models/MienTrungDaSoPredictionSnapshot';
import { MienBacDaSoPrediction } from './mien-bac-da-so.service';
import { MIEN_TRUNG_DA_SO_MODEL_VERSION } from './mien-trung-da-so.service';

export async function saveMienTrungDaSoSnapshot(input: {
  predictionDate: string;
  targetDate: string;
  province: string;
  prediction: MienBacDaSoPrediction;
}): Promise<void> {
  const identity = {
    targetDate: input.targetDate,
    province: input.province,
    modelVersion: MIEN_TRUNG_DA_SO_MODEL_VERSION,
  };
  await MienTrungDaSoPredictionSnapshotModel.updateOne(
    identity,
    {
      $set: {
        ...identity,
        predictionDate: input.predictionDate,
        region: 'mien-trung',
        target: 'last2',
        selectedNumbers: input.prediction.numbers.map((row) => row.number),
        pairs: input.prediction.pairs,
        formula: input.prediction.formula,
        weights: input.prediction.weights,
      },
    },
    { upsert: true },
  ).exec();
}
