import { LotteryResultMienTrungModel } from '../models/LotteryResult';

export const MIEN_TRUNG_SPECIAL_LAST3_MODEL_VERSION = 'mien-trung-special-last3-hierarchical-bayesian-v1';
export const MIEN_TRUNG_SPECIAL_LAST3_FORMULA =
  'score = 0.40*regional + 0.35*province + 0.15*trend + 0.10*transition';
export const SPECIAL_LAST3_RANDOM_BASELINE_RATE = 1 / 1000;

const CANDIDATES = Array.from({ length: 1000 }, (_, value) => value.toString().padStart(3, '0'));
const EXACT_ALPHA = 0.5;
const DIGIT_ALPHA = 1;
const PROVINCE_PRIOR_STRENGTH = 12;
const TRANSITION_PRIOR_STRENGTH = 8;

export interface SpecialLast3Draw {
  date: string;
  province: string;
  last3: string;
}

export interface MienTrungSpecialLast3Prediction {
  province: string;
  targetDate: string;
  number: string;
  score: string;
  regionalScore: string;
  provinceScore: string;
  trendScore: string;
  transitionScore: string;
  regionalDraws: number;
  provinceDraws: number;
  formula: string;
  modelVersion: string;
}

export interface MienTrungSpecialLast3BacktestDay {
  date: string;
  province: string;
  predicted: string;
  actual: string;
  hit: boolean;
  score: string;
  provinceDraws: number;
  regionalDraws: number;
}

export interface MienTrungSpecialLast3BacktestResult {
  province: string;
  evaluatedDraws: number;
  hits: number;
  hitRate: string;
  randomBaselineHitRate: string;
  randomBaselineExpectedHits: string;
  liftVsRandom: string;
  days: MienTrungSpecialLast3BacktestDay[];
}

interface ResultHistoryRow {
  date: string;
  province: string;
  results?: { db?: string[] };
}

interface RawScore {
  number: string;
  regional: number;
  province: number;
  trend: number;
  transition: number;
}

export async function loadMienTrungSpecialLast3Draws(options: {
  beforeDate?: string;
  fromDate?: string;
  throughDate?: string;
} = {}): Promise<SpecialLast3Draw[]> {
  const date: Record<string, string> = {};
  if (options.fromDate) date.$gte = options.fromDate;
  if (options.beforeDate) date.$lt = options.beforeDate;
  if (options.throughDate) date.$lte = options.throughDate;

  const rows = await LotteryResultMienTrungModel.find({
    ...(Object.keys(date).length > 0 ? { date } : {}),
  })
    .select({ date: 1, province: 1, 'results.db': 1 })
    .sort({ date: 1, province: 1 })
    .lean<ResultHistoryRow[]>()
    .exec();

  return rows.flatMap((row) => {
    const fullNumber = row.results?.db?.[0];
    if (!fullNumber || !/^\d+$/.test(fullNumber)) return [];
    return [{ date: row.date, province: row.province, last3: fullNumber.slice(-3).padStart(3, '0') }];
  });
}

export async function predictMienTrungProvinceSpecialLast3(options: {
  province: string;
  targetDate: string;
  historyDays: number;
}): Promise<MienTrungSpecialLast3Prediction | undefined> {
  const draws = await loadMienTrungSpecialLast3Draws({
    fromDate: shiftDate(options.targetDate, -options.historyDays),
    beforeDate: options.targetDate,
  });
  return predictFromDraws(draws, options.province, options.targetDate);
}

