import { DaSoPredictionSnapshotModel } from '../models/DaSoPredictionSnapshot';
import { logger } from '../utils/logger';
import { getVietnamDateString } from '../utils/date';
import { MIEN_BAC_DA_SO_MODEL_VERSION, MienBacDaSoPrediction } from './mien-bac-da-so.service';

export async function saveMienBacDaSoSnapshot(targetDate: string, prediction: MienBacDaSoPrediction, predictionDate = getVietnamDateString()): Promise<void> {
  await DaSoPredictionSnapshotModel.updateOne(
    { targetDate, modelVersion: MIEN_BAC_DA_SO_MODEL_VERSION },
    { $set: { predictionDate, targetDate, region: 'mien-bac', province: 'xsmb', target: 'last2', modelVersion: MIEN_BAC_DA_SO_MODEL_VERSION, selectedNumbers: prediction.numbers.map((row) => row.number), pairs: prediction.pairs, formula: prediction.formula, weights: prediction.weights } },
    { upsert: true },
  ).exec();
  logger.info('Mien Bac da so snapshot saved', { predictionDate, targetDate, selectedNumbers: prediction.numbers.length, pairs: prediction.pairs.length, modelVersion: MIEN_BAC_DA_SO_MODEL_VERSION });
}
