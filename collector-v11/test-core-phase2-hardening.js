'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fc = require('fast-check');
const E = require('./engine.js');

const T0 = '2026-11-01T10:00:00.000Z';
const T1 = '2026-11-01T11:00:00.000Z';
const T2 = '2026-11-01T12:00:00.000Z';

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

test('a repeated idempotency key is deduplicated from the journal even if the cache is stale', () => {
  const base = setupBase();
  const first = commit(base.db, 'first-intent', T1, [
    { operation: 'event.note', data: { description: 'first delivery' } }
  ], { intentKey: 'same-intent' }).db;

  // Simulate a legacy/stale metadata projection: the immutable journal still has the intent.
  const staleCache = E.normDb({
    ...first,
    meta: { ...first.meta, processedIntentKeys: [] }
  });
  const retry = commit(staleCache, 'second-intent', T2, [
    { operation: 'event.note', data: { description: 'duplicate delivery' } }
  ], { intentKey: 'same-intent' });

  assert.equal(retry.duplicate, true);
  assert.equal(retry.db.events.length, first.events.length);
  assert.equal(retry.event.id, 'first-intent');
});

test('a later rename with the same value and timestamp is not undone by correcting the earlier rename', () => {
  const base = setupBase();
  const first = commit(base.db, 'rename-1', T1, [
    { operation: 'entity.rename', target: base.entities.item, data: { name: 'Renamed' } }
  ]);
  const second = commit(first.db, 'rename-2', T1, [
    { operation: 'entity.rename', target: base.entities.item, data: { name: 'Renamed' } }
  ]);
  const corrected = commit(second.db, 'rename-correction', T2, [
    { operation: 'entity.rename.correct', target: base.entities.item, data: { correctsEventId: 'rename-1' } }
  ]);

  assert.equal(corrected.db.entities.find(entity => entity.id === base.entities.item).name, 'Renamed');
  assert.equal(E.replay(corrected.db.events).entities.find(entity => entity.id === base.entities.item).name, 'Renamed');
});

test('a later relation close with the same timestamp cannot be undone by correcting the first close', () => {
  const base = setupBase();
  const relationCreated = commit(base.db, 'relation-created', T0, [
    { operation: 'relation.create', data: {
      sourceId: base.entities.pop,
      targetId: base.entities.item,
      type: 'related_to'
    } }
  ]);
  const relationId = relationCreated.db.relations[0].id;
  const close1 = commit(relationCreated.db, 'close-1', T1, [
    { operation: 'relation.close', data: { relationId } }
  ]);
  const reopen = commit(close1.db, 'reopen-1', T1, [
    { operation: 'relation.close.correct', data: { relationId, correctsEventId: 'close-1' } }
  ]);
  const close2 = commit(reopen.db, 'close-2', T1, [
    { operation: 'relation.close', data: { relationId } }
  ]);

  assert.throws(() => commit(close2.db, 'late-correction', T2, [
    { operation: 'relation.close.correct', data: { relationId, correctsEventId: 'close-1' } }
  ]), /modificată ulterior|nu este sigur/);
  assert.equal(close2.db.relations[0].endedAt, T1);
});

test('a later relation attribute write with the same timestamp and value survives correction of the earlier write', () => {
  const base = setupBase();
  const relationCreated = commit(base.db, 'relation-created-attr', T0, [
    { operation: 'relation.create', data: {
      sourceId: base.entities.pop,
      targetId: base.entities.item,
      type: 'related_to'
    } }
  ]);
  const relationId = relationCreated.db.relations[0].id;
  const first = commit(relationCreated.db, 'relation-score-1', T1, [
    { operation: 'relation.attribute.set', data: { relationId, name: 'score', value: 5 } }
  ]);
  const second = commit(first.db, 'relation-score-2', T1, [
    { operation: 'relation.attribute.set', data: { relationId, name: 'score', value: 5 } }
  ]);
  const corrected = commit(second.db, 'relation-score-correction', T2, [
    { operation: 'relation.attribute.correct', data: {
      relationId, name: 'score', correctsEventId: 'relation-score-1'
    } }
  ]);
  assert.equal(corrected.db.relations[0].attributes.score, 5);
  assert.equal(E.replay(corrected.db.events).relations[0].attributes.score, 5);
});

