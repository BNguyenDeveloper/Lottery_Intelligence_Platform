import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { getProvincesByRegion } from '../constants/provinces';
import { MienTrungFrequencyMatrixSnapshotModel } from '../models/MienTrungFrequencyMatrixSnapshot';
import { buildMienTrungFrequencyMatrixPage } from '../http/mien-trung-frequency-matrix.page';

type MatrixScope = 'ALL' | 'LATEST';

async function main(): Promise<void> {
  await connectDatabase();
  const outputRoot = path.resolve(process.cwd(), 'pages');
  const matrixRoot = path.join(outputRoot, 'matrix', 'mien-trung');
  const dataRoot = path.join(matrixRoot, 'data');
  await mkdir(dataRoot, { recursive: true });
  const provinceConfigs = getProvincesByRegion('mien-trung');
  const snapshots = await MienTrungFrequencyMatrixSnapshotModel.find({
    province: { $in: provinceConfigs.map((province) => province.code) },
    scope: { $in: ['ALL', 'LATEST'] },
  }).select({ province: 1, scope: 1, requestedDraws: 1, drawCount: 1, firstDate: 1, lastDate: 1,
    dates: 1, completeDraws: 1, missingScheduledDates: 1, rows: 1, rankings: 1, updatedAt: 1, _id: 0 })
    .sort({ lastDate: -1, updatedAt: -1 }).lean().exec();
  const latest = new Map<string, typeof snapshots[number]>();
  for (const snapshot of snapshots) {
    const key = `${snapshot.province}:${snapshot.scope}`;
    if (!latest.has(key)) latest.set(key, snapshot);
  }
  const missing: string[] = [];
  const provinces = [];
  for (const province of provinceConfigs.sort((left, right) => left.code.localeCompare(right.code))) {
    const all = latest.get(`${province.code}:ALL`);
    const recent = latest.get(`${province.code}:LATEST`);
    if (!all) missing.push(`${province.code}:ALL`);
    if (!recent) missing.push(`${province.code}:LATEST`);
    if (!all || !recent) continue;
    provinces.push({ code: province.code, name: province.name,
      all: summary(all as SnapshotSummary), latest: summary(recent as SnapshotSummary) });
    await Promise.all([
      writeJson(path.join(dataRoot, `${province.code}-all.json`), { name: province.name, snapshot: all }),
      writeJson(path.join(dataRoot, `${province.code}-latest.json`), { name: province.name, snapshot: recent }),
    ]);
  }
  if (missing.length > 0) throw new Error(`Missing current snapshots: ${missing.join(', ')}`);
  await Promise.all([
    writeJson(path.join(dataRoot, 'provinces.json'), { generatedAt: new Date().toISOString(), provinces }),
    writeFile(path.join(matrixRoot, 'index.html'), buildMienTrungFrequencyMatrixPage('static'), 'utf8'),
    writeFile(path.join(outputRoot, 'index.html'), '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=./matrix/mien-trung/"><title>Ma trận Miền Trung</title><a href="./matrix/mien-trung/">Mở ma trận Miền Trung</a>', 'utf8'),
    writeFile(path.join(outputRoot, '.nojekyll'), '', 'utf8'),
  ]);
  console.log(JSON.stringify({ outputRoot, provinces: provinces.length, snapshots: snapshots.length }));
}

interface SnapshotSummary { scope: MatrixScope; drawCount: number; firstDate: string; lastDate: string; updatedAt?: Date }
function summary(snapshot: SnapshotSummary): SnapshotSummary { return { scope: snapshot.scope, drawCount: snapshot.drawCount,
  firstDate: snapshot.firstDate, lastDate: snapshot.lastDate, updatedAt: snapshot.updatedAt }; }
async function writeJson(file: string, value: unknown): Promise<void> { await writeFile(file, JSON.stringify(value), 'utf8'); }

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(disconnectDatabase);
