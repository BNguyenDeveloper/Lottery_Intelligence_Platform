import { connectDatabase, disconnectDatabase } from '../config/database';
import { getEmailConfigStatus, sendEmail } from '../services/email.service';
import {
  getMienBacLast2PredictionTrendBlend,
  getTrendingMienBacLast2,
  PredictionTarget,
  predictMienBacNumbers,
} from '../services/mien-bac-prediction.service';
import { getMienBacMissingHeadFollowUp } from '../services/mien-bac-missing-head-follow-up.service';
import { getMienBacDaSoPrediction, MienBacDaSoPrediction } from '../services/mien-bac-da-so.service';
import { saveMienBacDaSoSnapshot } from '../services/da-so-snapshot.service';
import { saveMienBacLast2PredictionSnapshot } from '../services/prediction-snapshot.service';
import { MIEN_BAC_LAST2_PREDICTION_SNAPSHOT_VERSION } from '../services/prediction-learning-weight.service';
import { getRecentLast2Summary } from '../services/recent-last2-summary.service';
import {
  DEFAULT_MIEN_BAC_TRANSITION_CONFIG,
  MIEN_BAC_TRANSITION_FORMULA,
  MIEN_BAC_TRANSITION_MODEL_VERSION,
  MienBacTransitionPredictionRow,
  predictMienBacTransitionMatrix,
} from '../services/mien-bac-transition-matrix.service';
import { saveMienBacTransitionSnapshot } from '../services/mien-bac-transition-snapshot.service';
import { getVietnamDateString } from '../utils/date';
import { logger } from '../utils/logger';

const DEFAULT_PREDICTION_TOP = 5;
const DEFAULT_AUXILIARY_TOP = 5;
const DEFAULT_RECENT_SUMMARY_DAYS = 7;
const DEFAULT_MISSING_HEAD_TOP = 5;

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function parseTarget(value: string | undefined): PredictionTarget {
  if (!value || value === 'last2') return 'last2';
  if (value === 'last3') return 'last3';
  throw new Error('Target must be last2 or last3.');
}

