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

    const sourceUrl = this.buildRegionUrl(date, region);
    const response = await this.client.get<string>(sourceUrl);
    const scheduledProvinces = getScheduledProvinces(region, date);
    const results = parseRegionalPrizeResults(response.data, date, region, sourceUrl);

    if (!scheduledProvinces) {
      return results;
    }

    const filtered = results.filter((result) => scheduledProvinces.includes(result.province));
    if (filtered.length === scheduledProvinces.length) {
      return filtered;
    }

    const fallbackUrl = this.buildFallbackRegionUrl(date, region);
    const fallbackResponse = await this.client.get<string>(fallbackUrl);
    const fallbackResults = parseCompactRegionalPrizeResults(fallbackResponse.data, date, region, fallbackUrl);
    const fallbackFiltered = fallbackResults.filter((result) => scheduledProvinces.includes(result.province));

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
    const response = await this.client.get<string>(sourceUrl);
    const results = parsePrizeResults(response.data);

    if (Object.values(results).every((numbers) => numbers.length === 0)) {
      return null;
    }

    return {
      date,
      region: province.region,
      province: province.code,
      stationName: province.name,
      results,
      source: 'xskt',
      sourceUrl,
    };
  }

  private buildProvinceUrl(date: string, sourcePath: string): string {
    const { dd, mm, yyyy } = toXsktDateParts(date);

    if (sourcePath === 'xsmb') {
      return env.xsktXsmbDailyUrlTemplate
        .replace('{dd}', dd)
        .replace('{mm}', mm)
        .replace('{yyyy}', yyyy);
    }

    return `${env.lotterySourceBaseUrl.replace(/\/$/, '')}/${sourcePath}/${dd}-${mm}-${yyyy}`;
  }

  private buildRegionUrl(date: string, region: Exclude<RegionCode, 'mien-bac'>): string {
    const { dd, mm, yyyy } = toXsktDateParts(date);
    const sampleXsmbUrl = env.xsktXsmbDailyUrlTemplate
      .replace('{dd}', dd)
      .replace('{mm}', mm)
      .replace('{yyyy}', yyyy);
    const origin = new URL(sampleXsmbUrl).origin;
    const path = region === 'mien-nam' ? 'xsmn' : 'xsmt';
    return `${origin}/${path}/${dd}-${mm}-${yyyy}`;
  }

  private buildFallbackRegionUrl(date: string, region: Exclude<RegionCode, 'mien-bac'>): string {
    const { dd, mm, yyyy } = toXsktDateParts(date);
    const path = region === 'mien-nam' ? 'xsmn' : 'xsmt';
    return `${env.lotterySourceBaseUrl.replace(/\/$/, '')}/${path}/${dd}-${mm}-${yyyy}`;
  }
}
