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
      { operation: 'entity.create', target: 'benchmark-location', data: { name: 'Synthetic location', type: 'location' } },
      { operation: 'entity.create', target: 'benchmark-item', data: { name: 'Synthetic parent item', type: 'plant' } },
      { operation: 'attribute.define', data: {
        id: 'benchmark-ph-definition',
        name: 'pH',
        ownerType: 'entity',
        type: 'number',
        role: 'measurement',
        nature: 'dynamic',
        historyEnabled: true
      } },
      { operation: 'relation.create', data: {
        id: 'benchmark-parent-relation',
        sourceId: 'benchmark-item',
        targetId: 'benchmark-population',
        type: 'related_to'
      } }
    ]
  }];

  let lastAttributeEventId = null;
  let expectedStockAdds = 0;
  let expectedSpecimens = 0;
  let expectedFinanceRecords = 0;
  let expectedAttributeWrites = 0;
  let expectedRelationAttributeWrites = 0;

  for (let index = 1; index < count; index++) {
    const timestamp = new Date(BASE + index).toISOString();
    const eventId = `benchmark-event-${index}`;
    let operations;

    switch (index % 8) {
      case 0:
        expectedStockAdds++;
        operations = [{
          operation: 'stock.change',
          data: {
            populationId: 'benchmark-population',
            locationId: 'benchmark-location',
            quantity: 1,
            action: 'add',
            disposition: 'active'
          }
        }];
        break;
      case 1:
      case 7:
        operations = [{ operation: 'event.note', data: { description: `synthetic note ${index}` } }];
        break;
      case 2:
        expectedAttributeWrites++;
        lastAttributeEventId = eventId;
        operations = [{
          operation: 'attribute.set',
          target: 'benchmark-item',
          data: {
            name: 'pH',
            value: Number((5.5 + (index % 10) / 10).toFixed(1)),
            forceHistory: true
          }
        }];
        break;
      case 3:
        expectedRelationAttributeWrites++;
        operations = [{
          operation: 'relation.attribute.set',
          data: {
            relationId: 'benchmark-parent-relation',
            name: 'qualityIndex',
            value: index
          }
        }];
        break;
      case 4: {
        expectedSpecimens++;
        const specimenId = `benchmark-specimen-${index}`;
        operations = [
          { operation: 'entity.create', target: specimenId, data: { name: specimenId, type: 'specimen' } },
          { operation: 'relation.create', data: {
            sourceId: 'benchmark-item',
            targetId: specimenId,
            type: 'related_to'
          } }
        ];
        break;
      }
      case 5:
        operations = lastAttributeEventId ? [{
          operation: 'attribute.correct',
          target: 'benchmark-item',
          data: {
            name: 'pH',
            value: Number((5.5 + (Number(lastAttributeEventId.split('-').at(-1)) % 10) / 10).toFixed(1)),
            correctsEventId: lastAttributeEventId
          }
        }] : [{ operation: 'event.note', data: { description: `correction seed ${index}` } }];
        break;
      case 6:
        expectedFinanceRecords++;
        operations = [{
          operation: 'finance.record',
          data: {
            entityId: 'benchmark-item',
            kind: 'cost',
            amount: index + 1,
            currency: 'RON',
            description: `synthetic cost ${index}`
          }
        }];
        break;
      default:
        throw new Error(`Unhandled benchmark pattern for index ${index}`);
    }

    events.push({
      id: eventId,
      type: 'benchmark.mixed',
      timestamp,
      status: 'committed',
      operations
    });
  }

  return {
    events,
    expected: {
      stockAdds: expectedStockAdds,
      specimens: expectedSpecimens,
      financeRecords: expectedFinanceRecords,
      attributeWrites: expectedAttributeWrites,
      relationAttributeWrites: expectedRelationAttributeWrites
    }
  };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const results = [];
for (const count of SIZES) {
  const { events, expected } = makeEvents(count);
  const samples = [];
  const iterations = count >= 10000 ? 3 : 5;

  E.replay(events); // warm-up

  for (let iteration = 0; iteration < iterations; iteration++) {
    const started = performance.now();
    const replayed = E.replay(events);
    const elapsed = performance.now() - started;
    const memory = process.memoryUsage();

    assert.equal(replayed.events.length, count);
    assert.deepEqual(replayed.meta.replayWarnings || [], []);
    assert.equal(replayed.entities.length, 3 + expected.specimens);
    assert.equal(replayed.relations.length, 1 + expected.specimens);
    assert.equal(replayed.finance.length, expected.financeRecords);
    assert.equal(replayed.attributes.find(attribute => attribute.name === 'pH')?.type, 'number');

    const activeQuantity = E.balances(replayed)
      .filter(row => row.populationId === 'benchmark-population' && row.disposition === 'active')
      .reduce((sum, row) => sum + row.quantity, 0);
    assert.equal(activeQuantity, expected.stockAdds);

    const parent = replayed.entities.find(entity => entity.id === 'benchmark-item');
    assert.equal(parent.attributeHistory.pH.length, expected.attributeWrites);
    assert.equal(replayed.relations[0].attributeHistory.qualityIndex.length, expected.relationAttributeWrites);

    samples.push({
      elapsedMs: Number(elapsed.toFixed(3)),
      heapUsedBytes: memory.heapUsed,
      rssBytes: memory.rss
    });
  }

  const medianMs = median(samples.map(sample => sample.elapsedMs));
  results.push({
    events: count,
    iterations,
    expected,
    medianMs: Number(medianMs.toFixed(3)),
    eventsPerSecond: Math.round(count / (medianMs / 1000)),
    medianHeapUsedBytes: median(samples.map(sample => sample.heapUsedBytes)),
    medianRssBytes: median(samples.map(sample => sample.rssBytes)),
    samples
  });
}

const report = {
  benchmark: 'Collector Core Replay — mixed create, attribute, relation, correction, stock and finance events',
  schemaVersion: 7,
  node: process.version,
  platform: os.platform(),
  arch: os.arch(),
  cpu: os.cpus()[0]?.model || 'unknown',
  measuredAt: new Date().toISOString(),
  methodology: 'deterministic eight-operation mix; entity creation, pH measurements and corrections, relation attributes, relation creation, stock adds, finance records and notes; one warm-up; median of repeated runs; every run asserts journal integrity and domain projections; heap/RSS are sampled after Replay without forced GC; no absolute pass/fail threshold',
  results
};
const json = JSON.stringify(report, null, 2);
console.log(json);

const outputPath = path.join(__dirname, 'test-results', 'replay-benchmark.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, json + '\n', 'utf8');
