'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const E = require('./engine.js');

const BASE = Date.parse('2026-11-01T00:00:00.000Z');
const SIZES = [100, 1000, 10000, 50000];

function makeEvents(count) {
  const events = [{
    id: 'benchmark-setup',
    type: 'benchmark.setup',
    timestamp: new Date(BASE).toISOString(),
    status: 'committed',
    operations: [
      { operation: 'entity.create', target: 'benchmark-population', data: { name: 'Synthetic population', type: 'population' } },
      { operation: 'entity.create', target: 'benchmark-location', data: { name: 'Synthetic location', type: 'location' } },
      { operation: 'entity.create', target: 'benchmark-item', data: { name: 'Synthetic item', type: 'generic' } },
      { operation: 'attribute.define', data: { name: 'benchmark_quality', type: 'number', ownerType: 'entity' } },
      { operation: 'relation.create', data: { id: 'benchmark-relation', sourceId: 'benchmark-population', targetId: 'benchmark-item', type: 'related_to' } },
      { operation: 'stock.change', data: { populationId: 'benchmark-population', locationId: 'benchmark-location', quantity: 1, action: 'add', disposition: 'active' } }
    ]
  }];

  const types = ['event.note', 'stock.change', 'finance.record', 'attribute.set', 'relation.attribute.set', 'entity.rename'];
  const expected = { stockAdds: 0, financeRecords: 0, attributeValue: undefined, relationValue: undefined, entityName: 'Synthetic item' };

  for (let index = 1; index < count; index++) {
    const timestamp = new Date(BASE + index).toISOString();
    const type = types[(index - 1) % types.length];
    let operation;

    switch (type) {
      case 'event.note':
        operation = { operation: type, data: { description: 'synthetic event ' + index } };
        break;
      case 'stock.change':
        expected.stockAdds++;
        operation = { operation: type, data: { populationId: 'benchmark-population', locationId: 'benchmark-location', quantity: 1, action: 'add', disposition: 'active' } };
        break;
      case 'finance.record':
        expected.financeRecords++;
        operation = { operation: type, data: { entityId: 'benchmark-item', kind: 'cost', amount: 1, currency: 'RON', description: 'synthetic cost ' + index } };
        break;
      case 'attribute.set':
        expected.attributeValue = index;
        operation = { operation: type, target: 'benchmark-item', data: { name: 'benchmark_quality', value: index } };
        break;
      case 'relation.attribute.set':
        expected.relationValue = index;
        operation = { operation: type, data: { relationId: 'benchmark-relation', name: 'benchmark_score', value: index } };
        break;
      case 'entity.rename':
        expected.entityName = 'Synthetic item ' + index;
        operation = { operation: type, target: 'benchmark-item', data: { name: 'Synthetic item ' + index } };
        break;
      default:
        throw new Error('Unsupported benchmark operation: ' + type);
    }

    events.push({
      id: 'benchmark-' + index,
      type: 'benchmark.' + type,
      timestamp,
      status: 'committed',
      operations: [operation]
    });
  }

  return { events, expected };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const results = [];
for (const count of SIZES) {
  const { events, expected } = makeEvents(count);
  const samplesMs = [];
  const heapSamplesBytes = [];
  const iterations = count >= 50000 ? 2 : count >= 10000 ? 3 : 5;

  E.replay(events); // warm-up

  for (let iteration = 0; iteration < iterations; iteration++) {
    const heapBefore = process.memoryUsage().heapUsed;
    const started = performance.now();
    const replayed = E.replay(events);
    const elapsed = performance.now() - started;
    const heapAfter = process.memoryUsage().heapUsed;

    assert.equal(replayed.events.length, count);
    assert.deepEqual(replayed.meta.replayWarnings || [], []);
    const activeQuantity = E.balances(replayed)
      .filter(row => row.populationId === 'benchmark-population' && row.disposition === 'active')
      .reduce((sum, row) => sum + row.quantity, 0);
    assert.equal(activeQuantity, 1 + expected.stockAdds);
    assert.equal(E.totalFinance(replayed)['RON|cost'] || 0, expected.financeRecords);
    const entity = replayed.entities.find(row => row.id === 'benchmark-item');
    assert.equal(entity.attributes.benchmark_quality, expected.attributeValue);
    assert.equal(entity.name, expected.entityName);
    assert.equal(replayed.relations.find(row => row.id === 'benchmark-relation').attributes.benchmark_score, expected.relationValue);

    samplesMs.push(Number(elapsed.toFixed(3)));
    heapSamplesBytes.push(Math.max(0, heapAfter - heapBefore));
  }

  const medianMs = median(samplesMs);
  results.push({
    events: count,
    iterations,
    medianMs: Number(medianMs.toFixed(3)),
    eventsPerSecond: Math.round(count / (medianMs / 1000)),
    medianHeapDeltaBytes: median(heapSamplesBytes),
    samplesMs,
    heapSamplesBytes
  });
}

const report = {
  benchmark: 'Collector Core Replay — mixed entity, attribute, relation, stock, finance and note events',
  schemaVersion: 7,
  node: process.version,
  platform: os.platform(),
  arch: os.arch(),
  cpu: os.cpus()[0]?.model || 'unknown',
  measuredAt: new Date().toISOString(),
  methodology: 'synthetic setup + six evenly distributed operation types; one warm-up; median of repeated runs; assertions verify projection totals and replay integrity; heap delta is an indicative process measurement, not a GC-normalized allocation metric; no absolute pass/fail threshold',
  operationMix: ['event.note', 'stock.change', 'finance.record', 'attribute.set', 'relation.attribute.set', 'entity.rename'],
  results
};
const json = JSON.stringify(report, null, 2);
console.log(json);

const outputPath = path.join(__dirname, 'test-results', 'replay-benchmark.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, json + '\n', 'utf8');
