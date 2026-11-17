import assert from 'node:assert/strict';
import { buildMienBacTransitionPlayFilter } from '../services/mien-bac-transition-matrix.service';

assert.equal(buildMienBacTransitionPlayFilter(0.95, 0.48, 0.33).status, 'PLAY');
assert.equal(buildMienBacTransitionPlayFilter(0.94, 0.48, 0.33).status, 'SKIP');
assert.equal(buildMienBacTransitionPlayFilter(0.95, 0.47, 0.33).status, 'SKIP');
assert.equal(buildMienBacTransitionPlayFilter(0.95, 0.48, 0.330001).status, 'SKIP');
console.log('Mien Bac transition PLAY filter tests passed.');
