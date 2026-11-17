import { connectDatabase, disconnectDatabase } from '../config/database';
import { getScheduledProvinces } from '../constants/schedules';
import { LotteryNumberMienTrungModel } from '../models/LotteryNumber';
import {
  buildDakLakGraphDraws,
  buildDakLakGraphSignal,
  DAK_LAK_GRAPH_HISTORY_DRAWS,
  DAK_LAK_GRAPH_MODEL_VERSION,
  predictDakLakGraph,
} from '../services/dak-lak-graph-experimental.service';
import { evaluatePendingDakLakGraphSnapshots, saveDakLakGraphSnapshot } from '../services/dak-lak-graph-state.service';
import { logger } from '../utils/logger';

function option(name: string): string | undefined { const index = process.argv.indexOf(`--${name}`); return index >= 0 ? process.argv[index + 1] : undefined; }

async function main(): Promise<void> {
  const targetDate = option('target-date') ?? vietnamDate();
  assertDate(targetDate);
  if (!(getScheduledProvinces('mien-trung', targetDate) ?? []).includes('dak-lak')) {
    throw new Error(`Dak Lak is not scheduled to draw on ${targetDate}.`);
  }
  const simulate = process.argv.includes('--simulate');
  await connectDatabase();
  try {
    const rows = await LotteryNumberMienTrungModel.find({ province: 'dak-lak', date: { $lte: targetDate } })
      .select({ _id: 0, date: 1, last2: 1 }).sort({ date: 1 }).lean<Array<{ date: string; last2: string }>>().exec();
    const draws = buildDakLakGraphDraws(rows);
    const historyDraws = draws.filter((draw) => draw.date < targetDate).slice(-DAK_LAK_GRAPH_HISTORY_DRAWS);
    if (historyDraws.length < DAK_LAK_GRAPH_HISTORY_DRAWS) throw new Error(`Need 26 prior Dak Lak draws; found ${historyDraws.length}.`);
    const prediction = predictDakLakGraph(draws, targetDate, 5);
    const signal = buildDakLakGraphSignal(draws, targetDate);
    const actual = simulate ? draws.find((draw) => draw.date === targetDate)?.values : undefined;
    const hitNumbers = actual ? prediction.filter((row) => actual.has(row.number)).map((row) => row.number) : [];
    console.table(prediction.map((row) => ({ ...row, simulatedHit: actual ? actual.has(row.number) : undefined })));
    console.table([{ signal: signal.level, consensus: `${signal.consensusCount}/5`,
      consensusNumbers: signal.consensusNumbers.join(', '), shortTop5: signal.shortWindowRows.map((row) => row.number).join(', '),
      longTop5: signal.longWindowRows.map((row) => row.number).join(', ') }]);
    if (!simulate) {
      const evaluatedSnapshots = await evaluatePendingDakLakGraphSnapshots(targetDate);
      await saveDakLakGraphSnapshot({ predictionDate: vietnamDate(), targetDate, historyDraws: historyDraws.length,
        rows: prediction, signal });
      logger.info('Dak Lak graph-degree shadow snapshot saved', { modelVersion: DAK_LAK_GRAPH_MODEL_VERSION,
        targetDate, evaluatedSnapshots, top5: prediction.map((row) => row.number), signal: signal.level,
        consensusCount: signal.consensusCount });
    } else {
      logger.info('Dak Lak graph-degree simulation completed without writes', { modelVersion: DAK_LAK_GRAPH_MODEL_VERSION,
        targetDate, top5: prediction.map((row) => row.number), hitCount: hitNumbers.length, hitNumbers });
    }
  } finally { await disconnectDatabase(); }
}

function assertDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value) {
    throw new Error('target-date must be a real date using YYYY-MM-DD.');
  }
}
function vietnamDate(): string { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }

main().catch((error) => { logger.error('Dak Lak graph-degree experimental job failed', { error: error instanceof Error ? error.message : String(error) }); process.exitCode = 1; });
