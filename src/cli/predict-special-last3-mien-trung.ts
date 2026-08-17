import { connectDatabase, disconnectDatabase } from '../config/database';
import { getScheduledProvinces } from '../constants/schedules';
import { getProvince } from '../constants/provinces';
import { predictMienTrungProvinceSpecialLast3 } from '../services/mien-trung-special-last3.service';
import { saveMienTrungSpecialLast3Snapshot } from '../services/mien-trung-special-last3-snapshot.service';
import { assertDateString, getVietnamDateString } from '../utils/date';
import { logger } from '../utils/logger';

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const predictionDate = getVietnamDateString();
  const targetDate = option('target-date') ?? predictionDate;
  const historyDays = Number(option('history-days') ?? 1825);
  assertDateString(targetDate);
  if (!Number.isInteger(historyDays) || historyDays <= 0) throw new Error('history-days must be a positive integer.');
  const provinces = getScheduledProvinces('mien-trung', targetDate) ?? [];

  await connectDatabase();
  try {
    const output = [];
    for (const province of provinces) {
      const prediction = await predictMienTrungProvinceSpecialLast3({ province, targetDate, historyDays });
      if (!prediction) {
        logger.warn('Insufficient special-last3 history', { province, targetDate });
        continue;
      }
      await saveMienTrungSpecialLast3Snapshot(predictionDate, prediction);
      output.push({
        province: getProvince(province)?.name ?? province,
        number: prediction.number,
        score: prediction.score,
        regional: prediction.regionalScore,
        provinceScore: prediction.provinceScore,
        trend: prediction.trendScore,
        transition: prediction.transitionScore,
        provinceDraws: prediction.provinceDraws,
        regionalDraws: prediction.regionalDraws,
      });
    }
    console.table(output);
    logger.info('Mien Trung special-last3 Top-1 prediction completed', {
      predictionDate,
      targetDate,
      provinces,
      formula: 'score = 0.40*regional + 0.35*province + 0.15*trend + 0.10*transition',
      warning: 'Ranking score is not a guaranteed probability.',
    });
  } finally {
    await disconnectDatabase();
  }
}

main().catch((error) => {
  logger.error('Mien Trung special-last3 prediction failed', { error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
