import { AllLotteryResultModels, getLotteryResultModel, LotteryResultDocument } from '../models/LotteryResult';
import { LotteryResultInput } from '../interfaces/lottery-result.interface';

export class LotteryResultRepository {
  async upsert(input: LotteryResultInput): Promise<LotteryResultDocument> {
    return getLotteryResultModel(input.region).findOneAndUpdate(
      { date: input.date, province: input.province },
      { $set: input },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).exec();
  }

  async findByDate(date: string): Promise<LotteryResultDocument[]> {
    const batches = await Promise.all(
      AllLotteryResultModels.map((model) => model.find({ date }).sort({ province: 1 }).exec()),
    );
    return batches.flat().sort((left, right) => left.province.localeCompare(right.province));
  }
}
