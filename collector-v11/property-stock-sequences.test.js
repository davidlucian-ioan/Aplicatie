// Property-based tests for stock invariants and event replay.
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fc = require('fast-check');
const E = require('./engine.js');

const BASE_TIME = Date.parse('2026-01-01T00:00:00.000Z');
const LOCATION_A = 'location-b1';
const LOCATION_B = 'location-b2';
const POPULATION = 'population-fancy';

function makeEvent(id, index, operations, intentKey = id) {
  return {
    id,
    type: 'property.stock.sequence',
    timestamp: new Date(BASE_TIME + index * 1000).toISOString(),
    intentKey,
    operations
  };
}

function makeFixture() {
  const initial = E.emptyState();
  const result = E.commit(initial, makeEvent('fixture', 0, [
    { operation: 'entity.create', target: LOCATION_A, data: { name: 'B1', type: 'location' } },
    { operation: 'entity.create', target: LOCATION_B, data: { name: 'B2', type: 'location' } },
    { operation: 'entity.create', target: POPULATION, data: { name: 'Fancy', type: 'population' } },
    { operation: 'relation.create', data: { sourceId: POPULATION, targetId: LOCATION_A, type: 'located_in' } },
    { operation: 'stock.change', data: {
      populationId: POPULATION,
      locationId: LOCATION_A,
      quantity: 12,
      action: 'add',
      disposition: 'active'
    } }
  ]));
  return result.db;
}

function balanceAt(db, locationId, disposition = 'active') {
  return E.balances(db).find(row =>
    row.populationId === POPULATION &&
    row.locationId === locationId &&
    row.disposition === disposition
  )?.quantity ?? 0;
}

function normalizedBalances(db) {
  return E.balances(db)
    .map(({ populationId, locationId, disposition, quantity }) => ({
      populationId, locationId, disposition, quantity
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

const commandSequence = fc.array(
  fc.record({
    kind: fc.constantFrom('add', 'sell', 'move'),
    quantity: fc.integer({ min: 1, max: 12 }),
    source: fc.constantFrom('B1', 'B2'),
    location: fc.constantFrom('B1', 'B2')
  }),
  { minLength: 1, maxLength: 70 }
);

test('secvențele generate păstrează soldurile, atomicitatea și echivalența Replay', () => {
  const numRuns = Number(process.env.FC_NUM_RUNS || 250);
  const seed = process.env.FC_SEED === undefined ? undefined : Number(process.env.FC_SEED);
  const options = { numRuns, verbose: 2 };
  if (Number.isInteger(seed)) options.seed = seed;
  if (process.env.FC_PATH) options.path = process.env.FC_PATH;

  fc.assert(fc.property(commandSequence, commands => {
    let db = makeFixture();
    const model = { B1: 12, B2: 0 };
    let accepted = 0;

    commands.forEach((command, index) => {
      const sourceId = command.source === 'B1' ? LOCATION_A : LOCATION_B;
      const destinationName = command.source === 'B1' ? 'B2' : 'B1';
      const destinationId = destinationName === 'B1' ? LOCATION_A : LOCATION_B;
      let data;

      if (command.kind === 'add') {
        const locationId = command.location === 'B1' ? LOCATION_A : LOCATION_B;
        data = {
          populationId: POPULATION,
          locationId,
          quantity: command.quantity,
          action: 'add',
          disposition: 'active'
        };
      } else if (command.kind === 'sell') {
        data = {
          populationId: POPULATION,
          locationId: sourceId,
          quantity: command.quantity,
          action: 'sell',
          disposition: 'sold'
        };
      } else {
        data = {
          populationId: POPULATION,
          locationId: sourceId,
          destinationId,
          quantity: command.quantity,
          action: 'move_out'
        };
      }

      const event = makeEvent(
        `generated-${index}`,
        index + 1,
        [{ operation: 'stock.change', data }],
        `generated-intent-${index}`
      );

      const sourceName = command.kind === 'add' ? command.location : command.source;
      const available = model[sourceName];

      if (command.kind !== 'add' && command.quantity > available) {
        const before = JSON.stringify(db);
        assert.throws(
          () => E.commit(db, event),
          /Cantitate insuficientă/
        );
        assert.equal(JSON.stringify(db), before, 'o operație respinsă nu trebuie să modifice starea inițială');
      } else {
        const result = E.commit(db, event);
        assert.equal(result.duplicate, false);
        db = result.db;
        accepted++;

        if (command.kind === 'add') {
          model[command.location] += command.quantity;
        } else if (command.kind === 'sell') {
          model[command.source] -= command.quantity;
        } else {
          model[command.source] -= command.quantity;
          model[destinationName] += command.quantity;
        }
      }

      assert.equal(balanceAt(db, LOCATION_A), model.B1, 'sold B1 diferit de model');
      assert.equal(balanceAt(db, LOCATION_B), model.B2, 'sold B2 diferit de model');
      assert.ok(model.B1 >= 0 && model.B2 >= 0, 'soldul activ nu poate fi negativ');

      const activeTotal = balanceAt(db, LOCATION_A) + balanceAt(db, LOCATION_B);
      assert.equal(activeTotal, model.B1 + model.B2, 'totalul activ trebuie să fie conservat la mutare');

      const replayed = E.replay(db.events, db.attributes);
      assert.deepEqual(replayed.meta.replayWarnings || [], [], 'Replay nu trebuie să producă avertismente');
      assert.deepEqual(normalizedBalances(replayed), normalizedBalances(db), 'Replay trebuie să reconstruiască soldurile');
    });

    const imported = E.validateImport(db);
    assert.deepEqual(normalizedBalances(imported), normalizedBalances(db), 'export/import logic trebuie să păstreze soldurile');
    assert.equal(db.events.length, accepted + 1, 'jurnalul trebuie să conțină fixture-ul și numai evenimentele acceptate');
  }), options);
});

test('repetarea aceleiași intenții nu dublează efectul de stoc', () => {
  const db = makeFixture();
  const event = makeEvent('idempotent-first', 1, [{
    operation: 'stock.change',
    data: {
      populationId: POPULATION,
      locationId: LOCATION_A,
      quantity: 4,
      action: 'add',
      disposition: 'active'
    }
  }], 'same-user-intent');

  const first = E.commit(db, event);
  const retry = E.commit(first.db, {
    ...event,
    id: 'idempotent-retry',
    timestamp: new Date(BASE_TIME + 2000).toISOString()
  });

  assert.equal(retry.duplicate, true);
  assert.equal(retry.db.events.length, first.db.events.length);
  assert.equal(balanceAt(retry.db, LOCATION_A), 16);
  assert.deepEqual(normalizedBalances(retry.db), normalizedBalances(first.db));
});