test('correcting the same membership relation twice cannot reverse its automatic stock effect twice', () => {
  const base = setupBase();
  const membership = commit(base.db, 'membership-create', T1, [
    { operation: 'relation.create', data: {
      sourceId: base.entities.pop,
      targetId: base.entities.member,
      type: 'contains'
    } }
  ]);
  const withAnonymous = commit(membership.db, 'anonymous-add', T2, [
    { operation: 'stock.change', data: {
      populationId: base.entities.pop,
      locationId: null,
      quantity: 4,
      action: 'add',
      disposition: 'active'
    } }
  ]);
  const correction = commit(withAnonymous.db, 'membership-correction-1', T2, [
    { operation: 'relation.create.correct', data: { correctsEventId: 'membership-create' } }
  ]);
  assert.equal(activeBalance(correction.db, base.entities.pop), 4);

  assert.throws(() => commit(correction.db, 'membership-correction-2', T2, [
    { operation: 'relation.create.correct', data: { correctsEventId: 'membership-create' } }
  ]), /deja corectată|deja corectat/);
  assert.equal(activeBalance(correction.db, base.entities.pop), 4);
});

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
  ), { numRuns: 100 });
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
      assert.deepEqual(E.meta?.replayWarnings || [], []);
      assert.deepEqual(E.balances(replayed), E.balances(corrected.db));
      assert.equal(E.activeLocation(replayed, pop)?.id, previous);
    }
  ), { numRuns: 100 });
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
  ), { numRuns: 30 });
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
  ), { numRuns: 150 });
});

test('replay preserves event order for equal timestamps and rejects duplicate event IDs or intent keys', () => {
  const base = setupBase();
  const events = [
    { id: 'equal-1', intentKey: 'equal-intent-1', type: 'note', timestamp: T1, status: 'committed', operations: [{ operation: 'event.note', data: { description: 'one' } }] },
    { id: 'equal-2', intentKey: 'equal-intent-2', type: 'note', timestamp: T1, status: 'committed', operations: [{ operation: 'event.note', data: { description: 'two' } }] }
  ];
  const replay = E.replay(events);
  assert.deepEqual(replay.meta.replayWarnings || [], []);

  const duplicateId = E.replay([events[0], { ...events[1], id: events[0].id }]);
  assert.ok(duplicateId.meta.replayWarnings.some(w => /ID.*duplicat/i.test(w.error)));

  const duplicateIntent = E.replay([events[0], { ...events[1], id: 'equal-3', intentKey: events[0].intentKey }]);
  assert.ok(duplicateIntent.meta.replayWarnings.some(w => /intent|intenție/i.test(w.error)));
});

test('import rejects malformed and duplicate journal identities rather than silently dropping history', () => {
  const base = setupBase();
  const note = commit(base.db, 'import-note', T1, [
    { operation: 'event.note', data: { description: 'historical note' } }
  ]).db;

  const missingId = E.normDb({ ...note, events: [...note.events, {
    type: 'legacy.note', timestamp: T2, status: 'committed',
    operations: [{ operation: 'event.note', data: { description: 'must not disappear' } }]
  }] });
  assert.throws(() => E.validateImport(missingId), /ID.*eveniment|eveniment.*ID/i);

  const duplicateId = E.normDb({ ...note, events: [...note.events, { ...note.events.at(-1) }] });
  assert.throws(() => E.validateImport(duplicateId), /ID.*duplicat/i);

  const duplicateIntent = E.normDb({ ...note, events: [
    ...note.events,
    { ...note.events.at(-1), id: 'import-note-duplicate-intent' , timestamp: T2 }
  ] });
  assert.throws(() => E.validateImport(duplicateIntent), /intent|intenție/i);
});

test('schema-version 7 import verifies attribute definitions against the event journal', () => {
  const base = setupBase();
  const withAttribute = commit(base.db, 'define-schema-attribute', T1, [
    { operation: 'attribute.define', data: {
      name: 'pH', type: 'number', nature: 'dynamic', role: 'measurement',
      historyEnabled: true, validation: { min: 5.5, max: 6.5 }
    } }
  ]).db;
  assert.equal(E.validateImport(JSON.parse(JSON.stringify(withAttribute))).attributes[0].type, 'number');

  const tampered = JSON.parse(JSON.stringify(withAttribute));
  tampered.attributes[0].validation.max = 99;
  assert.throws(() => E.validateImport(tampered), /attributes|atribut|proiecția/i);
});

test('normDb always normalizes eventAttributes to an array', () => {
  assert.deepEqual(E.normDb({ eventAttributes: null }).eventAttributes, []);
});
