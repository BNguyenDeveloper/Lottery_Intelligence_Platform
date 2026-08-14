import { connectDatabase, disconnectDatabase } from '../config/database';
import { getScheduledProvinces } from '../constants/schedules';
import { predictMienTrungProvinceLast2 } from '../services/mien-trung-prediction.service';
import { saveMienTrungPredictionSnapshot } from '../services/mien-trung-prediction-snapshot.service';
import { getMienTrungDaSoPrediction } from '../services/mien-trung-da-so.service';
import { saveMienTrungDaSoSnapshot } from '../services/mien-trung-da-so-snapshot.service';
import { getVietnamDateString } from '../utils/date';
import { logger } from '../utils/logger';

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const predictionDate = getVietnamDateString();
  const targetDate = option('target-date') || process.env.MIEN_TRUNG_PREDICTION_TARGET_DATE || predictionDate;
  const historyDays = Number(option('history-days') ?? process.env.MIEN_TRUNG_PREDICTION_HISTORY_DAYS ?? 730);
  const top = Number(option('top') ?? process.env.MIEN_TRUNG_PREDICTION_TOP ?? 5);
  const provinces = getScheduledProvinces('mien-trung', targetDate) ?? [];

  if (!Number.isInteger(historyDays) || historyDays <= 0) throw new Error('history-days must be a positive integer.');
  if (!Number.isInteger(top) || top <= 0) throw new Error('top must be a positive integer.');

  await connectDatabase();
  try {
    for (const province of provinces) {
      const rows = await predictMienTrungProvinceLast2({ province, targetDate, historyDays, top });
      if (rows.length === 0) {
        logger.warn('No Mien Trung prediction history found', { province, targetDate });
        continue;
      }
      await saveMienTrungPredictionSnapshot({ predictionDate, targetDate, province, rows });
      console.log(`Mien Trung prediction: ${province} (${targetDate})`);
      console.table(rows);
      const daSo = await getMienTrungDaSoPrediction({
        province, targetDate, historyDays, numberTop: 5, candidatePool: 20, pairTop: 10,
      });
      if (daSo) {
        await saveMienTrungDaSoSnapshot({ predictionDate, targetDate, province, prediction: daSo });
        console.log(`Mien Trung da so: ${province} (${targetDate})`);
        console.table(daSo.numbers);
        console.table(daSo.pairs);
        console.log(`Formula: ${daSo.formula}`);
      }
    }
    logger.info('Mien Trung scheduled prediction completed', { predictionDate, targetDate, provinces, top });
  } finally {
    await disconnectDatabase();
  }
}

main().catch((error) => {
  logger.error('Mien Trung scheduled prediction failed', { error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
