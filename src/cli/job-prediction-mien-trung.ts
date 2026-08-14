import { connectDatabase, disconnectDatabase } from '../config/database';
import { getScheduledProvinces } from '../constants/schedules';
import { getProvince } from '../constants/provinces';
import { getEmailConfigStatus, sendEmail } from '../services/email.service';
import { predictMienTrungProvinceLast2 } from '../services/mien-trung-prediction.service';
import { saveMienTrungPredictionSnapshot } from '../services/mien-trung-prediction-snapshot.service';
import { getMienTrungDaSoPrediction } from '../services/mien-trung-da-so.service';
import { saveMienTrungDaSoSnapshot } from '../services/mien-trung-da-so-snapshot.service';
import { getVietnamDateString } from '../utils/date';
import { logger } from '../utils/logger';
import { MienBacDaSoPrediction } from '../services/mien-bac-da-so.service';

interface ProvincePrediction {
  province: string;
  rows: Awaited<ReturnType<typeof predictMienTrungProvinceLast2>>;
  daSo?: MienBacDaSoPrediction;
}

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
    const results: ProvincePrediction[] = [];
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
      results.push({ province, rows, daSo });
    }
    logger.info('Mien Trung scheduled prediction completed', { predictionDate, targetDate, provinces, top });
    await sendPredictionEmail(predictionDate, targetDate, historyDays, results);
  } finally {
    await disconnectDatabase();
  }
}

async function sendPredictionEmail(
  predictionDate: string,
  targetDate: string,
  historyDays: number,
  results: ProvincePrediction[],
): Promise<void> {
  if (results.length === 0) {
    logger.warn('No Mien Trung prediction rows available. Skipping email.', { targetDate });
    return;
  }
  const emailStatus = getEmailConfigStatus();
  if (!emailStatus.configured) {
    logger.warn('Email is not configured. Skipping Mien Trung prediction email.', { missing: emailStatus.missing });
    return;
  }
  await sendEmail({
    subject: `[LotoAI] Mien Trung prediction ${targetDate}: ${results.map((result) => provinceName(result.province)).join(', ')}`,
    text: buildEmailText(predictionDate, targetDate, historyDays, results),
    html: buildEmailHtml(predictionDate, targetDate, historyDays, results),
  });
  logger.info('Mien Trung prediction email sent successfully.', {
    predictionDate,
    targetDate,
    provinces: results.map((result) => result.province),
  });
}

function buildEmailText(
  predictionDate: string,
  targetDate: string,
  historyDays: number,
  results: ProvincePrediction[],
): string {
  return [
    'Mien Trung scheduled prediction',
    `Prediction date: ${predictionDate}`,
    `Target date: ${targetDate}`,
    `History days: ${historyDays}`,
    'Ranking scores are reference values, not guaranteed probabilities.',
    ...results.flatMap((result) => [
      '',
      provinceName(result.province),
      'Prediction - Top 5',
      ...result.rows.map((row) => `#${row.rank} | number=${row.number} | score=${row.score} | count=${row.count} | gapDays=${row.gapDays} | weekday=${row.weekdayScore} | soiCau=${row.soiCauScore}`),
      ...(result.daSo ? [
        '',
        'Da So - Reference Only',
        `Selected numbers: ${result.daSo.numbers.map((row) => row.number).join(', ')}`,
        `Formula: ${result.daSo.formula}`,
        ...result.daSo.pairs.map((row) => `#${row.rank} | pair=${row.pair} | score=${row.score} | individual=${row.individualScore} | coOccurrence=${row.coOccurrenceScore} | recentCoOccurrence=${row.recentCoOccurrenceScore} | lift=${row.associationLift}`),
      ] : []),
    ]),
  ].join('\n');
}

function buildEmailHtml(
  predictionDate: string,
  targetDate: string,
  historyDays: number,
  results: ProvincePrediction[],
): string {
  const sections = results.map((result) => {
    const predictionRows = result.rows.map((row) => `<tr><td>${row.rank}</td><td><strong>${escapeHtml(row.number)}</strong></td><td>${escapeHtml(row.score)}</td><td>${row.count}</td><td>${row.gapDays}</td><td>${escapeHtml(row.weekdayScore)}</td><td>${escapeHtml(row.soiCauScore)}</td></tr>`).join('');
    const daSoSection = result.daSo ? `<h3>Da So - Reference Only</h3>
      <p><strong>Selected numbers:</strong> ${result.daSo.numbers.map((row) => escapeHtml(row.number)).join(', ')}</p>
      <p><strong>Formula:</strong> ${escapeHtml(result.daSo.formula)}</p>
      <table border="1" cellpadding="6" cellspacing="0"><thead><tr><th>Rank</th><th>Pair</th><th>Score</th><th>Individual</th><th>Co-occurrence</th><th>Recent</th><th>Lift</th></tr></thead><tbody>${result.daSo.pairs.map((row) => `<tr><td>${row.rank}</td><td><strong>${escapeHtml(row.pair)}</strong></td><td>${escapeHtml(row.score)}</td><td>${escapeHtml(row.individualScore)}</td><td>${escapeHtml(row.coOccurrenceScore)}</td><td>${escapeHtml(row.recentCoOccurrenceScore)}</td><td>${escapeHtml(row.associationLift)}</td></tr>`).join('')}</tbody></table>` : '';
    return `<h2>${escapeHtml(provinceName(result.province))}</h2>
      <h3>Prediction - Top 5</h3>
      <table border="1" cellpadding="6" cellspacing="0"><thead><tr><th>Rank</th><th>Number</th><th>Score</th><th>Count</th><th>Gap days</th><th>Weekday</th><th>Soi cau</th></tr></thead><tbody>${predictionRows}</tbody></table>
      ${daSoSection}`;
  }).join('');
  return `<h1>Mien Trung scheduled prediction</h1>
    <p><strong>Prediction date:</strong> ${escapeHtml(predictionDate)}<br><strong>Target date:</strong> ${escapeHtml(targetDate)}<br><strong>History days:</strong> ${historyDays}</p>
    <p>Ranking scores are reference values, not guaranteed probabilities.</p>${sections}`;
}

function provinceName(province: string): string {
  return getProvince(province)?.name ?? province;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

main().catch((error) => {
  logger.error('Mien Trung scheduled prediction failed', { error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
