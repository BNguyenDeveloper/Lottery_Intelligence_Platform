import * as cheerio from 'cheerio';
import { getProvinceByDisplayName } from '../constants/provinces';
import { PRIZES, PrizeCode } from '../constants/prizes';
import { RegionCode } from '../constants/regions';
import { LotteryPrizeResults, LotteryResultInput } from '../interfaces/lottery-result.interface';

const PRIZE_LABELS: Record<string, PrizeCode> = {
  DB: 'db',
  'G.1': 'g1',
  'G.2': 'g2',
  'G.3': 'g3',
  'G.4': 'g4',
  'G.5': 'g5',
  'G.6': 'g6',
  'G.7': 'g7',
  'G.8': 'g8',
  G1: 'g1',
  G2: 'g2',
  G3: 'g3',
  G4: 'g4',
  G5: 'g5',
  G6: 'g6',
  G7: 'g7',
  G8: 'g8',
};

const PRIZE_WIDTHS: Record<PrizeCode, number> = {
  db: 6,
  g1: 5,
  g2: 5,
  g3: 5,
  g4: 5,
  g5: 4,
  g6: 4,
  g7: 3,
  g8: 2,
};

function normalizeLabel(value: string): string {
  return value
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
    .trim()
    .toUpperCase();
}

export function emptyPrizeResults(): LotteryPrizeResults {
  const results = {} as LotteryPrizeResults;
  for (const prize of PRIZES) {
    results[prize] = [];
  }

  return results;
}

export function extractDigitGroups(text: string): string[] {
  return Array.from(text.matchAll(/\b\d{2,6}\b/g)).map((match) => match[0]);
}

function extractPrizeNumbers(text: string, prize: PrizeCode): string[] {
  const digits = text.replace(/\D/g, '');
  const width = PRIZE_WIDTHS[prize];

  if (digits.length > width && digits.length % width === 0) {
    return Array.from({ length: digits.length / width }, (_, index) =>
      digits.slice(index * width, (index + 1) * width),
    );
  }

  return extractDigitGroups(text);
}

function findResultTable($: cheerio.CheerioAPI, requireG8: boolean) {
  return $('table.table-lotto')
    .toArray()
    .find((table) => {
      const text = $(table).text().replace(/\s+/g, ' ').trim();
      return /\bG1\b/.test(text) && (requireG8 ? /\bG8\b/.test(text) : /\bG2\b/.test(text)) && (text.includes('ĐB') || /\bDB\b/.test(text));
    });
}

export function parsePrizeResults(html: string): LotteryPrizeResults {
  const $ = cheerio.load(html);
  const results = emptyPrizeResults();
  const resultTable = findResultTable($, false);

  if (!resultTable) {
    return results;
  }

  let currentPrize: PrizeCode | null = null;

  $(resultTable)
    .find('tr')
    .each((_, row) => {
      const cells = $(row).find('th,td').toArray();
      const firstCellText = normalizeLabel($(cells[0]).text());
      const nextPrize = PRIZE_LABELS[firstCellText];
      const numberCells = nextPrize ? cells.slice(1) : cells;

      if (nextPrize) {
        currentPrize = nextPrize;
      }

      if (!currentPrize) {
        return;
      }

      for (const cell of numberCells) {
        const className = $(cell).attr('class') ?? '';
        if (!className.includes('prize')) {
          continue;
        }

        results[currentPrize].push(...extractDigitGroups($(cell).text()));
      }
    });

  for (const prize of PRIZES) {
    results[prize] = Array.from(new Set(results[prize]));
  }

  return results;
}

export function parseRegionalPrizeResults(
  html: string,
  date: string,
  region: Exclude<RegionCode, 'mien-bac'>,
  sourceUrl: string,
): LotteryResultInput[] {
  const $ = cheerio.load(html);
  const resultTable = findResultTable($, true);

  if (!resultTable) {
    return [];
  }

  const headerRow = $(resultTable)
    .find('tr')
    .toArray()
    .find((row) => normalizeLabel($($(row).find('th,td').first()).text()) === 'TINH');

  if (!headerRow) {
    return [];
  }

  const stations = $(headerRow)
    .find('th,td')
    .toArray()
    .slice(1)
    .map((cell) => {
      const displayName = $(cell).text().replace(/\s+/g, ' ').trim();
      const province = getProvinceByDisplayName(displayName, region);
      return province
        ? {
            input: {
              date,
              region,
              province: province.code,
              stationName: province.name,
              results: emptyPrizeResults(),
              source: 'xskt',
              sourceUrl,
            } satisfies LotteryResultInput,
          }
        : null;
    });

  let currentPrize: PrizeCode | null = null;

  $(resultTable)
    .find('tr')
    .each((_, row) => {
      const cells = $(row).find('th,td').toArray();
      const firstCellText = normalizeLabel($(cells[0]).text());

      if (firstCellText === 'TINH') {
        return;
      }

      const nextPrize = PRIZE_LABELS[firstCellText];
      const numberCells = nextPrize ? cells.slice(1) : cells;

      if (nextPrize) {
        currentPrize = nextPrize;
      }

      if (!currentPrize || numberCells.length === 0) {
        return;
      }

      const prize = currentPrize;
      numberCells.forEach((cell, index) => {
        const station = stations[index];
        if (!station) {
          return;
        }

        const className = $(cell).attr('class') ?? '';
        if (!className.includes('prize')) {
          return;
        }

        station.input.results[prize].push(...extractDigitGroups($(cell).text()));
      });
    });

  return stations
    .filter((station): station is NonNullable<typeof station> => station !== null)
    .map(({ input }) => {
      for (const prize of PRIZES) {
        input.results[prize] = Array.from(new Set(input.results[prize]));
      }
      return input;
    })
    .filter((input) => Object.values(input.results).some((numbers) => numbers.length > 0));
}

export function parseCompactRegionalPrizeResults(
  html: string,
  date: string,
  region: Exclude<RegionCode, 'mien-bac'>,
  sourceUrl: string,
): LotteryResultInput[] {
  const $ = cheerio.load(html);
  const tables = $('table').toArray();

  for (const table of tables) {
    const rows = $(table).find('tr').toArray();
    if (rows.length === 0) {
      continue;
    }

    const headers = $(rows[0])
      .find('th,td')
      .toArray()
      .slice(1)
      .map((cell) => $(cell).text().replace(/\s+/g, ' ').trim());

    const inputs: LotteryResultInput[] = [];
    for (const name of headers) {
      const province = getProvinceByDisplayName(name, region);
      if (!province) {
        continue;
      }

      inputs.push({
        date,
        region,
        province: province.code,
        stationName: province.name,
        results: emptyPrizeResults(),
        source: 'xskt.com.vn',
        sourceUrl,
      });
    }

    if (inputs.length === 0) {
      continue;
    }

    for (const row of rows.slice(1)) {
      const cells = $(row).find('th,td').toArray();
      const label = normalizeLabel($(cells[0]).text());
      const prize = PRIZE_LABELS[label];

      if (!prize) {
        continue;
      }

      cells.slice(1).forEach((cell, index) => {
        const input = inputs[index];
        if (!input) {
          return;
        }

        input.results[prize].push(...extractPrizeNumbers($(cell).text(), prize));
      });
    }

    const parsed = inputs.filter((input) => Object.values(input.results).some((numbers) => numbers.length > 0));
    if (parsed.length > 0) {
      return parsed;
    }
  }

  return [];
}
