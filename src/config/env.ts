import dotenv from 'dotenv';

dotenv.config();

const requiredKeys = [
  'MONGODB_URI',
  'LOTTERY_SOURCE_BASE_URL',
  'XSKT_XSMB_DAILY_URL_TEMPLATE',
] as const;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

for (const key of requiredKeys) {
  requireEnv(key);
}

const timeout = Number(process.env.LOTTERY_FETCH_TIMEOUT_MS ?? '25000');

if (!Number.isFinite(timeout) || timeout <= 0) {
  throw new Error('LOTTERY_FETCH_TIMEOUT_MS must be a positive number');
}

export const env = {
  port: Number(process.env.PORT ?? 3000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  mongodbUri: requireEnv('MONGODB_URI'),
  lotterySourceBaseUrl: requireEnv('LOTTERY_SOURCE_BASE_URL'),
  xsktXsmbDailyUrlTemplate: requireEnv('XSKT_XSMB_DAILY_URL_TEMPLATE'),
  lotteryFetchTimeoutMs: timeout,
};
