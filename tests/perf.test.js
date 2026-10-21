import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerfMeter } from '../src/core/perf.js';

test('reports frames per second once per period', () => {
  const m = new PerfMeter(1000);
  let ready = 0;
  // 60 frames a second for 3 seconds.
  for (let t = 0; t <= 3000; t += 1000 / 60) {
    m.tick();
    if (m.update(t)) ready++;
  }
  assert.ok(ready >= 2 && ready <= 3, `got ${ready} readings`);
  assert.ok(Math.abs(m.rate - 60) < 2, `rate ${m.rate}`);
});

test('averages the time per event', () => {
  const m = new PerfMeter(1000);
  m.update(0);
  m.tick(10); m.tick(20); m.tick(30);
  assert.equal(m.update(1000), true);
  assert.equal(m.rate, 3);
  assert.equal(m.avgMs, 20);
});

test('no events gives a rate of 0 and no average', () => {
  const m = new PerfMeter(1000);
  m.update(0);
  assert.equal(m.update(1500), true);
  assert.equal(m.rate, 0);
  assert.equal(m.avgMs, null);
});

test('nothing is reported before a full period has passed', () => {
  const m = new PerfMeter(1000);
  m.update(0); m.tick();
  assert.equal(m.update(999), false);
});