export function predictFromDraws(
  history: SpecialLast3Draw[],
  province: string,
  targetDate: string,
): MienTrungSpecialLast3Prediction | undefined {
  const regionalDraws = history.filter((draw) => draw.date < targetDate);
  const provinceDraws = regionalDraws.filter((draw) => draw.province === province);
  if (regionalDraws.length < 30 || provinceDraws.length < 5) return undefined;

  const regionalExact = exactProbabilities(regionalDraws);
  const regionalDigits = digitProbabilities(regionalDraws);
  const provinceExact = hierarchicalExactProbabilities(provinceDraws, regionalExact);
  const provinceDigits = hierarchicalDigitProbabilities(provinceDraws, regionalDigits);
  const trendWindows = [13, 26, 52].map((size) => digitProbabilities(provinceDraws.slice(-size)));
  const regionalTransitions = transitionProbabilities(regionalDraws);
  const provinceTransitions = hierarchicalTransitionProbabilities(provinceDraws, regionalTransitions);
  const previous = provinceDraws.at(-1)?.last3;

  const raw: RawScore[] = CANDIDATES.map((number) => ({
    number,
    regional: 0.5 * regionalExact[number] + 0.5 * digitLikelihood(number, regionalDigits),
    province: 0.5 * provinceExact[number] + 0.5 * digitLikelihood(number, provinceDigits),
    trend:
      0.5 * digitLikelihood(number, trendWindows[0]) +
      0.3 * digitLikelihood(number, trendWindows[1]) +
      0.2 * digitLikelihood(number, trendWindows[2]),
    transition: previous ? transitionLikelihood(number, previous, provinceTransitions) : 0,
  }));

  const maxima = {
    regional: Math.max(...raw.map((row) => row.regional)),
    province: Math.max(...raw.map((row) => row.province)),
    trend: Math.max(...raw.map((row) => row.trend)),
    transition: Math.max(...raw.map((row) => row.transition)),
  };
  const ranked = raw
    .map((row) => {
      const regional = normalize(row.regional, maxima.regional);
      const provinceScore = normalize(row.province, maxima.province);
      const trend = normalize(row.trend, maxima.trend);
      const transition = normalize(row.transition, maxima.transition);
      return {
        ...row,
        regional,
        province: provinceScore,
        trend,
        transition,
        score: 0.4 * regional + 0.35 * provinceScore + 0.15 * trend + 0.1 * transition,
      };
    })
    .sort((left, right) => right.score - left.score || left.number.localeCompare(right.number));
  const best = ranked[0];

  return {
    province,
    targetDate,
    number: best.number,
    score: format(best.score),
    regionalScore: format(best.regional),
    provinceScore: format(best.province),
    trendScore: format(best.trend),
    transitionScore: format(best.transition),
    regionalDraws: regionalDraws.length,
    provinceDraws: provinceDraws.length,
    formula: MIEN_TRUNG_SPECIAL_LAST3_FORMULA,
    modelVersion: MIEN_TRUNG_SPECIAL_LAST3_MODEL_VERSION,
  };
}

export function backtestFromDraws(options: {
  draws: SpecialLast3Draw[];
  province: string;
  testDraws: number;
  historyDays: number;
  throughDate?: string;
}): MienTrungSpecialLast3BacktestResult | undefined {
  const all = options.draws
    .filter((draw) => !options.throughDate || draw.date <= options.throughDate)
    .sort((left, right) => left.date.localeCompare(right.date) || left.province.localeCompare(right.province));
  const targets = all.filter((draw) => draw.province === options.province).slice(-options.testDraws);
  const days: MienTrungSpecialLast3BacktestDay[] = [];

  for (const actual of targets) {
    const fromDate = shiftDate(actual.date, -options.historyDays);
    const history = all.filter((draw) => draw.date >= fromDate && draw.date < actual.date);
    const prediction = predictFromDraws(history, options.province, actual.date);
    if (!prediction) continue;
    days.push({
      date: actual.date,
      province: options.province,
      predicted: prediction.number,
      actual: actual.last3,
      hit: prediction.number === actual.last3,
      score: prediction.score,
      provinceDraws: prediction.provinceDraws,
      regionalDraws: prediction.regionalDraws,
    });
  }
  if (days.length === 0) return undefined;

  const hits = days.filter((day) => day.hit).length;
  const hitRate = hits / days.length;
  return {
    province: options.province,
    evaluatedDraws: days.length,
    hits,
    hitRate: percent(hitRate),
    randomBaselineHitRate: percent(SPECIAL_LAST3_RANDOM_BASELINE_RATE),
    randomBaselineExpectedHits: (days.length * SPECIAL_LAST3_RANDOM_BASELINE_RATE).toFixed(3),
    liftVsRandom: `${(hitRate / SPECIAL_LAST3_RANDOM_BASELINE_RATE).toFixed(2)}x`,
    days,
  };
}

type ExactMap = Record<string, number>;
type DigitMatrix = number[][];
type TransitionMatrix = number[][][];

function exactProbabilities(draws: SpecialLast3Draw[]): ExactMap {
  const counts: ExactMap = {};
  for (const draw of draws) counts[draw.last3] = (counts[draw.last3] ?? 0) + 1;
  const denominator = draws.length + EXACT_ALPHA * CANDIDATES.length;
  return Object.fromEntries(CANDIDATES.map((number) => [number, ((counts[number] ?? 0) + EXACT_ALPHA) / denominator]));
}

