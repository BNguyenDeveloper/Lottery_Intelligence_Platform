import { MienTrungFrequencyMatrixSnapshotModel } from '../models/MienTrungFrequencyMatrixSnapshot';
import { LotteryNumberMienTrungModel } from '../models/LotteryNumber';
import { getMienTrungFrequencyMatrix, MienTrungFrequencyMatrixReport } from './mien-trung-frequency-matrix.service';
import { LotteryResultInput } from '../interfaces/lottery-result.interface';
import { logger } from '../utils/logger';

export type MienTrungFrequencyMatrixSource = 'CACHE' | 'REFRESHED';

export async function saveMienTrungFrequencyMatrixSnapshot(report: MienTrungFrequencyMatrixReport): Promise<void> {
  if (!report.lastDate || report.drawCount === 0) return;
  await MienTrungFrequencyMatrixSnapshotModel.updateOne(
    { province: report.province, throughDate: report.lastDate, scope: report.scope, requestedDraws: report.requestedDraws },
    {
      $set: {
        province: report.province,
        scope: report.scope,
        throughDate: report.lastDate,
        requestedDraws: report.requestedDraws,
        drawCount: report.drawCount,
        firstDate: report.firstDate,
        lastDate: report.lastDate,
        dates: report.dates,
        draws: report.draws,
        completeDraws: report.completeDraws,
        missingScheduledDates: report.missingScheduledDates,
        rows: report.rows,
        rankings: report.rankings,
      },
    },
    { upsert: true },
  ).exec();
}

export async function getOrRefreshMienTrungFrequencyMatrixSnapshot(options: {
  province: string;
  draws: number | 'all';
  throughDate?: string;
  refresh?: boolean;
}): Promise<{ report: MienTrungFrequencyMatrixReport; source: MienTrungFrequencyMatrixSource }> {
  const latestRaw = await LotteryNumberMienTrungModel.findOne({
    province: options.province,
    ...(options.throughDate ? { date: { $lte: options.throughDate } } : {}),
  }).select({ date: 1, _id: 0 }).sort({ date: -1 }).lean<{ date: string }>().exec();
  const scope = options.draws === 'all' ? 'ALL' : 'LATEST';
  if (!options.refresh && latestRaw?.date) {
    const cached = await MienTrungFrequencyMatrixSnapshotModel.findOne({
      province: options.province,
      scope,
      lastDate: latestRaw.date,
      ...(options.draws === 'all' ? {} : { requestedDraws: options.draws }),
    }).sort({ updatedAt: -1 }).lean().exec();
    if (cached) return { report: snapshotToReport(cached), source: 'CACHE' };
  }
  const report = await getMienTrungFrequencyMatrix(options);
  await saveMienTrungFrequencyMatrixSnapshot(report);
  return { report, source: 'REFRESHED' };
}

export async function refreshMienTrungFrequencyMatrixSnapshotsAfterImport(
  inputs: Pick<LotteryResultInput, 'region' | 'province'>[],
): Promise<void> {
  const provinces = [...new Set(inputs
    .filter((input) => input.region === 'mien-trung')
    .map((input) => input.province))];
  if (provinces.length === 0) return;
  try {
    await Promise.all(provinces.map(async (province) => {
      const [all, latest] = await Promise.all([
        getMienTrungFrequencyMatrix({ province, draws: 'all' }),
        getMienTrungFrequencyMatrix({ province, draws: 28 }),
      ]);
      await Promise.all([
        saveMienTrungFrequencyMatrixSnapshot(all),
        saveMienTrungFrequencyMatrixSnapshot(latest),
      ]);
      logger.info('Mien Trung frequency matrix snapshots refreshed', {
        province,
        throughDate: all.lastDate,
        allDraws: all.drawCount,
        latestDraws: latest.drawCount,
      });
    }));
  } catch (error) {
    logger.error('Failed to refresh Mien Trung frequency matrix snapshots; import remains successful and cache will refresh on next lookup', {
      provinces,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function snapshotToReport(snapshot: Record<string, any>): MienTrungFrequencyMatrixReport {
  return {
    province: snapshot.province,
    scope: snapshot.scope,
    requestedDraws: snapshot.requestedDraws,
    drawCount: snapshot.drawCount,
    firstDate: snapshot.firstDate,
    lastDate: snapshot.lastDate,
    dates: snapshot.dates,
    draws: snapshot.draws,
    completeDraws: snapshot.completeDraws,
    missingScheduledDates: snapshot.missingScheduledDates,
    rows: snapshot.rows,
    rankings: snapshot.rankings,
  };
}
