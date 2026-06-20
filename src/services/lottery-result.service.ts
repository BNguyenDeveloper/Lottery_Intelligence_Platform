import { LotteryResultInput } from '../interfaces/lottery-result.interface';
import { LotteryResultRepository } from '../repositories/lottery-result.repository';
import { LotteryNumberRepository } from '../repositories/lottery-number.repository';
import { LotteryNumberNormalizerService } from './lottery-number-normalizer.service';
import { logger } from '../utils/logger';

export class LotteryResultService {
  constructor(
    private readonly resultRepository = new LotteryResultRepository(),
    private readonly numberRepository = new LotteryNumberRepository(),
    private readonly normalizer = new LotteryNumberNormalizerService(),
  ) {}

  async saveResult(input: LotteryResultInput): Promise<{ normalizedCount: number }> {
    const result = await this.resultRepository.upsert(input);
    await this.numberRepository.deleteByDateAndProvince(result.date, result.province, result.region);
    const normalized = this.normalizer.normalize(result);
    await this.numberRepository.insertMany(normalized);

    logger.info('Lottery result saved', {
      date: result.date,
      region: result.region,
      province: result.province,
      normalizedRecords: normalized.length,
    });

    return { normalizedCount: normalized.length };
  }

  async saveMany(inputs: LotteryResultInput[]): Promise<{ savedRecords: number; normalizedRecords: number; failures: number }> {
    let savedRecords = 0;
    let normalizedRecords = 0;
    let failures = 0;

    for (const input of inputs) {
      try {
        const result = await this.saveResult(input);
        savedRecords += 1;
        normalizedRecords += result.normalizedCount;
      } catch (error) {
        failures += 1;
        logger.error('Failed to save lottery result', {
          date: input.date,
          region: input.region,
          province: input.province,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { savedRecords, normalizedRecords, failures };
  }
}
