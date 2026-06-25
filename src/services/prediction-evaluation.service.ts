import { LotteryNumberMienBacModel } from '../models/LotteryNumber';
import { PredictionEvaluationModel } from '../models/PredictionEvaluation';
import { PredictionSnapshotModel } from '../models/PredictionSnapshot';
import { logger } from '../utils/logger';
import { MIEN_BAC_LAST2_MODEL_VERSION } from './prediction-learning-weight.service';

export interface PredictionEvaluationResult {
  targetDate: string;
  predictedCount: number;
  actualCount: number;
  hitCount: number;
  hitNumbers: string[];
  missNumbers: string[];
  top1Hit: boolean;
  top3Hit: boolean;
  top5Hit: boolean;
  top10Hit: boolean;
  hitRate: string;
}

export async function evaluateMienBacLast2Prediction(
  targetDate: string,
  modelVersion = MIEN_BAC_LAST2_MODEL_VERSION,
): Promise<PredictionEvaluationResult | undefined> {
  const snapshot = await PredictionSnapshotModel.findOne({
    targetDate,
    region: 'mien-bac',
    province: 'xsmb',
    target: 'last2',
    modelVersion,
  })
    .lean()
    .exec();

  if (!snapshot) {
    logger.warn('No Mien Bac last2 prediction snapshot found for evaluation', { targetDate, modelVersion });
    return undefined;
  }

  const actualRows = await LotteryNumberMienBacModel.find({
    date: targetDate,
    province: 'xsmb',
  })
    .select({ last2: 1 })
    .lean<Array<{ last2: string }>>()
    .exec();

  const actualNumbers = new Set(actualRows.map((row) => row.last2));
  if (actualNumbers.size === 0) {
    logger.warn('No Mien Bac actual last2 values found for evaluation', { targetDate });
    return undefined;
  }

  const predictedNumbers = snapshot.rows
    .slice()
    .sort((left, right) => left.rank - right.rank)
    .map((row) => row.number);
  const hitNumbers = predictedNumbers.filter((number) => actualNumbers.has(number));
  const missNumbers = predictedNumbers.filter((number) => !actualNumbers.has(number));
  const result: PredictionEvaluationResult = {
    targetDate,
    predictedCount: predictedNumbers.length,
    actualCount: actualNumbers.size,
    hitCount: hitNumbers.length,
    hitNumbers,
    missNumbers,
    top1Hit: hasTopHit(predictedNumbers, actualNumbers, 1),
    top3Hit: hasTopHit(predictedNumbers, actualNumbers, 3),
    top5Hit: hasTopHit(predictedNumbers, actualNumbers, 5),
    top10Hit: hasTopHit(predictedNumbers, actualNumbers, 10),
    hitRate: formatPercent(hitNumbers.length / Math.max(predictedNumbers.length, 1)),
  };

  await PredictionEvaluationModel.updateOne(
    {
      targetDate,
      region: 'mien-bac',
      province: 'xsmb',
      target: 'last2',
      modelVersion,
    },
    {
      $set: {
        ...result,
        region: 'mien-bac',
        province: 'xsmb',
        target: 'last2',
        modelVersion,
      },
    },
    { upsert: true },
  ).exec();

  logger.info('Mien Bac last2 prediction evaluated', { ...result });
  return result;
}

function hasTopHit(predictedNumbers: string[], actualNumbers: Set<string>, top: number): boolean {
  return predictedNumbers.slice(0, top).some((number) => actualNumbers.has(number));
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}
