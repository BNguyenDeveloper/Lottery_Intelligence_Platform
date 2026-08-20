import { connectDatabase, disconnectDatabase } from '../config/database';
import { getScheduledProvinces } from '../constants/schedules';
import { getProvince } from '../constants/provinces';
import { getEmailConfigStatus, sendEmail } from '../services/email.service';
import { predictMienTrungProvinceLast2 } from '../services/mien-trung-prediction.service';
import { saveMienTrungPredictionSnapshot } from '../services/mien-trung-prediction-snapshot.service';
import { getMienTrungDaSoPrediction, MIEN_TRUNG_DA_SO_MODEL_VERSION } from '../services/mien-trung-da-so.service';
import { saveMienTrungDaSoSnapshot } from '../services/mien-trung-da-so-snapshot.service';
import { getVietnamDateString } from '../utils/date';
import { logger } from '../utils/logger';
import { MienBacDaSoPrediction } from '../services/mien-bac-da-so.service';
import {
  MienTrungSpecialLast3Prediction,
  predictMienTrungProvinceSpecialLast3,
} from '../services/mien-trung-special-last3.service';
import { saveMienTrungSpecialLast3Snapshot } from '../services/mien-trung-special-last3-snapshot.service';

interface ProvincePrediction {
  province: string;
  rows: Awaited<ReturnType<typeof predictMienTrungProvinceLast2>>;
  daSo?: MienBacDaSoPrediction;
  specialLast3?: MienTrungSpecialLast3Prediction;
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const predictionDate = getVietnamDateString();
  const targetDate = option('target-date') || process.env.MIEN_TRUNG_PREDICTION_TARGET_DATE || shiftDate(predictionDate, 1);
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
      const specialLast3 = await predictMienTrungProvinceSpecialLast3({ province, targetDate, historyDays });
      if (specialLast3) {
        await saveMienTrungSpecialLast3Snapshot(predictionDate, specialLast3);
        console.log(`Mien Trung special last3: ${province} (${targetDate})`);
        console.table([specialLast3]);
      } else {
        logger.warn('No Mien Trung special-last3 prediction history found', { province, targetDate });
      }
      results.push({ province, rows, daSo, specialLast3 });
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
    subject: `[LotoAI][DaSo v3] Mien Trung prediction ${targetDate}: ${results.map((result) => provinceName(result.province)).join(', ')}`,
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
        `Model version: ${MIEN_TRUNG_DA_SO_MODEL_VERSION}`,
        `Selected numbers: ${result.daSo.numbers.map((row) => row.number).join(', ')}`,
        `Formula: ${result.daSo.formula}`,
        ...result.daSo.pairs.map((row) => `#${row.rank} | pair=${row.pair} | score=${row.score} | individual=${row.individualScore} | coOccurrence=${row.coOccurrenceScore} | recentCoOccurrence=${row.recentCoOccurrenceScore} | lift=${row.associationLift}`),
      ] : []),
      ...(result.specialLast3 ? [
        '',
        'Special Last3 - One Number',
        `Number: ${result.specialLast3.number}`,
        `Score: ${result.specialLast3.score} | regional=${result.specialLast3.regionalScore} | province=${result.specialLast3.provinceScore} | trend=${result.specialLast3.trendScore} | transition=${result.specialLast3.transitionScore}`,
        `Samples: province=${result.specialLast3.provinceDraws} | regional=${result.specialLast3.regionalDraws}`,
        `Formula: ${result.specialLast3.formula}`,
        'Random Top-1 baseline is 0.1% per draw; this ranking is not a guaranteed probability.',
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
      <p><strong>Model version:</strong> ${escapeHtml(MIEN_TRUNG_DA_SO_MODEL_VERSION)}</p>
      <p><strong>Selected numbers:</strong> ${result.daSo.numbers.map((row) => escapeHtml(row.number)).join(', ')}</p>
      <p><strong>Formula:</strong> ${escapeHtml(result.daSo.formula)}</p>
      <table border="1" cellpadding="6" cellspacing="0"><thead><tr><th>Rank</th><th>Pair</th><th>Score</th><th>Individual</th><th>Co-occurrence</th><th>Recent</th><th>Lift</th></tr></thead><tbody>${result.daSo.pairs.map((row) => `<tr><td>${row.rank}</td><td><strong>${escapeHtml(row.pair)}</strong></td><td>${escapeHtml(row.score)}</td><td>${escapeHtml(row.individualScore)}</td><td>${escapeHtml(row.coOccurrenceScore)}</td><td>${escapeHtml(row.recentCoOccurrenceScore)}</td><td>${escapeHtml(row.associationLift)}</td></tr>`).join('')}</tbody></table>` : '';
    const specialLast3Section = result.specialLast3 ? `<h3>Special Last3 - One Number</h3>
      <p><strong>Number:</strong> ${escapeHtml(result.specialLast3.number)}</p>
      <table border="1" cellpadding="6" cellspacing="0"><thead><tr><th>Score</th><th>Regional</th><th>Province</th><th>Trend</th><th>Transition</th><th>Province draws</th><th>Regional draws</th></tr></thead><tbody><tr><td>${escapeHtml(result.specialLast3.score)}</td><td>${escapeHtml(result.specialLast3.regionalScore)}</td><td>${escapeHtml(result.specialLast3.provinceScore)}</td><td>${escapeHtml(result.specialLast3.trendScore)}</td><td>${escapeHtml(result.specialLast3.transitionScore)}</td><td>${result.specialLast3.provinceDraws}</td><td>${result.specialLast3.regionalDraws}</td></tr></tbody></table>
      <p><strong>Formula:</strong> ${escapeHtml(result.specialLast3.formula)}<br>Random Top-1 baseline is 0.1% per draw; this ranking is not a guaranteed probability.</p>` : '';
    return `<h2>${escapeHtml(provinceName(result.province))}</h2>
      <h3>Prediction - Top 5</h3>
      <table border="1" cellpadding="6" cellspacing="0"><thead><tr><th>Rank</th><th>Number</th><th>Score</th><th>Count</th><th>Gap days</th><th>Weekday</th><th>Soi cau</th></tr></thead><tbody>${predictionRows}</tbody></table>
      ${daSoSection}
      ${specialLast3Section}`;
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

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

main().catch((error) => {
  logger.error('Mien Trung scheduled prediction failed', { error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