function hierarchicalExactProbabilities(draws: SpecialLast3Draw[], prior: ExactMap): ExactMap {
  const counts: ExactMap = {};
  for (const draw of draws) counts[draw.last3] = (counts[draw.last3] ?? 0) + 1;
  const denominator = draws.length + PROVINCE_PRIOR_STRENGTH;
  return Object.fromEntries(CANDIDATES.map((number) => [
    number,
    ((counts[number] ?? 0) + PROVINCE_PRIOR_STRENGTH * prior[number]) / denominator,
  ]));
}

function digitProbabilities(draws: SpecialLast3Draw[]): DigitMatrix {
  const counts = Array.from({ length: 3 }, () => Array(10).fill(DIGIT_ALPHA) as number[]);
  for (const draw of draws) {
    for (let position = 0; position < 3; position += 1) counts[position][Number(draw.last3[position])] += 1;
  }
  return counts.map((positionCounts) => {
    const total = positionCounts.reduce((sum, count) => sum + count, 0);
    return positionCounts.map((count) => count / total);
  });
}

function hierarchicalDigitProbabilities(draws: SpecialLast3Draw[], prior: DigitMatrix): DigitMatrix {
  const counts = Array.from({ length: 3 }, () => Array(10).fill(0) as number[]);
  for (const draw of draws) {
    for (let position = 0; position < 3; position += 1) counts[position][Number(draw.last3[position])] += 1;
  }
  return counts.map((positionCounts, position) => positionCounts.map((count, digit) =>
    (count + PROVINCE_PRIOR_STRENGTH * prior[position][digit]) / (draws.length + PROVINCE_PRIOR_STRENGTH)));
}

function transitionProbabilities(draws: SpecialLast3Draw[]): TransitionMatrix {
  const counts = Array.from({ length: 3 }, () =>
    Array.from({ length: 10 }, () => Array(10).fill(DIGIT_ALPHA) as number[]));
  const byProvince = new Map<string, SpecialLast3Draw[]>();
  for (const draw of draws) {
    const rows = byProvince.get(draw.province) ?? [];
    rows.push(draw);
    byProvince.set(draw.province, rows);
  }
  for (const rows of byProvince.values()) {
    rows.sort((left, right) => left.date.localeCompare(right.date));
    for (let index = 1; index < rows.length; index += 1) {
      for (let position = 0; position < 3; position += 1) {
        counts[position][Number(rows[index - 1].last3[position])][Number(rows[index].last3[position])] += 1;
      }
    }
  }
  return normalizeTransitions(counts);
}

function hierarchicalTransitionProbabilities(draws: SpecialLast3Draw[], prior: TransitionMatrix): TransitionMatrix {
  const counts = Array.from({ length: 3 }, () =>
    Array.from({ length: 10 }, () => Array(10).fill(0) as number[]));
  const rows = [...draws].sort((left, right) => left.date.localeCompare(right.date));
  for (let index = 1; index < rows.length; index += 1) {
    for (let position = 0; position < 3; position += 1) {
      counts[position][Number(rows[index - 1].last3[position])][Number(rows[index].last3[position])] += 1;
    }
  }
  return counts.map((positionRows, position) => positionRows.map((nextCounts, previousDigit) => {
    const total = nextCounts.reduce((sum, count) => sum + count, 0) + TRANSITION_PRIOR_STRENGTH;
    return nextCounts.map((count, nextDigit) =>
      (count + TRANSITION_PRIOR_STRENGTH * prior[position][previousDigit][nextDigit]) / total);
  }));
}

function normalizeTransitions(counts: TransitionMatrix): TransitionMatrix {
  return counts.map((positionRows) => positionRows.map((nextCounts) => {
    const total = nextCounts.reduce((sum, count) => sum + count, 0);
    return nextCounts.map((count) => count / total);
  }));
}

function digitLikelihood(number: string, probabilities: DigitMatrix): number {
  return probabilities.reduce((product, position, index) => product * position[Number(number[index])], 1);
}

function transitionLikelihood(number: string, previous: string, probabilities: TransitionMatrix): number {
  return probabilities.reduce((product, position, index) =>
    product * position[Number(previous[index])][Number(number[index])], 1);
}

function normalize(value: number, maximum: number): number {
  return maximum > 0 ? value / maximum : 0;
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function format(value: number): string {
  return value.toFixed(6);
}

function percent(value: number): string {
  return `${(value * 100).toFixed(3)}%`;
}
