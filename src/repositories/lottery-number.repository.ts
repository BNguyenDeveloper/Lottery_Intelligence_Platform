import { FilterQuery } from 'mongoose';
import { getProvince } from '../constants/provinces';
import { RegionCode } from '../constants/regions';
import { LotteryNumberInput } from '../interfaces/lottery-result.interface';
import {
  AllLotteryNumberModels,
  getLotteryNumberModel,
  LotteryNumberDocument,
  LotteryNumberDocumentShape,
} from '../models/LotteryNumber';

export interface NumberStatsFilter {
  region?: string;
  province?: string;
  fromDate?: string;
  toDate?: string;
}

export class LotteryNumberRepository {
  async deleteByDateAndProvince(date: string, province: string, region: RegionCode): Promise<number> {
    const result = await getLotteryNumberModel(region).deleteMany({ date, province }).exec();
    return result.deletedCount ?? 0;
  }

  async insertMany(inputs: LotteryNumberInput[]): Promise<LotteryNumberDocument[]> {
    if (inputs.length === 0) {
      return [];
    }

    const grouped = new Map<RegionCode, LotteryNumberInput[]>();
    for (const input of inputs) {
      grouped.set(input.region, [...(grouped.get(input.region) ?? []), input]);
    }

    const batches = await Promise.all(
      Array.from(grouped.entries()).map(([region, rows]) => getLotteryNumberModel(region).insertMany(rows)),
    );
    return batches.flat();
  }

  async top(field: 'last2' | 'last3', filter: NumberStatsFilter, limit: number): Promise<Array<{ value: string; count: number }>> {
    const match: FilterQuery<LotteryNumberDocumentShape> = {};
    if (filter.region) match.region = filter.region;
    if (filter.province) match.province = filter.province;
    if (filter.fromDate || filter.toDate) {
      match.date = {};
      if (filter.fromDate) match.date.$gte = filter.fromDate;
      if (filter.toDate) match.date.$lte = filter.toDate;
    }

    const models = this.getModelsForFilter(filter);
    const batches = await Promise.all(
      models.map((model) =>
        model.aggregate<{ _id: string; count: number }>([
          { $match: match },
          { $group: { _id: `$${field}`, count: { $sum: 1 } } },
        ]).exec(),
      ),
    );

    const counts = new Map<string, number>();
    for (const row of batches.flat()) {
      counts.set(row._id, (counts.get(row._id) ?? 0) + row.count);
    }

    const rows = Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value))
      .slice(0, limit);

    return rows;
  }

  private getModelsForFilter(filter: NumberStatsFilter) {
    if (filter.region === 'mien-bac') {
      return [getLotteryNumberModel('mien-bac')];
    }

    if (filter.region === 'mien-trung' || filter.region === 'mien-nam') {
      return [getLotteryNumberModel(filter.region)];
    }

    if (filter.province) {
      const province = getProvince(filter.province);
      return province ? [getLotteryNumberModel(province.region)] : AllLotteryNumberModels;
    }

    return AllLotteryNumberModels;
  }
}
