'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fc = require('fast-check');
const E = require('./engine.js');

const T0 = '2026-11-01T10:00:00.000Z';
const T1 = '2026-11-01T11:00:00.000Z';
const T2 = '2026-11-01T12:00:00.000Z';

function propertyOptions(defaultRuns) {
  const seed = Number(process.env.FC_SEED ?? 20261122);
  const options = {
    numRuns: Number(process.env.FC_NUM_RUNS || defaultRuns),
    seed
  };
  if (process.env.FC_PATH) options.path = process.env.FC_PATH;
  return options;
}

function commit(db, id, timestamp, operations, extra = {}) {
  return E.commit(db, {
    id,
    timestamp,
    type: extra.type || 'test.event',
    source: 'test',
    actor: 'phase2',
    operations,
    ...extra
  });
}

function setupBase() {
  const db = E.emptyState();
  const entities = {
    pop: 'phase2-population',
    member: 'phase2-member',
    a: 'phase2-location-a',
    b: 'phase2-location-b',
    c: 'phase2-location-c',
    item: 'phase2-item'
  };
  const created = commit(db, 'setup', T0, [
    { operation: 'entity.create', target: entities.pop, data: { name: 'Fancy', type: 'population' } },
    { operation: 'entity.create', target: entities.member, data: { name: 'Member', type: 'individual' } },
    { operation: 'entity.create', target: entities.a, data: { name: 'B1', type: 'location' } },
    { operation: 'entity.create', target: entities.b, data: { name: 'B2', type: 'location' } },
    { operation: 'entity.create', target: entities.c, data: { name: 'B3', type: 'location' } },
    { operation: 'entity.create', target: entities.item, data: { name: 'Item', type: 'generic' } }
  ]);
  return { db: created.db, entities };
}

function activeBalance(db, populationId, locationId = null) {
  return E.balances(db).find(row =>
    row.populationId === populationId &&
    row.locationId === locationId &&
    row.disposition === 'active'
  )?.quantity ?? 0;
}

test('a composed event that fails on its final operation rolls back all prior draft changes', () => {
  fc.assert(fc.property(
    fc.integer({ min: 1, max: 100 }),
    fc.integer({ min: 1, max: 100000 }),
    (quantity, amount) => {
      const base = setupBase();
      const before = JSON.stringify(base.db);
      assert.throws(() => commit(base.db, 'atomic-compound', T1, [
        { operation: 'stock.change', data: {
          populationId: base.entities.pop,
          locationId: base.entities.a,
          quantity,
          action: 'add',
          disposition: 'active'
        } },
        { operation: 'finance.record', data: {
          entityId: base.entities.item,
          kind: 'cost',
          amount,
          currency: 'RON'
        } },
        { operation: 'entity.rename', target: 'missing-entity', data: { name: 'must fail' } }
      ]), /Entitatea nu există/);
      assert.equal(JSON.stringify(base.db), before);
    }
  ), propertyOptions(150));
});

test('generated move chains preserve quantity and correcting the current move restores the previous location', () => {
  fc.assert(fc.property(
    fc.integer({ min: 1, max: 100 }),
    fc.array(fc.constantFrom('a', 'b', 'c'), { minLength: 1, maxLength: 20 }),
    (quantity, destinations) => {
      const base = setupBase();
      const { pop, a, b, c } = base.entities;
      const located = commit(base.db, 'move-chain-locate', T0, [
        { operation: 'relation.create', data: { sourceId: pop, targetId: a, type: 'located_in' } },
        { operation: 'stock.change', data: {
          populationId: pop, locationId: a, quantity, action: 'add', disposition: 'active'
        } }
      ]);
      let db = located.db;
      let current = a;
      let previous = a;
      let lastMoveId = null;
      const byName = { a, b, c };

      destinations.forEach((name, index) => {
        previous = current;
        const moved = commit(db, `move-chain-${index}`, T1, [
          { operation: 'relation.move', data: { sourceId: pop, targetId: byName[name] } }
        ]);
        db = moved.db;
        current = byName[name];
        lastMoveId = moved.event.id;
        assert.equal(activeBalance(db, pop, current), quantity);
        assert.equal(
          E.balances(db).filter(row => row.populationId === pop && row.disposition === 'active')
            .reduce((sum, row) => sum + row.quantity, 0),
          quantity
        );
      });

      const corrected = commit(db, 'move-chain-correction', T2, [
        { operation: 'relation.move.correct', data: { correctsEventId: lastMoveId } }
      ]);
      assert.equal(E.activeLocation(corrected.db, pop)?.id, previous);
      assert.equal(activeBalance(corrected.db, pop, previous), quantity);
      assert.equal(
        E.balances(corrected.db).filter(row => row.populationId === pop && row.disposition === 'active')
          .reduce((sum, row) => sum + row.quantity, 0),
        quantity
      );

      const replayed = E.replay(corrected.db.events, corrected.db.attributes);
      assert.deepEqual(replayed.meta.replayWarnings || [], []);
      assert.deepEqual(E.balances(replayed), E.balances(corrected.db));
      assert.equal(E.activeLocation(replayed, pop)?.id, previous);
    }
  ), propertyOptions(100));
});

