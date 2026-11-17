import assert from 'node:assert/strict';
import { buildDakLakGraphDraws, buildDakLakGraphSignal, predictDakLakGraph } from '../services/dak-lak-graph-experimental.service';

const draws = buildDakLakGraphDraws([
  { date: '2026-01-01', last2: '01' }, { date: '2026-01-01', last2: '02' },
  { date: '2026-01-08', last2: '01' }, { date: '2026-01-08', last2: '02' },
  { date: '2026-01-15', last2: '01' }, { date: '2026-01-15', last2: '03' },
]);
assert.equal(draws.length, 3);
assert.deepEqual([...draws[0].values].sort(), ['01', '02']);
const prediction = predictDakLakGraph(draws, '2026-01-22', 3);
assert.equal(prediction[0].number, '01');
assert.ok(prediction.some((row) => row.number === '02'));
assert.ok(prediction.some((row) => row.number === '03'));
assert.ok(Number(prediction[0].degree) > Number(prediction[1].degree));
const signal = buildDakLakGraphSignal(draws, '2026-01-22');
assert.equal(signal.longWindowRows.length, 5);
assert.equal(signal.shortWindowRows.length, 5);
assert.equal(signal.consensusCount, 5);
assert.equal(signal.level, 'STRONG');
console.log('Dak Lak graph-degree tests passed.');
