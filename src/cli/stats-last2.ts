import { connectDatabase, disconnectDatabase } from '../config/database';
import { StatisticsService } from '../services/statistics.service';
import { logger } from '../utils/logger';

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  await connectDatabase();
  const rows = await new StatisticsService().topLast2({
    region: option('region'),
    province: option('province'),
    days: Number(option('days') ?? 30),
    limit: Number(option('limit') ?? 10),
  });

  logger.info('Top last2 statistics', { rows });
}

main()
  .catch((error) => {
    logger.error('Stats last2 failed', { error: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  })
  .finally(disconnectDatabase);
