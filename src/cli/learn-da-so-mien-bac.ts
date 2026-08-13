import { connectDatabase, disconnectDatabase } from '../config/database';
import { updateMienBacDaSoLearning } from '../services/da-so-learning.service';
import { logger } from '../utils/logger';
function option(name: string): string | undefined { const index = process.argv.indexOf(`--${name}`); return index >= 0 ? process.argv[index + 1] : undefined; }
async function main(): Promise<void> { await connectDatabase(); const result = await updateMienBacDaSoLearning({ historyDays: Number(option('history-days') ?? 365), backtestDays: Number(option('backtest-days') ?? 60), learningRate: Number(option('learning-rate') ?? 0.25) }); if (result) console.table([{ ...result, weights: JSON.stringify(result.weights) }]); }
main().catch((error) => { logger.error('Da so learning failed', { error: error instanceof Error ? error.message : String(error) }); process.exitCode = 1; }).finally(disconnectDatabase);
