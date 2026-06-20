import { RegionCode } from '../constants/regions';
import { LotteryResultInput } from './lottery-result.interface';

export interface LotteryCrawler {
  fetchByDate(date: string): Promise<LotteryResultInput[]>;
  fetchByRegion(date: string, region: RegionCode): Promise<LotteryResultInput[]>;
  fetchByProvince(date: string, province: string): Promise<LotteryResultInput | null>;
}
