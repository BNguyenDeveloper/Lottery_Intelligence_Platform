import { PrizeCode } from '../constants/prizes';
import { RegionCode } from '../constants/regions';

export type LotteryPrizeResults = Record<PrizeCode, string[]>;

export interface LotteryResultInput {
  date: string;
  region: RegionCode;
  province: string;
  stationName: string;
  results: LotteryPrizeResults;
  source: string;
  sourceUrl: string;
}

export interface LotteryResultDocumentShape extends LotteryResultInput {
  createdAt: Date;
  updatedAt: Date;
}

export interface LotteryNumberInput {
  date: string;
  region: RegionCode;
  province: string;
  stationName: string;
  prize: PrizeCode;
  position: number;
  fullNumber: string;
  last2: string;
  last3: string;
  head: string;
  tail: string;
  sourceResultId: string;
}
