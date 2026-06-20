import { Model, Schema, model, HydratedDocument } from 'mongoose';
import { RegionCode } from '../constants/regions';
import { LotteryNumberInput } from '../interfaces/lottery-result.interface';

export interface LotteryNumberDocumentShape extends LotteryNumberInput {
  createdAt: Date;
  updatedAt: Date;
}

const lotteryNumberSchema = new Schema<LotteryNumberDocumentShape>(
  {
    date: { type: String, required: true },
    region: { type: String, required: true, enum: ['mien-bac', 'mien-trung', 'mien-nam'] },
    province: { type: String, required: true },
    stationName: { type: String, required: true },
    prize: { type: String, required: true },
    position: { type: Number, required: true },
    fullNumber: { type: String, required: true },
    last2: { type: String, required: true },
    last3: { type: String, required: true },
    head: { type: String, required: true },
    tail: { type: String, required: true },
    sourceResultId: { type: String, required: true },
  },
  {
    timestamps: true,
  },
);

lotteryNumberSchema.index({ last2: 1 });
lotteryNumberSchema.index({ last3: 1 });
lotteryNumberSchema.index({ date: 1 });
lotteryNumberSchema.index({ region: 1 });
lotteryNumberSchema.index({ province: 1 });
lotteryNumberSchema.index({ region: 1, last2: 1 });
lotteryNumberSchema.index({ province: 1, last2: 1 });
lotteryNumberSchema.index({ date: 1, region: 1 });
lotteryNumberSchema.index({ date: 1, province: 1 });

export type LotteryNumberDocument = HydratedDocument<LotteryNumberDocumentShape>;

export const LOTTERY_NUMBER_COLLECTIONS = {
  mienBac: 'lottery_numbers_mien_bac',
  mienTrung: 'lottery_numbers_mien_trung',
  mienNam: 'lottery_numbers_mien_nam',
} as const;

export const LotteryNumberMienBacModel = model<LotteryNumberDocumentShape>(
  'LotteryNumberMienBac',
  lotteryNumberSchema,
  LOTTERY_NUMBER_COLLECTIONS.mienBac,
);

export const LotteryNumberMienTrungModel = model<LotteryNumberDocumentShape>(
  'LotteryNumberMienTrung',
  lotteryNumberSchema,
  LOTTERY_NUMBER_COLLECTIONS.mienTrung,
);

export const LotteryNumberMienNamModel = model<LotteryNumberDocumentShape>(
  'LotteryNumberMienNam',
  lotteryNumberSchema,
  LOTTERY_NUMBER_COLLECTIONS.mienNam,
);

export function getLotteryNumberModel(region: RegionCode): Model<LotteryNumberDocumentShape> {
  if (region === 'mien-bac') return LotteryNumberMienBacModel;
  if (region === 'mien-trung') return LotteryNumberMienTrungModel;
  return LotteryNumberMienNamModel;
}

export const AllLotteryNumberModels = [
  LotteryNumberMienBacModel,
  LotteryNumberMienTrungModel,
  LotteryNumberMienNamModel,
];
