import { connectDatabase, disconnectDatabase } from '../config/database';
import { LotteryNumberMienTrungModel } from '../models/LotteryNumber';
import { MienTrungFrequencyMatrixReport } from '../services/mien-trung-frequency-matrix.service';
import { getOrRefreshMienTrungFrequencyMatrixSnapshot, MienTrungFrequencyMatrixSource } from '../services/mien-trung-frequency-matrix-snapshot.service';

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  await connectDatabase();
  const provinceOption = option('province') ?? 'all';
  const drawsOption = option('draws') ?? '28';
  const draws: number | 'all' = drawsOption.toLowerCase() === 'all' ? 'all' : Number(drawsOption);
  const throughDate = option('through-date');
  const format = option('format') ?? 'summary';
  const refresh = process.argv.includes('--refresh');
  if (draws !== 'all' && (!Number.isInteger(draws) || draws <= 0)) throw new Error('--draws must be a positive integer or all.');
  const provinces = provinceOption === 'all'
    ? await LotteryNumberMienTrungModel.distinct('province').then((values) => values.sort())
    : [provinceOption];
  const results = await Promise.all(provinces.map((province) =>
    getOrRefreshMienTrungFrequencyMatrixSnapshot({ province, draws, throughDate, refresh })));
  const reports = results.map((result) => result.report);
  const sources = new Map(results.map((result) => [result.report.province, result.source]));
  if (format === 'json') {
    console.log(JSON.stringify(reports, null, 2));
  } else if (format === 'matrix') {
    for (const report of reports) printMatrix(report, sources.get(report.province));
  } else {
    for (const report of reports) printSummary(report, sources.get(report.province));
  }
}

function printSummary(report: MienTrungFrequencyMatrixReport, source?: MienTrungFrequencyMatrixSource): void {
  const top = report.rankings.byTotalOccurrences.map((number) => {
    const row = report.rows.find((candidate) => candidate.number === number)!;
    return `${number}:${row.totalOccurrences}/${row.drawAppearances}`;
  }).join(' ');
  console.log(`${report.province} | source=${source ?? 'UNKNOWN'} | scope=${report.scope} | draws=${report.drawCount} | ${report.firstDate}..${report.lastDate} | complete=${report.completeDraws}/${report.drawCount}`);
  if (report.missingScheduledDates.length > 0) console.log(`  missing scheduled dates: ${report.missingScheduledDates.join(' ')}`);
  console.log(`  hot total/appeared: ${top}`);
  console.log(`  recent6: ${report.rankings.byRecent6Occurrences.join(' ')} | rising: ${report.rankings.byRisingTrend.join(' ')} | longest-current-gap: ${report.rankings.byCurrentGap.join(' ')}`);
}

function printMatrix(report: MienTrungFrequencyMatrixReport, source?: MienTrungFrequencyMatrixSource): void {
  console.log(`\n${report.province} | source=${source ?? 'UNKNOWN'} | ${report.firstDate}..${report.lastDate} | ${report.drawCount} draws`);
  console.log(['number', ...report.dates, 'total', 'draws', 'gap', 'maxGap', 'r6', 'p6', 'trend'].join('\t'));
  for (const row of report.rows) {
    console.log([row.number, ...row.counts.map((count) => count || ''), row.totalOccurrences, row.drawAppearances,
      row.currentGap, row.longestGap, row.recent6Occurrences, row.previous6Occurrences, row.trend].join('\t'));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(disconnectDatabase);
