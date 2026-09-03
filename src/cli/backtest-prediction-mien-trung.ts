import { connectDatabase, disconnectDatabase } from '../config/database';
import { getProvince } from '../constants/provinces';
import { LotteryNumberMienTrungModel } from '../models/LotteryNumber';
import {
  buildProvinceDraws,
  MIEN_TRUNG_LAST2_MODEL_VERSION,
  predictMienTrungHierarchicalFromDraws,
} from '../services/mien-trung-prediction.service';
import { logger } from '../utils/logger';

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

interface NumberRow {
  province: string;
  date: string;
  last2: string;
}

async function main(): Promise<void> {
  const requestedProvince = option('province');
  const testDraws = Number(option('test-draws') ?? 52);
  const historyDraws = Number(option('history-draws') ?? 156);
  const top = Number(option('top') ?? 5);
  const priorStrength = Number(option('prior-strength') ?? 52);
  const throughDate = option('through-date');
  if (!Number.isInteger(testDraws) || testDraws <= 0) throw new Error('test-draws must be a positive integer.');
  if (!Number.isInteger(historyDraws) || historyDraws <= 0) throw new Error('history-draws must be a positive integer.');
  if (!Number.isInteger(top) || top <= 0 || top > 100) throw new Error('top must be an integer from 1 to 100.');
  if (!Number.isFinite(priorStrength) || priorStrength < 0) throw new Error('prior-strength must be non-negative.');

  await connectDatabase();
  try {
    const query: Record<string, unknown> = throughDate ? { date: { $lte: throughDate } } : {};
    const rows = await LotteryNumberMienTrungModel.find(query)
      .select({ province: 1, date: 1, last2: 1 })
      .sort({ date: 1, province: 1 })
      .lean<NumberRow[]>()
      .exec();
    const allDraws = buildProvinceDraws(rows);
    const provinces = requestedProvince
      ? [requestedProvince]
      : [...new Set(allDraws.map((draw) => draw.province))].sort();
    const summaries = [];

    for (const province of provinces) {
      const provinceDraws = allDraws.filter((draw) => draw.province === province);
      const targets = provinceDraws.slice(-testDraws);
      let evaluatedDraws = 0;
      let totalHits = 0;
      let hitDraws = 0;
      let randomExpectedHits = 0;
      let randomExpectedHitDraws = 0;

      for (const actual of targets) {
        const priorProvinceDraws = provinceDraws.filter((draw) => draw.date < actual.date).slice(-historyDraws);
        if (priorProvinceDraws.length === 0) continue;
        const fromDate = priorProvinceDraws[0].date;
        const history = allDraws.filter((draw) => draw.date >= fromDate && draw.date < actual.date);
        const prediction = predictMienTrungHierarchicalFromDraws(history, province, actual.date, top, priorStrength);
        if (prediction.length === 0) continue;
        const hitCount = prediction.filter((row) => actual.values.has(row.number)).length;
        evaluatedDraws += 1;
        totalHits += hitCount;
        if (hitCount > 0) hitDraws += 1;
        randomExpectedHits += prediction.length * actual.values.size / 100;
        randomExpectedHitDraws += randomHitDayProbability(100, actual.values.size, prediction.length);
      }

      if (evaluatedDraws === 0) continue;
      summaries.push({
        province: getProvince(province)?.name ?? province,
        evaluatedDraws,
        totalHits,
        hitDraws,
        hitDrawRate: percent(hitDraws / evaluatedDraws),
        hitsPerDraw: (totalHits / evaluatedDraws).toFixed(3),
        randomHitsPerDraw: (randomExpectedHits / evaluatedDraws).toFixed(3),
        liftVsRandom: percent((totalHits - randomExpectedHits) / Math.max(randomExpectedHits, 1e-9)),
        randomHitDrawRate: percent(randomExpectedHitDraws / evaluatedDraws),
      });
    }

    console.table(summaries);
    const evaluated = summaries.reduce((sum, row) => sum + row.evaluatedDraws, 0);
    const hits = summaries.reduce((sum, row) => sum + row.totalHits, 0);
    const hitDays = summaries.reduce((sum, row) => sum + row.hitDraws, 0);
    const randomHits = summaries.reduce((sum, row) => sum + Number(row.randomHitsPerDraw) * row.evaluatedDraws, 0);
    logger.info('Mien Trung hierarchical Top-5 walk-forward backtest completed', {
      modelVersion: MIEN_TRUNG_LAST2_MODEL_VERSION,
      throughDate: throughDate ?? 'latest',
      testDraws,
      historyDraws,
      top,
      priorStrength,
      provinces: summaries.length,
      evaluatedDraws: evaluated,
      totalHits: hits,
      hitDrawRate: percent(hitDays / Math.max(evaluated, 1)),
      hitsPerDraw: (hits / Math.max(evaluated, 1)).toFixed(3),
      randomHitsPerDraw: (randomHits / Math.max(evaluated, 1)).toFixed(3),
      liftVsRandom: percent((hits - randomHits) / Math.max(randomHits, 1e-9)),
      warning: 'Historical performance does not guarantee future results.',
    });
  } finally {
    await disconnectDatabase();
  }
}

function randomHitDayProbability(universe: number, actual: number, selected: number): number {
  if (selected > universe - actual) return 1;
  let noHit = 1;
  for (let index = 0; index < selected; index += 1) {
    noHit *= (universe - actual - index) / (universe - index);
  }
  return 1 - noHit;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

main().catch((error) => {
  logger.error('Mien Trung hierarchical Top-5 backtest failed', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
