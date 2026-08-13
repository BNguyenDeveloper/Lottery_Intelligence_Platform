import { connectDatabase, disconnectDatabase } from '../config/database';
import { evaluateMienBacDaSo } from '../services/da-so-evaluation.service';
import { getVietnamDateString } from '../utils/date';
import { logger } from '../utils/logger';
async function main(): Promise<void> { await connectDatabase(); const result = await evaluateMienBacDaSo(process.argv[2] ?? getVietnamDateString()); if (result) console.table([result]); }
main().catch((error) => { logger.error('Da so evaluation failed', { error: error instanceof Error ? error.message : String(error) }); process.exitCode = 1; }).finally(disconnectDatabase);