async function main(): Promise<void> {
  const target = parseTarget(option('target') ?? process.env.PREDICTION_TARGET);
  const historyDays = Number(option('history-days') ?? process.env.PREDICTION_HISTORY_DAYS ?? 365);
  const top = Number(option('top') ?? process.env.PREDICTION_TOP ?? DEFAULT_PREDICTION_TOP);
  const trendRecentDays = Number(option('trend-recent-days') ?? process.env.PREDICTION_TREND_RECENT_DAYS ?? 30);
  const trendBaselineDays = Number(option('trend-baseline-days') ?? process.env.PREDICTION_TREND_BASELINE_DAYS ?? 90);
  const trendTop = Number(option('trend-top') ?? process.env.PREDICTION_TREND_TOP ?? DEFAULT_PREDICTION_TOP);
  const blendPredictionTop = Number(option('blend-prediction-top') ?? process.env.PREDICTION_BLEND_PREDICTION_TOP ?? 20);
  const blendTrendTop = Number(option('blend-trend-top') ?? process.env.PREDICTION_BLEND_TREND_TOP ?? 20);
  const blendTop = Number(option('blend-top') ?? process.env.PREDICTION_BLEND_TOP ?? top);
  const recentSummaryDays = Number(option('recent-summary-days') ?? process.env.PREDICTION_RECENT_SUMMARY_DAYS ?? DEFAULT_RECENT_SUMMARY_DAYS);
  const recentSummaryTop = Number(
    option('recent-summary-top') ?? process.env.PREDICTION_RECENT_SUMMARY_TOP ?? DEFAULT_AUXILIARY_TOP,
  );
  const missingHeadTop = Number(option('missing-head-top') ?? process.env.PREDICTION_MISSING_HEAD_TOP ?? DEFAULT_MISSING_HEAD_TOP);
  const predictionDate = getVietnamDateString();
  const targetDate = option('target-date') ?? process.env.PREDICTION_TARGET_DATE ?? shiftDate(predictionDate, 1);

  if (!Number.isInteger(historyDays) || historyDays <= 0) {
    throw new Error('history-days must be a positive integer.');
  }

  if (!Number.isInteger(top) || top <= 0) {
    throw new Error('top must be a positive integer.');
  }

  for (const [name, value] of [
    ['trend-recent-days', trendRecentDays],
    ['trend-baseline-days', trendBaselineDays],
    ['trend-top', trendTop],
    ['blend-prediction-top', blendPredictionTop],
    ['blend-trend-top', blendTrendTop],
    ['blend-top', blendTop],
    ['recent-summary-days', recentSummaryDays],
    ['recent-summary-top', recentSummaryTop],
    ['missing-head-top', missingHeadTop],
  ] as const) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`${name} must be a positive integer.`);
    }
  }

  await connectDatabase();
  const rows = await predictMienBacNumbers({ target, historyDays, top });
  const trendRows =
    target === 'last2'
      ? await getTrendingMienBacLast2({ recentDays: trendRecentDays, baselineDays: trendBaselineDays, top: trendTop })
      : [];
  const blendRows =
    target === 'last2'
      ? await getMienBacLast2PredictionTrendBlend({
          historyDays,
          predictionTop: blendPredictionTop,
          recentDays: trendRecentDays,
          baselineDays: trendBaselineDays,
          trendTop: blendTrendTop,
          top: blendTop,
        })
      : [];
  const recentSummaryRows = await getRecentSummaryRows(recentSummaryDays, recentSummaryTop);
  const missingHeadRows = await getMissingHeadRows(missingHeadTop);
  const daSo = target === 'last2' ? await getDaSoPrediction(historyDays) : undefined;
  const transitionRows = target === 'last2'
    ? await getTransitionPrediction(historyDays, targetDate, top)
    : [];

  if (rows.length === 0) {
    logger.warn('No Mien Bac prediction rows found', { target, historyDays, top });
    return;
  }

  if (target === 'last2') {
    await saveMienBacLast2PredictionSnapshot({
      predictionDate,
      targetDate,
      kind: 'prediction',
      modelVersion: MIEN_BAC_LAST2_PREDICTION_SNAPSHOT_VERSION,
      rows: rows.map((row) => ({
        rank: row.rank,
        number: row.number,
        predictionScore: row.score,
        trendScore: '-',
        combinedScore: row.score,
        source: 'prediction',
      })),
    });
  }

  console.log('Prediction');
  console.table(rows);
  if (trendRows.length > 0) {
    console.log('Last2 Trend');
    console.table(trendRows);
  }
  if (blendRows.length > 0) {
    console.log('Prediction + Trend Blend');
    console.table(blendRows);
    await saveMienBacLast2PredictionSnapshot({
      predictionDate,
      targetDate,
      kind: 'blend',
      rows: blendRows.map((row) => ({
        rank: row.rank,
        number: row.number,
        predictionScore: row.predictionScore,
        trendScore: row.trendScore,
        combinedScore: row.combinedScore,
        source: row.source,
      })),
    });
  }
  if (recentSummaryRows.length > 0) {
    console.log(`Recent Last2 Summary (${recentSummaryDays} days, all regions)`);
    console.table(recentSummaryRows);
  }
  if (missingHeadRows.length > 0) {
    console.log('Mien Bac Missing Head Follow-up');
    console.table(missingHeadRows);
  }
  if (daSo) {
    await saveDaSoSnapshot(targetDate, daSo, predictionDate);
    console.log('Da So - Selected 5 Numbers (reference only)');
    console.table(daSo.numbers);
    console.log('Da So - Ranked Pairs');
    console.table(daSo.pairs);
    console.log(`Formula: ${daSo.formula}`);
  }
  if (transitionRows.length > 0) {
    await saveTransitionSnapshot(predictionDate, targetDate, transitionRows);
    console.log('Prediction + Transition Matrix - Experimental Reference Only');
    console.table(transitionRows);
    console.log(`Formula: ${MIEN_BAC_TRANSITION_FORMULA}`);
  }

  const summary = `Mien Bac prediction completed. Best ${target} candidate: ${rows[0].number}`;
  logger.info('Mien Bac prediction completed', {
    target,
    historyDays,
    top,
    bestNumber: rows[0].number,
    bestScore: rows[0].score,
    predictionDate,
    targetDate,
    trendRows: trendRows.length,
    blendRows: blendRows.length,
    recentSummaryRows: recentSummaryRows.length,
    missingHeadRows: missingHeadRows.length,
    daSoPairs: daSo?.pairs.length ?? 0,
    transitionRows: transitionRows.length,
  });

  const emailStatus = getEmailConfigStatus();
  if (!emailStatus.configured) {
    logger.warn('Email is not configured. Skipping Mien Bac prediction email.', { missing: emailStatus.missing });
    return;
  }

  await sendEmail({
    subject: `[LotoAI] Mien Bac prediction: ${rows[0].number}`,
    text: buildPredictionEmailText(summary, target, historyDays, rows, trendRows, blendRows, recentSummaryRows, missingHeadRows, daSo, transitionRows),
    html: buildPredictionEmailHtml(summary, target, historyDays, rows, trendRows, blendRows, recentSummaryRows, missingHeadRows, daSo, transitionRows),
  });
  logger.info('Mien Bac prediction email sent successfully.');
}

