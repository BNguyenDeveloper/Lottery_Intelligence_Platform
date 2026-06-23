import { connectDatabase, disconnectDatabase } from '../config/database';
import { isEmailConfigured, sendEmail } from '../services/email.service';
import { PredictionTarget, predictMienBacNumbers } from '../services/mien-bac-prediction.service';
import { logger } from '../utils/logger';

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
  const top = Number(option('top') ?? process.env.PREDICTION_TOP ?? 10);

  if (!Number.isInteger(historyDays) || historyDays <= 0) {
    throw new Error('history-days must be a positive integer.');
  }

  if (!Number.isInteger(top) || top <= 0) {
    throw new Error('top must be a positive integer.');
  }

  await connectDatabase();
  const rows = await predictMienBacNumbers({ target, historyDays, top });

  if (rows.length === 0) {
    logger.warn('No Mien Bac prediction rows found', { target, historyDays, top });
    return;
  }

  console.table(rows);
  const summary = `Mien Bac prediction completed. Best ${target} candidate: ${rows[0].number}`;
  logger.info('Mien Bac prediction completed', {
    target,
    historyDays,
    top,
    bestNumber: rows[0].number,
    bestScore: rows[0].score,
  });

  if (!isEmailConfigured()) {
    logger.info('Email is not configured. Skipping Mien Bac prediction email.');
    return;
  }

  await sendEmail({
    subject: `[LotoAI] Mien Bac prediction: ${rows[0].number}`,
    text: buildPredictionEmailText(summary, target, historyDays, rows),
    html: buildPredictionEmailHtml(summary, target, historyDays, rows),
  });
  logger.info('Mien Bac prediction email sent successfully.');
}

function buildPredictionEmailText(
  summary: string,
  target: PredictionTarget,
  historyDays: number,
  rows: Awaited<ReturnType<typeof predictMienBacNumbers>>,
): string {
  const header = [summary, `Target: ${target}`, `History days: ${historyDays}`, ''];
  const body = rows.map((row) =>
    [
      `#${row.rank}`,
      `number=${row.number}`,
      `score=${row.score}`,
      `count=${row.count}`,
      `lastSeen=${row.lastSeenDate}`,
      `gapDays=${row.gapDays}`,
    ].join(' | '),
  );

  return [...header, ...body].join('\n');
}

function buildPredictionEmailHtml(
  summary: string,
  target: PredictionTarget,
  historyDays: number,
  rows: Awaited<ReturnType<typeof predictMienBacNumbers>>,
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
      </tr>`,
    )
    .join('');

  return `<!doctype html>
<html>
  <body>
    <h2>${escapeHtml(summary)}</h2>
    <p>Target: ${escapeHtml(target)}<br>History days: ${historyDays}</p>
    <table border="1" cellpadding="6" cellspacing="0">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Number</th>
          <th>Score</th>
          <th>Count</th>
          <th>Last Seen</th>
          <th>Gap Days</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
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

main()
  .catch((error) => {
    logger.error('Mien Bac prediction failed', { error: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  })
  .finally(disconnectDatabase);
