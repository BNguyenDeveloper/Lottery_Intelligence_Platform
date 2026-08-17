import { connectDatabase, disconnectDatabase } from '../config/database';
import { getProvince } from '../constants/provinces';
import { backtestFromDraws, loadMienTrungSpecialLast3Draws } from '../services/mien-trung-special-last3.service';
import { logger } from '../utils/logger';

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const requestedProvince = option('province');
  const testDraws = Number(option('test-draws') ?? 26);
  const historyDays = Number(option('history-days') ?? 1825);
  const throughDate = option('through-date');
  if (!Number.isInteger(testDraws) || testDraws <= 0) throw new Error('test-draws must be a positive integer.');
  if (!Number.isInteger(historyDays) || historyDays <= 0) throw new Error('history-days must be a positive integer.');

  await connectDatabase();
  try {
    const draws = await loadMienTrungSpecialLast3Draws({ throughDate });
    const provinces = requestedProvince
      ? [requestedProvince]
      : [...new Set(draws.map((draw) => draw.province))].sort();
    const summaries = [];
    for (const province of provinces) {
      const result = backtestFromDraws({ draws, province, testDraws, historyDays, throughDate });
      if (!result) continue;
      summaries.push({
        province: getProvince(province)?.name ?? province,
        evaluatedDraws: result.evaluatedDraws,
        hits: result.hits,
        hitRate: result.hitRate,
        randomBaseline: result.randomBaselineHitRate,
        expectedRandomHits: result.randomBaselineExpectedHits,
        liftVsRandom: result.liftVsRandom,
      });
      if (requestedProvince) console.table(result.days);
    }
    console.table(summaries);
    const evaluatedDraws = summaries.reduce((sum, row) => sum + row.evaluatedDraws, 0);
    const hits = summaries.reduce((sum, row) => sum + row.hits, 0);
    logger.info('Mien Trung special-last3 walk-forward backtest completed', {
      throughDate: throughDate ?? 'latest',
      testDraws,
      historyDays,
      provinces: summaries.length,
      evaluatedDraws,
      hits,
      combinedHitRate: `${(100 * hits / Math.max(evaluatedDraws, 1)).toFixed(3)}%`,
      randomBaselineHitRate: '0.100%',
      warning: 'Historical performance does not guarantee future results.',
    });
  } finally {
    await disconnectDatabase();
  }
}

main().catch((error) => {
  logger.error('Mien Trung special-last3 backtest failed', { error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
