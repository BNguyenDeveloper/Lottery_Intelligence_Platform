import { connectDatabase, disconnectDatabase } from '../config/database';
import { getProvince } from '../constants/provinces';
import { LotteryNumberMienTrungModel } from '../models/LotteryNumber';
import { buildDaSoPredictionFromDailyHits } from '../services/mien-bac-da-so.service';
import { DaSoWeights } from '../services/mien-bac-da-so.service';
import { DailyHits, pickBayesianWeights } from '../services/mien-bac-prediction.service';
import { DEFAULT_PREDICTION_LEARNING_WEIGHTS } from '../services/prediction-learning-weight.service';
import { logger } from '../utils/logger';
import { MIEN_TRUNG_DA_SO_CANDIDATE_POOL, MIEN_TRUNG_DA_SO_SELECTION_INDIVIDUAL_WEIGHT, MIEN_TRUNG_DA_SO_WEIGHTS } from '../services/mien-trung-da-so.service';

function option(name: string): string | undefined { const index = process.argv.indexOf(`--${name}`); return index >= 0 ? process.argv[index + 1] : undefined; }
async function main(): Promise<void> {
  const requestedProvince = option('province');
  const testDraws = Number(option('test-draws') ?? 52);
  const historyDraws = Number(option('history-draws') ?? 156);
  const candidatePool = Number(option('candidate-pool') ?? MIEN_TRUNG_DA_SO_CANDIDATE_POOL);
  const selectionIndividualWeight = Number(option('selection-individual-weight') ?? MIEN_TRUNG_DA_SO_SELECTION_INDIVIDUAL_WEIGHT);
  const throughDate = option('through-date');
  const rawWeights = option('weights');
  const values = rawWeights?.split(',').map(Number);
  const weights: DaSoWeights = values?.length === 4 ? { individual: values[0], coOccurrence: values[1], recentCoOccurrence: values[2], associationLift: values[3] } : MIEN_TRUNG_DA_SO_WEIGHTS;
  await connectDatabase();
  try {
    const query: Record<string, unknown> = throughDate ? { date: { $lte: throughDate } } : {};
    if (requestedProvince) query.province = requestedProvince;
    const rows = await LotteryNumberMienTrungModel.find(query).select({ province: 1, date: 1, last2: 1 }).sort({ province: 1, date: 1 }).lean<Array<{ province: string; date: string; last2: string }>>().exec();
    const provinces = requestedProvince ? [requestedProvince] : [...new Set(rows.map((row) => row.province))].sort();
    const summaries = (await Promise.all(provinces.map(async (province) => {
      const grouped = new Map<string, Set<string>>();
      for (const row of rows.filter((item) => item.province === province)) { if (!grouped.has(row.date)) grouped.set(row.date, new Set()); grouped.get(row.date)?.add(row.last2); }
      const draws: DailyHits[] = [...grouped.entries()].map(([date, values]) => ({ date, values, dayOfWeek: new Date(`${date}T00:00:00Z`).getUTCDay() }));
      let evaluated = 0; let pairHits = 0; let hitDraws = 0; let randomExpected = 0;
      for (let index = Math.max(1, draws.length - testDraws); index < draws.length; index += 1) {
        const training = draws.slice(Math.max(0, index - historyDraws), index);
        const prediction = await buildDaSoPredictionFromDailyHits(training, training.at(-1)?.date ?? '', { historyDays: historyDraws, numberTop: 5, candidatePool, pairTop: 10, targetDate: draws[index].date, weights, selectionIndividualWeight, predictionWeights: pickBayesianWeights(DEFAULT_PREDICTION_LEARNING_WEIGHTS) });
        if (!prediction) continue;
        const hits = prediction.pairs.filter((row) => draws[index].values.has(row.numberA) && draws[index].values.has(row.numberB)).length;
        evaluated += 1; pairHits += hits; if (hits > 0) hitDraws += 1;
        randomExpected += 10 * (draws[index].values.size * (draws[index].values.size - 1) / 2) / 4950;
      }
      return evaluated ? { province: getProvince(province)?.name ?? province, evaluatedDraws: evaluated, pairHits, hitDraws, hitDrawRate: `${(100 * hitDraws / evaluated).toFixed(2)}%`, pairsPerDraw: (pairHits / evaluated).toFixed(3), randomPairsPerDraw: (randomExpected / evaluated).toFixed(3), liftVsRandom: `${(100 * (pairHits - randomExpected) / Math.max(randomExpected, 1e-9)).toFixed(2)}%` } : undefined;
    }))).filter((row): row is NonNullable<typeof row> => Boolean(row));
    console.table(summaries);
    const evaluated = summaries.reduce((sum, row) => sum + row.evaluatedDraws, 0); const hits = summaries.reduce((sum, row) => sum + row.pairHits, 0); const random = summaries.reduce((sum, row) => sum + Number(row.randomPairsPerDraw) * row.evaluatedDraws, 0);
    logger.info('Mien Trung da-so walk-forward backtest completed', { weights: weights ?? 'v1-default', provinces: summaries.length, evaluatedDraws: evaluated, pairHits: hits, pairsPerDraw: (hits / Math.max(evaluated, 1)).toFixed(3), randomPairsPerDraw: (random / Math.max(evaluated, 1)).toFixed(3), liftVsRandom: `${(100 * (hits - random) / Math.max(random, 1e-9)).toFixed(2)}%`, warning: 'Historical performance does not guarantee future results.' });
  } finally { await disconnectDatabase(); }
}
main().catch((error) => { logger.error('Mien Trung da-so backtest failed', { error: error instanceof Error ? error.message : String(error) }); process.exitCode = 1; });
