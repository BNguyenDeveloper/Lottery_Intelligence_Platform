import axios, { AxiosInstance } from 'axios';
import { env } from '../config/env';
import { getProvince } from '../constants/provinces';
import { REGIONS, RegionCode } from '../constants/regions';
import { getScheduledProvinces } from '../constants/schedules';
import { LotteryCrawler } from '../interfaces/crawler.interface';
import { LotteryResultInput } from '../interfaces/lottery-result.interface';
import { toXsktDateParts } from '../utils/date';
import { parseCompactRegionalPrizeResults, parsePrizeResults, parseRegionalPrizeResults } from '../utils/parser';
import { assertDateString } from '../utils/date';
import { logger } from '../utils/logger';

function errorMeta(error: unknown): Record<string, unknown> {
  if (axios.isAxiosError(error)) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      status: error.response?.status,
      url: error.config?.url,
    };
  }

  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }

  return { error: String(error) };
}

export class XsktCrawlerService implements LotteryCrawler {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      timeout: env.lotteryFetchTimeoutMs,
      headers: {
        'User-Agent': 'LotoAI/0.1.0 (+https://github.com)',
      },
    });
  }

  async fetchByDate(date: string): Promise<LotteryResultInput[]> {
    assertDateString(date);
    const batches = await Promise.all(REGIONS.map((region) => this.fetchByRegion(date, region)));
    return batches.flat();
  }

  async fetchByRegion(date: string, region: RegionCode): Promise<LotteryResultInput[]> {
    assertDateString(date);

    if (region === 'mien-bac') {
      const result = await this.fetchByProvince(date, 'xsmb');
      return result ? [result] : [];
    }

    const scheduledProvinces = getScheduledProvinces(region, date);
    const sourceUrl = this.buildRegionUrl(date, region);
    let results: LotteryResultInput[] = [];

    try {
      const response = await this.client.get<string>(sourceUrl);
      results = parseRegionalPrizeResults(response.data, date, region, sourceUrl);
    } catch (error) {
      logger.warn('Primary regional source failed', { date, region, ...errorMeta(error) });
    }

    if (!scheduledProvinces) {
      return results;
    }

    const filtered = results.filter((result) => scheduledProvinces.includes(result.province));
    if (filtered.length === scheduledProvinces.length) {
      return filtered;
    }

    const fallbackUrl = this.buildFallbackRegionUrl(date, region);
    let fallbackFiltered: LotteryResultInput[] = [];

    try {
      const fallbackResponse = await this.client.get<string>(fallbackUrl);
      const fallbackResults = parseCompactRegionalPrizeResults(fallbackResponse.data, date, region, fallbackUrl);
      fallbackFiltered = fallbackResults.filter((result) => scheduledProvinces.includes(result.province));
    } catch (error) {
      logger.warn('Fallback regional source failed', { date, region, ...errorMeta(error) });
    }

    return fallbackFiltered.length >= filtered.length ? fallbackFiltered : filtered;
  }

  async fetchByProvince(date: string, provinceCode: string): Promise<LotteryResultInput | null> {
    assertDateString(date);
    const province = getProvince(provinceCode);

    if (!province) {
      throw new Error(`Unsupported province "${provinceCode}"`);
    }

    if (province.region !== 'mien-bac') {
      const results = await this.fetchByRegion(date, province.region);
      return results.find((result) => result.province === province.code) ?? null;
    }

    const sourceUrl = this.buildProvinceUrl(date, province.sourcePath ?? province.code);
    let resolvedSourceUrl = sourceUrl;
    let source = new URL(sourceUrl).hostname.replace(/^www\./, '');
    let html: string;

    try {
      const response = await this.client.get<string>(sourceUrl);
      html = response.data;
    } catch (error) {
      logger.warn('Primary northern source failed', { date, province: province.code, ...errorMeta(error) });
      resolvedSourceUrl = this.buildFallbackProvinceUrl(date, province.sourcePath ?? province.code);
      source = 'xskt.com.vn';
      const fallbackResponse = await this.client.get<string>(resolvedSourceUrl);
      html = fallbackResponse.data;
    }

    const results = parsePrizeResults(html);

    if (Object.values(results).every((numbers) => numbers.length === 0)) {
      return null;
    }

    return {
      date,
      region: province.region,
      province: province.code,
      stationName: province.name,
      results,
      source,
      sourceUrl: resolvedSourceUrl,
    };
  }

  private buildProvinceUrl(date: string, sourcePath: string): string {
    const { dd, mm, yyyy } = toXsktDateParts(date);

    if (sourcePath === 'xsmb') {
      return env.xsmbDailyUrlTemplate
        .replace('{dd}', dd)
        .replace('{mm}', mm)
        .replace('{yyyy}', yyyy);
    }

    return `${env.lotterySourceBaseUrl.replace(/\/$/, '')}/${sourcePath}/${dd}-${mm}-${yyyy}`;
  }

  private buildFallbackProvinceUrl(date: string, sourcePath: string): string {
    const { dd, mm, yyyy } = toXsktDateParts(date);
    return `${env.lotterySourceBaseUrl.replace(/\/$/, '')}/${sourcePath}/${dd}-${mm}-${yyyy}`;
  }

  private buildRegionUrl(date: string, region: Exclude<RegionCode, 'mien-bac'>): string {
    const { dd, mm, yyyy } = toXsktDateParts(date);
    const origin = new URL(env.lotterySourceBaseUrl).origin;
    const path = region === 'mien-nam' ? 'xsmn' : 'xsmt';
    return `${origin}/${path}/${dd}-${mm}-${yyyy}`;
  }

  private buildFallbackRegionUrl(date: string, region: Exclude<RegionCode, 'mien-bac'>): string {
    const { dd, mm, yyyy } = toXsktDateParts(date);
    const path = region === 'mien-nam' ? 'xsmn' : 'xsmt';
    return `${env.lotterySourceBaseUrl.replace(/\/$/, '')}/${path}/${dd}-${mm}-${yyyy}`;
  }
}
