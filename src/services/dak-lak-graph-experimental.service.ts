export const DAK_LAK_GRAPH_MODEL_VERSION = 'dak-lak-last2-graph-degree26-v1-experimental';
export const DAK_LAK_GRAPH_FORMULA = 'score = sum of recency-weighted co-occurrence edges over the latest 26 completed Dak Lak draws; edge weight per draw = 0.96^drawsAgo';
export const DAK_LAK_GRAPH_HISTORY_DRAWS = 26;
export const DAK_LAK_GRAPH_SHORT_HISTORY_DRAWS = 13;
export const DAK_LAK_GRAPH_DECAY = 0.96;
export const DAK_LAK_GRAPH_STRONG_CONSENSUS = 4;

export interface DakLakGraphDraw { date: string; values: Set<string> }
export interface DakLakGraphPredictionRow { rank: number; number: string; score: string; degree: string; appearances: number }
export interface DakLakGraphSignal {
  level: 'STRONG' | 'SKIP';
  consensusCount: number;
  consensusNumbers: string[];
  shortWindowRows: DakLakGraphPredictionRow[];
  longWindowRows: DakLakGraphPredictionRow[];
  conclusion: string;
}

export function buildDakLakGraphDraws(rows: Array<{ date: string; last2: string }>): DakLakGraphDraw[] {
  const grouped = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.last2) continue;
    const values = grouped.get(row.date) ?? new Set<string>();
    values.add(row.last2);
    grouped.set(row.date, values);
  }
  return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, values]) => ({ date, values }));
}

export function predictDakLakGraph(history: DakLakGraphDraw[], targetDate: string, top = 5): DakLakGraphPredictionRow[] {
  return predictDakLakGraphWindow(history, targetDate, DAK_LAK_GRAPH_HISTORY_DRAWS, top);
}

export function predictDakLakGraphWindow(history: DakLakGraphDraw[], targetDate: string, historyDraws: number,
  top = 5): DakLakGraphPredictionRow[] {
  const draws = history.filter((draw) => draw.date < targetDate).slice(-historyDraws);
  if (draws.length === 0) return [];
  const adjacency = Array.from({ length: 100 }, () => Array(100).fill(0) as number[]);
  const appearances = Array(100).fill(0) as number[];
  draws.forEach((draw, index) => {
    const values = [...draw.values].map(Number);
    const weight = DAK_LAK_GRAPH_DECAY ** (draws.length - index - 1);
    for (const value of values) appearances[value] += 1;
    for (let left = 0; left < values.length; left += 1) for (let right = left + 1; right < values.length; right += 1) {
      adjacency[values[left]][values[right]] += weight;
      adjacency[values[right]][values[left]] += weight;
    }
  });
  return Array.from({ length: 100 }, (_, value) => ({
    number: String(value).padStart(2, '0'), degree: adjacency[value].reduce((sum, edge) => sum + edge, 0), appearances: appearances[value],
  })).sort((left, right) => right.degree - left.degree || left.number.localeCompare(right.number)).slice(0, top)
    .map((row, index) => ({ rank: index + 1, number: row.number, score: row.degree.toFixed(6),
      degree: row.degree.toFixed(6), appearances: row.appearances }));
}

export function buildDakLakGraphSignal(history: DakLakGraphDraw[], targetDate: string): DakLakGraphSignal {
  const shortWindowRows = predictDakLakGraphWindow(history, targetDate, DAK_LAK_GRAPH_SHORT_HISTORY_DRAWS, 5);
  const longWindowRows = predictDakLakGraphWindow(history, targetDate, DAK_LAK_GRAPH_HISTORY_DRAWS, 5);
  const shortNumbers = new Set(shortWindowRows.map((row) => row.number));
  const consensusNumbers = longWindowRows.map((row) => row.number).filter((number) => shortNumbers.has(number));
  const level = consensusNumbers.length >= DAK_LAK_GRAPH_STRONG_CONSENSUS ? 'STRONG' : 'SKIP';
  return {
    level,
    consensusCount: consensusNumbers.length,
    consensusNumbers,
    shortWindowRows,
    longWindowRows,
    conclusion: level === 'STRONG'
      ? 'Experimental signal qualifies because the 13-draw and 26-draw Top 5 share at least 4 numbers.'
      : 'Experimental signal does not qualify; reference status is SKIP for this draw.',
  };
}
