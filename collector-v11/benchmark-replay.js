'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const E = require('./engine.js');

const BASE = Date.parse('2026-11-01T00:00:00.000Z');
const SIZES = [100, 1000, 10000];

function makeEvents(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `replay-benchmark-${index}`,
    type: 'event.note',
    timestamp: new Date(BASE + index).toISOString(),
    status: 'committed',
    operations: [{
      operation: 'event.note',
      data: { description: `synthetic event ${index}` }
    }]
  }));
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const results = [];
for (const count of SIZES) {
  const events = makeEvents(count);
  const samplesMs = [];
  const iterations = count >= 10000 ? 3 : 5;

  // One unmeasured warm-up reduces first-call/JIT noise.
  E.replay(events);

  for (let iteration = 0; iteration < iterations; iteration++) {
    const started = performance.now();
    const replayed = E.replay(events);
    const elapsed = performance.now() - started;
    assert.equal(replayed.events.length, count);
    assert.deepEqual(replayed.meta.replayWarnings || [], []);
    samplesMs.push(Number(elapsed.toFixed(3)));
  }

  const medianMs = median(samplesMs);
  results.push({
    events: count,
    iterations,
    medianMs: Number(medianMs.toFixed(3)),
    eventsPerSecond: Math.round(count / (medianMs / 1000)),
    samplesMs
  });
}

const report = {
  benchmark: 'Collector Core Replay',
  schemaVersion: 7,
  node: process.version,
  measuredAt: new Date().toISOString(),
  methodology: 'synthetic committed event.note records; one warm-up; median of repeated runs; no absolute pass/fail threshold',
  results
};
const json = JSON.stringify(report, null, 2);
console.log(json);

const outputPath = path.join(__dirname, 'test-results', 'replay-benchmark.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, json + '\n', 'utf8');