test('generated location containment chains reject the closing edge that creates a cycle', () => {
  fc.assert(fc.property(
    fc.integer({ min: 2, max: 12 }),
    count => {
      let db = E.emptyState();
      const locations = Array.from({ length: count }, (_, index) => `cycle-location-${index}`);
      const create = commit(db, 'cycle-setup', T0, locations.map((id, index) => ({
        operation: 'entity.create', target: id, data: { name: id, type: 'location' }
      })));
      db = create.db;

      for (let index = 0; index < locations.length - 1; index++) {
        db = commit(db, `contains-${index}`, T1, [{
          operation: 'relation.create',
          data: { sourceId: locations[index], targetId: locations[index + 1], type: 'contains' }
        }]).db;
      }

      const before = JSON.stringify(db);
      assert.throws(() => commit(db, 'contains-cycle', T2, [{
        operation: 'relation.create',
        data: { sourceId: locations.at(-1), targetId: locations[0], type: 'contains' }
      }]), /cicluri/);
      assert.equal(JSON.stringify(db), before);
    }
  ), propertyOptions(150));
});

test('generated correction chains retain later sales and remain replay-equivalent', () => {
  fc.assert(fc.property(
    fc.integer({ min: 5, max: 100 }),
    fc.integer({ min: 1, max: 4 }),
    fc.integer({ min: 1, max: 100 }),
    fc.integer({ min: 1, max: 100 }),
    (initial, saleBound, target1Raw, target2Raw) => {
      const sold = Math.min(saleBound, initial - 1);
      const minTarget = sold + 1;
      let target1 = minTarget + (target1Raw % (101 - minTarget));
      let target2 = minTarget + (target2Raw % (101 - minTarget));
      if (target2 === target1) target2 = minTarget + ((target2 - minTarget + 1) % (101 - minTarget));

      const base = setupBase();
      let db = commit(base.db, 'correction-stock-setup', T0, [{
        operation: 'stock.change',
        data: { populationId: base.entities.pop, locationId: base.entities.a, quantity: initial, action: 'add' }
      }]).db;
      db = commit(db, 'correction-stock-sale', T1, [{
        operation: 'stock.change',
        data: { populationId: base.entities.pop, locationId: base.entities.a, quantity: sold, action: 'sell', disposition: 'sold' }
      }]).db;

      const delta1 = E.correctionDelta(initial, null, target1);
      if (delta1 !== 0) {
        db = commit(db, 'correction-stock-1', T2, [{
          operation: 'stock.adjust',
          data: { correctsEventId: 'correction-stock-setup', changes: [{
            populationId: base.entities.pop, locationId: base.entities.a, disposition: 'active', quantity: delta1
          }] }
        }]).db;
      }

      const delta2 = E.correctionDelta(initial, target1, target2);
      if (delta2 !== 0) {
        db = commit(db, 'correction-stock-2', T2, [{
          operation: 'stock.adjust',
          data: { correctsEventId: 'correction-stock-setup', changes: [{
            populationId: base.entities.pop, locationId: base.entities.a, disposition: 'active', quantity: delta2
          }] }
        }]).db;
      }

      assert.equal(activeBalance(db, base.entities.pop, base.entities.a), target2 - sold);
      const replayed = E.replay(db.events, db.attributes);
      assert.deepEqual(replayed.meta.replayWarnings || [], []);
      assert.deepEqual(E.balances(replayed), E.balances(db));
    }
  ), propertyOptions(150));
});


