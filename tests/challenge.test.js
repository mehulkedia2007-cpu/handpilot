import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEST_KEY, createChallenge, formatTime, loadBest, saveBest, isNewBest } from '../src/core/challenge.js';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, map: m };
}
const brokenStorage = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); } };

test('the full loop: ready -> running -> won, with the time frozen at the win', () => {
  const c = createChallenge();
  assert.equal(c.state, 'ready');
  assert.equal(c.elapsed(5000), 0);
  assert.equal(c.update(5000, true), false);   // a tower before Start doesn't count
  c.start(1000);
  assert.equal(c.state, 'running');
  assert.equal(c.elapsed(4000), 3000);
  assert.equal(c.update(4000, false), false);
  assert.equal(c.update(13500, true), true);
  assert.equal(c.state, 'won');
  assert.equal(c.time, 12500);
  assert.equal(c.elapsed(99999), 12500);
  assert.equal(c.update(14000, true), false);  // only reports the win once
});

test('restart and reset', () => {
  const c = createChallenge();
  c.start(0); c.update(5000, true);
  c.start(10000);
  assert.equal(c.state, 'running'); assert.equal(c.time, null); assert.equal(c.elapsed(11000), 1000);
  c.reset();
  assert.equal(c.state, 'ready'); assert.equal(c.elapsed(20000), 0);
});

test('times are shown as m:ss.t', () => {
  assert.equal(formatTime(0), '0:00.0');
  assert.equal(formatTime(12345), '0:12.3');
  assert.equal(formatTime(61999), '1:01.9');
  assert.equal(formatTime(-5), '0:00.0');
  assert.equal(formatTime(NaN), '0:00.0');
});

test('the best time persists, and only a faster time beats it', () => {
  const store = fakeStorage();
  assert.equal(loadBest(store), null);
  assert.equal(isNewBest(20000, null), true);
  assert.equal(saveBest(store, 20000), true);
  assert.equal(loadBest(store), 20000);
  assert.equal(isNewBest(25000, 20000), false);
  assert.equal(isNewBest(15000, 20000), true);
  assert.equal(isNewBest(0, null), false);
});

test('bad or blocked storage never throws and gives no best time', () => {
  for (const bad of ['nope', '{"best":-3}', '{"best":"fast"}', 'null', '{}']) {
    const store = fakeStorage(); store.map.set(BEST_KEY, bad);
    assert.equal(loadBest(store), null, bad);
  }
  assert.equal(loadBest(brokenStorage), null);
  assert.equal(loadBest(null), null);
  assert.equal(saveBest(brokenStorage, 1000), false);
});
