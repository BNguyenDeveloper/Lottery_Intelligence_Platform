import { DaSoLearningWeightModel } from '../models/DaSoLearningWeight';
import { DaSoPredictionEvaluationModel } from '../models/DaSoPredictionEvaluation';
import { getVietnamDateString } from '../utils/date';
import { backtestMienBacDaSo, DaSoWeights, DEFAULT_DA_SO_WEIGHTS, getLatestDaSoWeights, MIEN_BAC_DA_SO_MODEL_VERSION } from './mien-bac-da-so.service';

export interface UpdateDaSoLearningOptions { historyDays: number; backtestDays: number; learningRate: number; }

export async function updateMienBacDaSoLearning(options: UpdateDaSoLearningOptions) {
  const liveRows = await DaSoPredictionEvaluationModel.find({ modelVersion: MIEN_BAC_DA_SO_MODEL_VERSION }).sort({ targetDate: -1 }).limit(30).lean().exec();
  const liveAverage = liveRows.reduce((sum, row) => sum + row.pairHitCount, 0) / Math.max(liveRows.length, 1);
  const liveBaseline = liveRows.reduce((sum, row) => sum + Number(row.randomBaselineAveragePairHits), 0) / Math.max(liveRows.length, 1);
  const blocked = liveRows.length >= 14 && liveAverage < liveBaseline;
  const current = await getLatestDaSoWeights();
  if (blocked) return saveResult(current, options, liveRows.length, liveAverage, liveBaseline, true, undefined);

  const grid: DaSoWeights[] = [
    current,
    DEFAULT_DA_SO_WEIGHTS,
    { individual: 0.5, coOccurrence: 0.3, recentCoOccurrence: 0.1, associationLift: 0.1 },
    { individual: 0.3, coOccurrence: 0.4, recentCoOccurrence: 0.2, associationLift: 0.1 },
    { individual: 0.35, coOccurrence: 0.3, recentCoOccurrence: 0.25, associationLift: 0.1 },
  ];
  const tested = await Promise.all(grid.map(async (weights) => ({ weights, result: await backtestMienBacDaSo({ historyDays: options.historyDays, testDays: options.backtestDays, numberTop: 5, candidatePool: 20, pairTop: 10, weights }) })));
  const best = tested.filter((row) => row.result).sort((a, b) => Number(b.result?.averagePairHitsPerDay) - Number(a.result?.averagePairHitsPerDay))[0];
  if (!best?.result) return undefined;
  const rate = Math.max(0, Math.min(1, options.learningRate));
  const learned = normalize({ individual: blend(current.individual, best.weights.individual, rate), coOccurrence: blend(current.coOccurrence, best.weights.coOccurrence, rate), recentCoOccurrence: blend(current.recentCoOccurrence, best.weights.recentCoOccurrence, rate), associationLift: blend(current.associationLift, best.weights.associationLift, rate) });
  return saveResult(learned, options, liveRows.length, liveAverage, liveBaseline, false, best.result);
}

async function saveResult(weights: DaSoWeights, options: UpdateDaSoLearningOptions, liveDays: number, liveAverage: number, liveBaseline: number, blocked: boolean, backtest: Awaited<ReturnType<typeof backtestMienBacDaSo>>) {
  const record = await DaSoLearningWeightModel.create({ modelVersion: MIEN_BAC_DA_SO_MODEL_VERSION, individualWeight: weights.individual, coOccurrenceWeight: weights.coOccurrence, recentCoOccurrenceWeight: weights.recentCoOccurrence, associationLiftWeight: weights.associationLift, backtestDays: options.backtestDays, averagePairHitsPerDay: backtest?.averagePairHitsPerDay ?? '0.000', randomBaselineAveragePairHitsPerDay: backtest?.randomBaselineAveragePairHitsPerDay ?? '0.000', liftVsRandom: backtest?.liftVsRandom ?? '0.00%', liveEvaluatedDays: liveDays, liveAveragePairHitsPerDay: liveAverage.toFixed(3), liveRandomBaselineAveragePairHitsPerDay: liveBaseline.toFixed(3), learningBlocked: blocked, effectiveFromDate: getVietnamDateString() });
  return { weights, backtestDays: record.backtestDays, averagePairHitsPerDay: record.averagePairHitsPerDay, randomBaselineAveragePairHitsPerDay: record.randomBaselineAveragePairHitsPerDay, liftVsRandom: record.liftVsRandom, liveEvaluatedDays: liveDays, liveAveragePairHitsPerDay: record.liveAveragePairHitsPerDay, liveRandomBaselineAveragePairHitsPerDay: record.liveRandomBaselineAveragePairHitsPerDay, learningBlocked: blocked };
}
function blend(current: number, target: number, rate: number): number { return current + (target - current) * rate; }
function normalize(weights: DaSoWeights): DaSoWeights { const sum = Object.values(weights).reduce((total, value) => total + value, 0); return { individual: weights.individual / sum, coOccurrence: weights.coOccurrence / sum, recentCoOccurrence: weights.recentCoOccurrence / sum, associationLift: weights.associationLift / sum }; }
