import { Model, Schema, model, HydratedDocument } from 'mongoose';
import { RegionCode } from '../constants/regions';
import { PRIZES } from '../constants/prizes';
import { LotteryResultDocumentShape } from '../interfaces/lottery-result.interface';

const resultsSchema = new Schema(
  Object.fromEntries(PRIZES.map((prize) => [prize, { type: [String], default: [] }])),
  { _id: false },
);

const lotteryResultSchema = new Schema<LotteryResultDocumentShape>(
  {
    date: { type: String, required: true },
    region: { type: String, required: true, enum: ['mien-bac', 'mien-trung', 'mien-nam'] },
    province: { type: String, required: true },
    stationName: { type: String, required: true },
    results: { type: resultsSchema, required: true },
    source: { type: String, required: true },
    sourceUrl: { type: String, required: true },
  },
  {
    timestamps: true,
  },
);

lotteryResultSchema.index({ date: 1, province: 1 }, { unique: true });
lotteryResultSchema.index({ date: 1 });
lotteryResultSchema.index({ region: 1 });
lotteryResultSchema.index({ province: 1 });

export type LotteryResultDocument = HydratedDocument<LotteryResultDocumentShape>;

export const LOTTERY_RESULT_COLLECTIONS = {
  mienBac: 'lottery_results_mien_bac',
  mienTrung: 'lottery_results_mien_trung',
  mienNam: 'lottery_results_mien_nam',
} as const;

export const LotteryResultMienBacModel = model<LotteryResultDocumentShape>(
  'LotteryResultMienBac',
  lotteryResultSchema,
  LOTTERY_RESULT_COLLECTIONS.mienBac,
);

export const LotteryResultMienTrungModel = model<LotteryResultDocumentShape>(
  'LotteryResultMienTrung',
  lotteryResultSchema,
  LOTTERY_RESULT_COLLECTIONS.mienTrung,
);

export const LotteryResultMienNamModel = model<LotteryResultDocumentShape>(
  'LotteryResultMienNam',
  lotteryResultSchema,
  LOTTERY_RESULT_COLLECTIONS.mienNam,
);

export function getLotteryResultModel(region: RegionCode): Model<LotteryResultDocumentShape> {
  if (region === 'mien-bac') return LotteryResultMienBacModel;
  if (region === 'mien-trung') return LotteryResultMienTrungModel;
  return LotteryResultMienNamModel;
}

export const AllLotteryResultModels = [
  LotteryResultMienBacModel,
  LotteryResultMienTrungModel,
  LotteryResultMienNamModel,
];
