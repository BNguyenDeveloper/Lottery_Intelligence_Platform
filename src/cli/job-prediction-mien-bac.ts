import { connectDatabase, disconnectDatabase } from '../config/database';
import { getEmailConfigStatus, sendEmail } from '../services/email.service';
import {
  getMienBacLast2PredictionTrendBlend,
  getTrendingMienBacLast2,
  PredictionTarget,
  predictMienBacNumbers,
} from '../services/mien-bac-prediction.service';
import { saveMienBacLast2PredictionSnapshot } from '../services/prediction-snapshot.service';
import { getVietnamDateString } from '../utils/date';
import { logger } from '../utils/logger';

const DEFAULT_OUTPUT_TOP = 5;

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
  const top = Number(option('top') ?? process.env.PREDICTION_TOP ?? DEFAULT_OUTPUT_TOP);
  const trendRecentDays = Number(option('trend-recent-days') ?? process.env.PREDICTION_TREND_RECENT_DAYS ?? 30);
  const trendBaselineDays = Number(option('trend-baseline-days') ?? process.env.PREDICTION_TREND_BASELINE_DAYS ?? 90);
  const trendTop = Number(option('trend-top') ?? process.env.PREDICTION_TREND_TOP ?? 5);
  const blendPredictionTop = Number(option('blend-prediction-top') ?? process.env.PREDICTION_BLEND_PREDICTION_TOP ?? 20);
  const blendTrendTop = Number(option('blend-trend-top') ?? process.env.PREDICTION_BLEND_TREND_TOP ?? 20);
  const blendTop = Number(option('blend-top') ?? process.env.PREDICTION_BLEND_TOP ?? top);
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

  if (rows.length === 0) {
    logger.warn('No Mien Bac prediction rows found', { target, historyDays, top });
    return;
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
  });

  const emailStatus = getEmailConfigStatus();
  if (!emailStatus.configured) {
    logger.warn('Email is not configured. Skipping Mien Bac prediction email.', { missing: emailStatus.missing });
    return;
  }

  await sendEmail({
    subject: `[LotoAI] Mien Bac prediction: ${rows[0].number}`,
    text: buildPredictionEmailText(summary, target, historyDays, rows, trendRows, blendRows),
    html: buildPredictionEmailHtml(summary, target, historyDays, rows, trendRows, blendRows),
  });
  logger.info('Mien Bac prediction email sent successfully.');
}

function buildPredictionEmailText(
  summary: string,
  target: PredictionTarget,
  historyDays: number,
  rows: Awaited<ReturnType<typeof predictMienBacNumbers>>,
  trendRows: Awaited<ReturnType<typeof getTrendingMienBacLast2>>,
  blendRows: Awaited<ReturnType<typeof getMienBacLast2PredictionTrendBlend>>,
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
      `frequency=${row.frequencyScore}`,
      `recent=${row.recentScore}`,
      `trend=${row.trendScore}`,
      `recency=${row.recencyScore}`,
      `gap=${row.gapScore}`,
      `weekday=${row.weekdayScore}`,
      `markov=${row.markovScore}`,
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

  return [...header, 'Prediction', '', ...predictionBody, ...trendHeader, ...trendBody, ...blendHeader, ...blendBody].join('\n');
}

function buildPredictionEmailHtml(
  summary: string,
  target: PredictionTarget,
  historyDays: number,
  rows: Awaited<ReturnType<typeof predictMienBacNumbers>>,
  trendRows: Awaited<ReturnType<typeof getTrendingMienBacLast2>>,
  blendRows: Awaited<ReturnType<typeof getMienBacLast2PredictionTrendBlend>>,
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
        <td>${escapeHtml(row.frequencyScore)}</td>
        <td>${escapeHtml(row.recentScore)}</td>
        <td>${escapeHtml(row.trendScore)}</td>
        <td>${escapeHtml(row.recencyScore)}</td>
        <td>${escapeHtml(row.gapScore)}</td>
        <td>${escapeHtml(row.weekdayScore)}</td>
        <td>${escapeHtml(row.markovScore)}</td>
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
          <th>Frequency</th>
          <th>Recent</th>
          <th>Trend</th>
          <th>Recency</th>
          <th>Gap</th>
          <th>Weekday</th>
          <th>Markov</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
    ${trendSection}
    ${blendSection}
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
