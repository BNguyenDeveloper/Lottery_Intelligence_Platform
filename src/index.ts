import { env } from './config/env';
import { logger } from './utils/logger';

logger.info('LotoAI backend initialized', {
  port: env.port,
  nodeEnv: env.nodeEnv,
});
