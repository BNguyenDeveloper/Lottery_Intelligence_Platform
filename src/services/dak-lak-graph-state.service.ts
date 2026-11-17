import { LotteryNumberMienTrungModel } from '../models/LotteryNumber';
import { DakLakGraphEvaluationModel, DakLakGraphSnapshotModel } from '../models/DakLakGraphExperimental';
import {
  DAK_LAK_GRAPH_FORMULA,
  DAK_LAK_GRAPH_MODEL_VERSION,
  DakLakGraphPredictionRow,
  DakLakGraphSignal,
} from './dak-lak-graph-experimental.service';

export async function saveDakLakGraphSnapshot(input: {
  predictionDate: string; targetDate: string; historyDraws: number; rows: DakLakGraphPredictionRow[];
  signal: DakLakGraphSignal;
}): Promise<void> {
  const identity = { targetDate: input.targetDate, province: 'dak-lak', modelVersion: DAK_LAK_GRAPH_MODEL_VERSION };
  await DakLakGraphSnapshotModel.updateOne(identity, { $set: { ...identity, predictionDate: input.predictionDate,
    region: 'mien-trung', target: 'last2', formula: DAK_LAK_GRAPH_FORMULA, historyDraws: input.historyDraws,
    status: 'SHADOW', signalLevel: input.signal.level, consensusCount: input.signal.consensusCount,
    consensusNumbers: input.signal.consensusNumbers, shortWindowRows: input.signal.shortWindowRows,
    rows: input.rows } }, { upsert: true }).exec();
}

export async function evaluatePendingDakLakGraphSnapshots(beforeDate: string): Promise<number> {
  const snapshots = await DakLakGraphSnapshotModel.find({ targetDate: { $lt: beforeDate },
    modelVersion: DAK_LAK_GRAPH_MODEL_VERSION }).sort({ targetDate: -1 }).limit(100).lean().exec();
  let evaluated = 0;
  for (const snapshot of snapshots) {
    const exists = await DakLakGraphEvaluationModel.exists({ targetDate: snapshot.targetDate,
      province: 'dak-lak', modelVersion: DAK_LAK_GRAPH_MODEL_VERSION });
    if (exists) continue;
    const actualRows = await LotteryNumberMienTrungModel.find({ date: snapshot.targetDate, province: 'dak-lak' })
      .select({ _id: 0, last2: 1 }).lean<Array<{ last2: string }>>().exec();
    const actual = new Set(actualRows.map((row) => row.last2));
    if (actual.size === 0) continue;
    const predicted = [...snapshot.rows].sort((left, right) => left.rank - right.rank).map((row) => row.number);
    const hitNumbers = predicted.filter((number) => actual.has(number));
    const randomBaselineHits = predicted.length * actual.size / 100;
    await DakLakGraphEvaluationModel.updateOne({ targetDate: snapshot.targetDate, province: 'dak-lak',
      modelVersion: DAK_LAK_GRAPH_MODEL_VERSION }, { $set: { targetDate: snapshot.targetDate, province: 'dak-lak',
      modelVersion: DAK_LAK_GRAPH_MODEL_VERSION, predictedCount: predicted.length, actualCount: actual.size,
      hitCount: hitNumbers.length, hitNumbers, missNumbers: predicted.filter((number) => !actual.has(number)),
      randomBaselineHits, liftVsRandom: (hitNumbers.length - randomBaselineHits) / Math.max(randomBaselineHits, Number.EPSILON) } },
    { upsert: true }).exec();
    evaluated += 1;
  }
  return evaluated;
}