async function getRecentSummaryRows(days: number, top: number): ReturnType<typeof getRecentLast2Summary> {
  try {
    return await getRecentLast2Summary({ days, top });
  } catch (error) {
    logger.warn('Recent last2 summary skipped', { error: error instanceof Error ? error.message : String(error) });
    return [];
  }
}

async function getMissingHeadRows(topPerHead: number): ReturnType<typeof getMienBacMissingHeadFollowUp> {
  try {
    return await getMienBacMissingHeadFollowUp({ topPerHead });
  } catch (error) {
    logger.warn('Mien Bac missing head follow-up skipped', { error: error instanceof Error ? error.message : String(error) });
    return [];
  }
}

async function getDaSoPrediction(historyDays: number): Promise<MienBacDaSoPrediction | undefined> {
  try {
    return await getMienBacDaSoPrediction({ historyDays, numberTop: 5, candidatePool: 20, pairTop: 10 });
  } catch (error) {
    logger.warn('Mien Bac da so prediction skipped', { error: error instanceof Error ? error.message : String(error) });
    return undefined;
  }
}

async function getTransitionPrediction(
  historyDays: number,
  targetDate: string,
  top: number,
): Promise<MienBacTransitionPredictionRow[]> {
  try {
    return await predictMienBacTransitionMatrix({ historyDays, targetDate, top });
  } catch (error) {
    logger.warn('Mien Bac transition matrix prediction skipped', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

async function saveTransitionSnapshot(
  predictionDate: string,
  targetDate: string,
  rows: MienBacTransitionPredictionRow[],
): Promise<void> {
  try {
    await saveMienBacTransitionSnapshot({ predictionDate, targetDate, rows });
  } catch (error) {
    logger.warn('Mien Bac transition matrix snapshot save skipped', {
      targetDate,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function saveDaSoSnapshot(
  targetDate: string,
  prediction: MienBacDaSoPrediction,
  predictionDate: string,
): Promise<void> {
  try {
    await saveMienBacDaSoSnapshot(targetDate, prediction, predictionDate);
  } catch (error) {
    logger.warn('Mien Bac da so snapshot save skipped', {
      targetDate,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function buildPredictionEmailText(
  summary: string,
  target: PredictionTarget,
  historyDays: number,
  rows: Awaited<ReturnType<typeof predictMienBacNumbers>>,
  trendRows: Awaited<ReturnType<typeof getTrendingMienBacLast2>>,
  blendRows: Awaited<ReturnType<typeof getMienBacLast2PredictionTrendBlend>>,
  recentSummaryRows: Awaited<ReturnType<typeof getRecentLast2Summary>>,
  missingHeadRows: Awaited<ReturnType<typeof getMienBacMissingHeadFollowUp>>,
  daSo: MienBacDaSoPrediction | undefined,
  transitionRows: MienBacTransitionPredictionRow[],
): string {
  const header = [summary, `Target: ${target}`, `History days: ${historyDays}`, ''];
  const predictionBody = rows.map((row) =>
    [
      `#${row.rank}`,
      `number=${row.number}`,
      `score=${row.score}`,
      `count=${row.count}`,
      `lastSeen=${row.lastSeenDate}`,
      `gapDays=${row.gapDays}`,
      `repeatPenalty=${row.repeatPenalty}`,
      `frequency=${row.frequencyScore}`,
      `recent=${row.recentScore}`,
      `trend=${row.trendScore}`,
      `recency=${row.recencyScore}`,
      `gap=${row.gapScore}`,
      `weekday=${row.weekdayScore}`,
      `markov=${row.markovScore}`,
      `soiCau=${row.soiCauScore}`,
      `reverse=${row.reverseScore}`,
      `cycle=${row.cycleScore}`,
      `digit=${row.digitScore}`,
      `bridge=${row.bridgeScore}`,
    ].join(' | '),
  );
  const trendHeader = trendRows.length > 0 ? ['', 'Last2 Trend', ''] : [];
  const trendBody = trendRows.map((row) =>
    [
      `#${row.rank}`,
      `number=${row.number}`,
      `trendScore=${row.trendScore}`,
      `trendLift=${row.trendLift}`,
      `recent=${row.recentCount}`,
      `baseline=${row.baselineCount}`,
      `lastSeen=${row.lastSeenDate}`,
      `gapDays=${row.gapDays}`,
    ].join(' | '),
  );
  const blendHeader = blendRows.length > 0 ? ['', 'Prediction + Trend Blend', ''] : [];
  const blendBody = blendRows.map((row) =>
    [
      `#${row.rank}`,
      `number=${row.number}`,
      `combined=${row.combinedScore}`,
      `predictionRank=${row.predictionRank}`,
      `predictionScore=${row.predictionScore}`,
      `trendRank=${row.trendRank}`,
      `trendScore=${row.trendScore}`,
      `trendLift=${row.trendLift}`,
      `source=${row.source}`,
    ].join(' | '),
  );
  const recentSummaryHeader = recentSummaryRows.length > 0 ? ['', 'Recent Last2 Summary - All Regions', ''] : [];
  const recentSummaryBody = recentSummaryRows.map((row) =>
    [
      `#${row.rank}`,
      `number=${row.number}`,
      `count=${row.count}`,
      `mienBac=${row.mienBac}`,
      `mienTrung=${row.mienTrung}`,
      `mienNam=${row.mienNam}`,
    ].join(' | '),
  );
  const missingHeadHeader = missingHeadRows.length > 0 ? ['', 'Mien Bac Missing Head Follow-up', ''] : [];
  const missingHeadBody = missingHeadRows.map((row) =>
    [
      `head=${row.missingHead}`,
      `#${row.rank}`,
      `number=${row.number}`,
      `count=${row.count}`,
      `hitDays=${row.hitDays}/${row.eventDays}`,
      `hitRate=${row.hitRate}`,
      `latestDate=${row.latestDate}`,
    ].join(' | '),
  );
  const daSoBody = daSo
    ? [
        '',
        'Da So - Reference Only',
        `Selected numbers: ${daSo.numbers.map((row) => row.number).join(', ')}`,
        `Formula: ${daSo.formula}`,
        'Backtest is variable across time blocks; ranking score is not a guaranteed probability.',
        ...daSo.pairs.map((row) => `#${row.rank} | pair=${row.pair} | score=${row.score} | individual=${row.individualScore} | coOccurrence=${row.coOccurrenceScore} | recentCoOccurrence=${row.recentCoOccurrenceScore} | lift=${row.associationLift} | estimatedPairRate=${row.estimatedPairRate}`),
      ]
    : [];
  const transitionBody = transitionRows.length > 0
    ? [
        '',
        'Prediction + Transition Matrix - Experimental Reference Only',
        `Model version: ${MIEN_BAC_TRANSITION_MODEL_VERSION}`,
        `Formula: ${MIEN_BAC_TRANSITION_FORMULA}`,
        `Config: alpha=${DEFAULT_MIEN_BAC_TRANSITION_CONFIG.priorStrength} | topEdges=${DEFAULT_MIEN_BAC_TRANSITION_CONFIG.topEdges} | lags=${DEFAULT_MIEN_BAC_TRANSITION_CONFIG.lags.join(',')} | lagWeights=${DEFAULT_MIEN_BAC_TRANSITION_CONFIG.lagWeights.join(',')} | lambda=${DEFAULT_MIEN_BAC_TRANSITION_CONFIG.lambda}`,
        'This isolated section does not affect Prediction, Blend, evaluation, or learning.',
        ...transitionRows.map((row) => `#${row.rank} | number=${row.number} | final=${row.finalScore} | base=${row.baseScore} | baseZ=${row.baseZScore} | transitionResidual=${row.transitionResidual} | transitionZ=${row.transitionZScore} | supportingEdges=${row.supportingEdges} | historyDraws=${row.historyDraws}`),
      ]
    : [];

  return [
    ...header,
    'Prediction',
    '',
    ...predictionBody,
    ...trendHeader,
    ...trendBody,
    ...blendHeader,
    ...blendBody,
    ...recentSummaryHeader,
    ...recentSummaryBody,
    ...missingHeadHeader,
    ...missingHeadBody,
    ...daSoBody,
    ...transitionBody,
  ].join('\n');
}

function buildPredictionEmailHtml(
  summary: string,
  target: PredictionTarget,
  historyDays: number,
  rows: Awaited<ReturnType<typeof predictMienBacNumbers>>,
  trendRows: Awaited<ReturnType<typeof getTrendingMienBacLast2>>,
  blendRows: Awaited<ReturnType<typeof getMienBacLast2PredictionTrendBlend>>,
  recentSummaryRows: Awaited<ReturnType<typeof getRecentLast2Summary>>,
  missingHeadRows: Awaited<ReturnType<typeof getMienBacMissingHeadFollowUp>>,
  daSo: MienBacDaSoPrediction | undefined,
  transitionRows: MienBacTransitionPredictionRow[],
): string {
  const tableRows = rows
    .map(
      (row) => `<tr>
        <td>${escapeHtml(String(row.rank))}</td>
        <td><strong>${escapeHtml(row.number)}</strong></td>
        <td>${escapeHtml(row.score)}</td>
        <td>${escapeHtml(String(row.count))}</td>
        <td>${escapeHtml(row.lastSeenDate)}</td>
        <td>${escapeHtml(String(row.gapDays))}</td>
        <td>${escapeHtml(row.repeatPenalty)}</td>
        <td>${escapeHtml(row.frequencyScore)}</td>
        <td>${escapeHtml(row.recentScore)}</td>
        <td>${escapeHtml(row.trendScore)}</td>
        <td>${escapeHtml(row.recencyScore)}</td>
        <td>${escapeHtml(row.gapScore)}</td>
        <td>${escapeHtml(row.weekdayScore)}</td>
        <td>${escapeHtml(row.markovScore)}</td>
        <td>${escapeHtml(row.soiCauScore)}</td>
        <td>${escapeHtml(row.reverseScore)}</td>
        <td>${escapeHtml(row.cycleScore)}</td>
        <td>${escapeHtml(row.digitScore)}</td>
        <td>${escapeHtml(row.bridgeScore)}</td>
      </tr>`,
    )
    .join('');
  const trendTableRows = trendRows
    .map(
      (row) => `<tr>
        <td>${escapeHtml(String(row.rank))}</td>
        <td><strong>${escapeHtml(row.number)}</strong></td>
        <td>${escapeHtml(row.trendScore)}</td>
        <td>${escapeHtml(row.trendLift)}</td>
        <td>${escapeHtml(String(row.recentCount))}</td>
        <td>${escapeHtml(String(row.baselineCount))}</td>
        <td>${escapeHtml(row.recentRate)}</td>
        <td>${escapeHtml(row.baselineRate)}</td>
        <td>${escapeHtml(row.lastSeenDate)}</td>
        <td>${escapeHtml(String(row.gapDays))}</td>
      </tr>`,
    )
    .join('');
  const blendTableRows = blendRows
    .map(
      (row) => `<tr>
        <td>${escapeHtml(String(row.rank))}</td>
        <td><strong>${escapeHtml(row.number)}</strong></td>
        <td>${escapeHtml(row.combinedScore)}</td>
        <td>${escapeHtml(row.predictionRank)}</td>
        <td>${escapeHtml(row.predictionScore)}</td>
        <td>${escapeHtml(row.predictionCount)}</td>
        <td>${escapeHtml(row.predictionGapDays)}</td>
        <td>${escapeHtml(row.trendRank)}</td>
        <td>${escapeHtml(row.trendScore)}</td>
        <td>${escapeHtml(row.trendLift)}</td>
        <td>${escapeHtml(row.trendRecentCount)}</td>
        <td>${escapeHtml(row.trendBaselineCount)}</td>
        <td>${escapeHtml(row.trendGapDays)}</td>
        <td>${escapeHtml(row.source)}</td>
      </tr>`,
    )
    .join('');
  const recentSummaryTableRows = recentSummaryRows
    .map(
      (row) => `<tr>
        <td>${escapeHtml(String(row.rank))}</td>
        <td><strong>${escapeHtml(row.number)}</strong></td>
        <td>${escapeHtml(String(row.count))}</td>
        <td>${escapeHtml(String(row.mienBac))}</td>
        <td>${escapeHtml(String(row.mienTrung))}</td>
        <td>${escapeHtml(String(row.mienNam))}</td>
      </tr>`,
    )
    .join('');
  const missingHeadTableRows = missingHeadRows
    .map(
      (row) => `<tr>
        <td>${escapeHtml(row.missingHead)}</td>
        <td>${escapeHtml(String(row.rank))}</td>
        <td><strong>${escapeHtml(row.number)}</strong></td>
        <td>${escapeHtml(String(row.count))}</td>
        <td>${escapeHtml(String(row.hitDays))}</td>
        <td>${escapeHtml(String(row.eventDays))}</td>
        <td>${escapeHtml(row.hitRate)}</td>
        <td>${escapeHtml(row.latestDate)}</td>
      </tr>`,
    )
    .join('');
  const trendSection =
    trendRows.length > 0
      ? `<h3>Last2 Trend</h3>
    <table border="1" cellpadding="6" cellspacing="0">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Number</th>
          <th>Trend Score</th>
          <th>Trend Lift</th>
          <th>Recent Count</th>
          <th>Baseline Count</th>
          <th>Recent Rate</th>
          <th>Baseline Rate</th>
          <th>Last Seen</th>
          <th>Gap Days</th>
        </tr>
      </thead>
      <tbody>${trendTableRows}</tbody>
    </table>`
      : '';
  const blendSection =
    blendRows.length > 0
      ? `<h3>Prediction + Trend Blend</h3>
    <table border="1" cellpadding="6" cellspacing="0">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Number</th>
          <th>Combined</th>
          <th>Prediction Rank</th>
          <th>Prediction Score</th>
          <th>Prediction Count</th>
          <th>Prediction Gap</th>
          <th>Trend Rank</th>
          <th>Trend Score</th>
          <th>Trend Lift</th>
          <th>Trend Recent</th>
          <th>Trend Baseline</th>
          <th>Trend Gap</th>
          <th>Source</th>
        </tr>
      </thead>
      <tbody>${blendTableRows}</tbody>
    </table>`
      : '';
  const recentSummarySection =
    recentSummaryRows.length > 0
      ? `<h3>Recent Last2 Summary - All Regions</h3>
    <table border="1" cellpadding="6" cellspacing="0">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Number</th>
          <th>Total Count</th>
          <th>Mien Bac</th>
          <th>Mien Trung</th>
          <th>Mien Nam</th>
        </tr>
      </thead>
      <tbody>${recentSummaryTableRows}</tbody>
    </table>`
      : '';
  const missingHeadSection =
    missingHeadRows.length > 0
      ? `<h3>Mien Bac Missing Head Follow-up</h3>
    <table border="1" cellpadding="6" cellspacing="0">
      <thead>
        <tr>
          <th>Missing Head</th>
          <th>Rank</th>
          <th>Number</th>
          <th>Count</th>
          <th>Hit Days</th>
          <th>Event Days</th>
          <th>Hit Rate</th>
          <th>Latest Date</th>
        </tr>
      </thead>
      <tbody>${missingHeadTableRows}</tbody>
    </table>`
      : '';
  const daSoSection = daSo
    ? `<h3>Da So - Reference Only</h3>
    <p>Selected numbers: <strong>${escapeHtml(daSo.numbers.map((row) => row.number).join(', '))}</strong><br>
    Formula: ${escapeHtml(daSo.formula)}<br>
    Backtest varies across time blocks; ranking score is not a guaranteed probability.</p>
    <table border="1" cellpadding="6" cellspacing="0"><thead><tr><th>Rank</th><th>Pair</th><th>Score</th><th>Individual</th><th>Co-occurrence</th><th>Recent</th><th>Lift</th><th>Estimated rate</th></tr></thead>
    <tbody>${daSo.pairs.map((row) => `<tr><td>${row.rank}</td><td><strong>${escapeHtml(row.pair)}</strong></td><td>${row.score}</td><td>${row.individualScore}</td><td>${row.coOccurrenceScore}</td><td>${row.recentCoOccurrenceScore}</td><td>${row.associationLift}</td><td>${row.estimatedPairRate}</td></tr>`).join('')}</tbody></table>`
    : '';
  const transitionSection = transitionRows.length > 0
    ? `<h3>Prediction + Transition Matrix - Experimental Reference Only</h3>
    <p><strong>Model version:</strong> ${escapeHtml(MIEN_BAC_TRANSITION_MODEL_VERSION)}<br>
    <strong>Formula:</strong> ${escapeHtml(MIEN_BAC_TRANSITION_FORMULA)}<br>
    <strong>Config:</strong> alpha=${DEFAULT_MIEN_BAC_TRANSITION_CONFIG.priorStrength}, topEdges=${DEFAULT_MIEN_BAC_TRANSITION_CONFIG.topEdges}, lags=${DEFAULT_MIEN_BAC_TRANSITION_CONFIG.lags.join(',')}, lagWeights=${DEFAULT_MIEN_BAC_TRANSITION_CONFIG.lagWeights.join(',')}, lambda=${DEFAULT_MIEN_BAC_TRANSITION_CONFIG.lambda}<br>
    This isolated section does not affect Prediction, Blend, evaluation, or learning.</p>
    <table border="1" cellpadding="6" cellspacing="0">
      <thead><tr><th>Rank</th><th>Number</th><th>Final</th><th>Base</th><th>Base Z</th><th>Transition residual</th><th>Transition Z</th><th>Supporting edges</th><th>History draws</th></tr></thead>
      <tbody>${transitionRows.map((row) => `<tr><td>${row.rank}</td><td><strong>${escapeHtml(row.number)}</strong></td><td>${escapeHtml(row.finalScore)}</td><td>${escapeHtml(row.baseScore)}</td><td>${escapeHtml(row.baseZScore)}</td><td>${escapeHtml(row.transitionResidual)}</td><td>${escapeHtml(row.transitionZScore)}</td><td>${row.supportingEdges}</td><td>${row.historyDraws}</td></tr>`).join('')}</tbody>
    </table>`
    : '';

  return `<!doctype html>
<html>
  <body>
    <h2>${escapeHtml(summary)}</h2>
    <p>Target: ${escapeHtml(target)}<br>History days: ${historyDays}</p>
    <h3>Prediction</h3>
    <table border="1" cellpadding="6" cellspacing="0">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Number</th>
          <th>Score</th>
          <th>Count</th>
          <th>Last Seen</th>
          <th>Gap Days</th>
          <th>Repeat Penalty</th>
          <th>Frequency</th>
          <th>Recent</th>
          <th>Trend</th>
          <th>Recency</th>
          <th>Gap</th>
          <th>Weekday</th>
          <th>Markov</th>
          <th>Soi Cau</th>
          <th>Reverse</th>
          <th>Cycle</th>
          <th>Digit</th>
          <th>Bridge</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
    ${trendSection}
    ${blendSection}
    ${recentSummarySection}
    ${missingHeadSection}
    ${daSoSection}
    ${transitionSection}
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[char];
  });
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

main()
  .catch((error) => {
    logger.error('Mien Bac prediction failed', { error: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  })
  .finally(disconnectDatabase);
