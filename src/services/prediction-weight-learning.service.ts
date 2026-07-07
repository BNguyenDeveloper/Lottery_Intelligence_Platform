import { backtestMienBacLast2BlendWeights } from './mien-bac-prediction.service';
import {
  DEFAULT_PREDICTION_LEARNING_WEIGHTS,
  getLatestPredictionLearningWeights,
  savePredictionLearningWeights,
} from './prediction-learning-weight.service';

export interface UpdateMienBacLast2LearningOptions {
  historyDays: number;
  predictionTop: number;
  recentDays: number;
  baselineDays: number;
  trendTop: number;
  top: number;
  backtestDays: number;
  learningRate: number;
}

export interface UpdateMienBacLast2LearningResult {
  updated: boolean;
  reason?: string;
  previousPredictionWeight: number;
  previousTrendWeight: number;
  newPredictionWeight: number;
  newTrendWeight: number;
  bothListBonus: number;
  bestPredictionWeight?: number;
  bestTrendWeight?: number;
  backtestDays: number;
  evaluatedDays?: number;
  hitDayRate?: string;
  averageHitsPerDay?: string;
  top5HitRate?: string;
}

const WEIGHT_GRID = [
  { predictionWeight: 0.8, trendWeight: 0.2 },
  { predictionWeight: 0.75, trendWeight: 0.25 },
  { predictionWeight: 0.7, trendWeight: 0.3 },
  { predictionWeight: 0.65, trendWeight: 0.35 },
  { predictionWeight: 0.6, trendWeight: 0.4 },
  { predictionWeight: 0.55, trendWeight: 0.45 },
  { predictionWeight: 0.5, trendWeight: 0.5 },
  { predictionWeight: 0.45, trendWeight: 0.55 },
  { predictionWeight: 0.4, trendWeight: 0.6 },
  { predictionWeight: 0.35, trendWeight: 0.65 },
] as const;

export async function updateMienBacLast2LearningWeights(
  options: UpdateMienBacLast2LearningOptions,
): Promise<UpdateMienBacLast2LearningResult> {
  const current = await getLatestPredictionLearningWeights();
  const weightGrid = WEIGHT_GRID.map((weights) => ({
    ...weights,
    bothListBonus: current.bothListBonus,
  }));
  const backtestRows = await backtestMienBacLast2BlendWeights({
    historyDays: options.historyDays,
    predictionTop: options.predictionTop,
    recentDays: options.recentDays,
    baselineDays: options.baselineDays,
    trendTop: options.trendTop,
    top: options.top,
    backtestDays: options.backtestDays,
    weightGrid,
  });
  const best = backtestRows[0];

  if (!best || best.evaluatedDays === 0) {
    return {
      updated: false,
      reason: 'No evaluated backtest days available.',
      previousPredictionWeight: current.predictionWeight,
      previousTrendWeight: current.trendWeight,
      newPredictionWeight: current.predictionWeight,
      newTrendWeight: current.trendWeight,
      bothListBonus: current.bothListBonus,
      backtestDays: options.backtestDays,
    };
  }

  const learningRate = clamp(options.learningRate, 0.01, 0.5);
  const newPredictionWeight = current.predictionWeight * (1 - learningRate) + best.predictionWeight * learningRate;
  const newTrendWeight = current.trendWeight * (1 - learningRate) + best.trendWeight * learningRate;
  const total = newPredictionWeight + newTrendWeight;
  const normalizedPredictionWeight = total > 0 ? newPredictionWeight / total : DEFAULT_PREDICTION_LEARNING_WEIGHTS.predictionWeight;
  const normalizedTrendWeight = total > 0 ? newTrendWeight / total : DEFAULT_PREDICTION_LEARNING_WEIGHTS.trendWeight;

  const saved = await savePredictionLearningWeights({
    predictionWeight: roundWeight(normalizedPredictionWeight),
    trendWeight: roundWeight(normalizedTrendWeight),
    bothListBonus: current.bothListBonus,
    backtestDays: options.backtestDays,
    hitDayRate: best.hitDayRate,
    averageHitsPerDay: best.averageHitsPerDay,
  });

  return {
    updated: true,
    previousPredictionWeight: current.predictionWeight,
    previousTrendWeight: current.trendWeight,
    newPredictionWeight: saved.predictionWeight,
    newTrendWeight: saved.trendWeight,
    bothListBonus: saved.bothListBonus,
    bestPredictionWeight: best.predictionWeight,
    bestTrendWeight: best.trendWeight,
    backtestDays: options.backtestDays,
    evaluatedDays: best.evaluatedDays,
    hitDayRate: best.hitDayRate,
    averageHitsPerDay: best.averageHitsPerDay,
    top5HitRate: best.top5HitRate,
  };
}

function roundWeight(value: number): number {
  return Number(value.toFixed(4));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
