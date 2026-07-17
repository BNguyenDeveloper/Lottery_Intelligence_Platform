import {
  backtestMienBacBayesianWeights,
  BayesianPredictionWeights,
} from './mien-bac-prediction.service';
import {
  getLatestPredictionLearningWeights,
  MIEN_BAC_LAST2_PREDICTION_SNAPSHOT_VERSION,
  savePredictionLearningWeights,
} from './prediction-learning-weight.service';
import { PredictionEvaluationModel } from '../models/PredictionEvaluation';

export interface UpdateMienBacBayesianLearningOptions {
  historyDays: number;
  backtestDays: number;
  top: number;
  learningRate: number;
}

const BAYESIAN_WEIGHT_GRID: BayesianPredictionWeights[] = [
  weights(0.2, 0.25, 0.25, 0.1, 0.2),
  weights(0.3, 0.25, 0.2, 0.1, 0.15),
  weights(0.15, 0.35, 0.25, 0.1, 0.15),
  weights(0.1, 0.2, 0.4, 0.15, 0.15),
  weights(0.1, 0.15, 0.3, 0.3, 0.15),
  weights(0.15, 0.2, 0.2, 0.1, 0.35),
  weights(0.2, 0.3, 0.3, 0.1, 0.1),
  weights(0.25, 0.3, 0.2, 0.05, 0.2),
  weights(0.2, 0.2, 0.3, 0.15, 0.15),
];

export async function updateMienBacBayesianLearningWeights(options: UpdateMienBacBayesianLearningOptions) {
  const current = await getLatestPredictionLearningWeights();
  const liveGuard = await getLivePredictionGuard(options.top);
  const rows = await backtestMienBacBayesianWeights({
    historyDays: options.historyDays,
    testDays: options.backtestDays,
    top: options.top,
    weightGrid: BAYESIAN_WEIGHT_GRID,
  });
  const best = rows[0];
  if (!best) {
    return { updated: false, reason: 'No Bayesian backtest rows available.' };
  }
  if (liveGuard.blocked) {
    return {
      updated: false,
      reason: 'Live Prediction snapshots are below the random baseline; automatic weight updates are paused.',
      ...liveGuard,
    };
  }

  const rate = clamp(options.learningRate, 0.01, 0.5);
  const learned = normalizeWeights({
    bayesianLongTermWeight:
      current.bayesianLongTermWeight * (1 - rate) + best.bayesianLongTermWeight * rate,
    bayesianMediumTermWeight:
      current.bayesianMediumTermWeight * (1 - rate) + best.bayesianMediumTermWeight * rate,
    bayesianShortTermWeight:
      current.bayesianShortTermWeight * (1 - rate) + best.bayesianShortTermWeight * rate,
    bayesianVeryRecentWeight:
      current.bayesianVeryRecentWeight * (1 - rate) + best.bayesianVeryRecentWeight * rate,
    bayesianWeekdayWeight:
      current.bayesianWeekdayWeight * (1 - rate) + best.bayesianWeekdayWeight * rate,
  });

  const saved = await savePredictionLearningWeights({
    ...learned,
    backtestDays: options.backtestDays,
    hitDayRate: best.hitDayRate,
    averageHitsPerDay: best.averageHitsPerDay,
  });

  return {
    updated: true,
    bestLongTermWeight: best.bayesianLongTermWeight,
    bestMediumTermWeight: best.bayesianMediumTermWeight,
    bestShortTermWeight: best.bayesianShortTermWeight,
    bestVeryRecentWeight: best.bayesianVeryRecentWeight,
    bestWeekdayWeight: best.bayesianWeekdayWeight,
    newLongTermWeight: saved.bayesianLongTermWeight,
    newMediumTermWeight: saved.bayesianMediumTermWeight,
    newShortTermWeight: saved.bayesianShortTermWeight,
    newVeryRecentWeight: saved.bayesianVeryRecentWeight,
    newWeekdayWeight: saved.bayesianWeekdayWeight,
    evaluatedDays: best.evaluatedDays,
    hitDayRate: best.hitDayRate,
    averageHitsPerDay: best.averageHitsPerDay,
    liveEvaluatedDays: liveGuard.evaluatedDays,
    liveAverageHitsPerDay: liveGuard.averageHitsPerDay,
    liveRandomBaselineAverageHitsPerDay: liveGuard.randomBaselineAverageHitsPerDay,
  };
}

async function getLivePredictionGuard(top: number) {
  const rows = await PredictionEvaluationModel.find({
    kind: 'prediction',
    modelVersion: MIEN_BAC_LAST2_PREDICTION_SNAPSHOT_VERSION,
  })
    .sort({ targetDate: -1 })
    .limit(30)
    .select({ hitCount: 1, actualCount: 1 })
    .lean<Array<{ hitCount: number; actualCount: number }>>()
    .exec();
  const evaluatedDays = rows.length;
  const averageHitsPerDay =
    rows.reduce((sum, row) => sum + row.hitCount, 0) / Math.max(evaluatedDays, 1);
  const randomBaselineAverageHitsPerDay =
    rows.reduce((sum, row) => sum + (top * row.actualCount) / 100, 0) / Math.max(evaluatedDays, 1);

  return {
    blocked: evaluatedDays >= 14 && averageHitsPerDay < randomBaselineAverageHitsPerDay,
    evaluatedDays,
    averageHitsPerDay: averageHitsPerDay.toFixed(2),
    randomBaselineAverageHitsPerDay: randomBaselineAverageHitsPerDay.toFixed(2),
  };
}

function weights(
  bayesianLongTermWeight: number,
  bayesianMediumTermWeight: number,
  bayesianShortTermWeight: number,
  bayesianVeryRecentWeight: number,
  bayesianWeekdayWeight: number,
): BayesianPredictionWeights {
  return {
    bayesianLongTermWeight,
    bayesianMediumTermWeight,
    bayesianShortTermWeight,
    bayesianVeryRecentWeight,
    bayesianWeekdayWeight,
  };
}

function normalizeWeights(value: BayesianPredictionWeights): BayesianPredictionWeights {
  const total = Object.values(value).reduce((sum, weight) => sum + weight, 0);
  return weights(
    round(value.bayesianLongTermWeight / total),
    round(value.bayesianMediumTermWeight / total),
    round(value.bayesianShortTermWeight / total),
    round(value.bayesianVeryRecentWeight / total),
    round(value.bayesianWeekdayWeight / total),
  );
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
