import { PRIZES } from '../constants/prizes';
import { LotteryNumberInput } from '../interfaces/lottery-result.interface';
import { LotteryResultDocument } from '../models/LotteryResult';

export class LotteryNumberNormalizerService {
  normalize(result: LotteryResultDocument): LotteryNumberInput[] {
    const rows: LotteryNumberInput[] = [];

    for (const prize of PRIZES) {
      const numbers = result.results[prize] ?? [];

      numbers.forEach((fullNumber, index) => {
        const last2 = fullNumber.slice(-2).padStart(2, '0');
        const last3 = fullNumber.slice(-3).padStart(3, '0');

        rows.push({
          date: result.date,
          region: result.region,
          province: result.province,
          stationName: result.stationName,
          prize,
          position: index + 1,
          fullNumber,
          last2,
          last3,
          head: last2[0],
          tail: last2[1],
          sourceResultId: result._id.toString(),
        });
      });
    }

    return rows;
  }
}
