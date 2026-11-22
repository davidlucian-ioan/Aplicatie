'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const E = require('./engine.js');

const BASE = Date.parse('2026-11-01T00:00:00.000Z');
const SIZES = [100, 1000, 10000];

function makeEvents(count) {
  const events = [{
    id: 'benchmark-setup',
    type: 'benchmark.setup',
    timestamp: new Date(BASE).toISOString(),
    status: 'committed',
    operations: [
      { operation: 'entity.create', target: 'benchmark-population', data: { name: 'Synthetic population', type: 'population' } },
      { operation: 'entity.create', target: 'benchmark-location', data: { name: 'Synthetic location', type: 'location' } }
    ]
  }];

  for (let index = 1; index < count; index++) {
    const timestamp = new Date(BASE + index).toISOString();
    if (index % 4 === 0) {
      events.push({
        id: `benchmark-stock-${index}`,
        type: 'benchmark.stock',
        timestamp,
        status: 'committed',
        operations: [{
          operation: 'stock.change',
          data: {
            populationId: 'benchmark-population',
            locationId: 'benchmark-location',
            quantity: 1,
            action: 'add',
            disposition: 'active'
          }
        }]
      });
    } else {
      events.push({
        id: `benchmark-note-${index}`,
        type: 'benchmark.note',
        timestamp,
        status: 'committed',
        operations: [{
          operation: 'event.note',
          data: { description: `synthetic event ${index}` }
        }]
      });
    }
  }
  return events;
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

  E.replay(events); // warm-up

  for (let iteration = 0; iteration < iterations; iteration++) {
    const started = performance.now();
    const replayed = E.replay(events);
    const elapsed = performance.now() - started;
    assert.equal(replayed.events.length, count);
    assert.deepEqual(replayed.meta.replayWarnings || [], []);
    const activeQuantity = E.balances(replayed)
      .filter(row => row.populationId === 'benchmark-population' && row.disposition === 'active')
      .reduce((sum, row) => sum + row.quantity, 0);
    assert.equal(activeQuantity, Math.floor((count - 1) / 4));
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
  benchmark: 'Collector Core Replay — mixed entity, note and stock events',
  schemaVersion: 7,
  node: process.version,
  platform: os.platform(),
  arch: os.arch(),
  cpu: os.cpus()[0]?.model || 'unknown',
  measuredAt: new Date().toISOString(),
  methodology: 'synthetic setup + 75% event.note + 25% stock.add; one warm-up; median of repeated runs; assertions verify replay integrity and expected stock; no absolute pass/fail threshold',
  results
};
const json = JSON.stringify(report, null, 2);
console.log(json);

const outputPath = path.join(__dirname, 'test-results', 'replay-benchmark.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, json + '\n', 'utf8');
