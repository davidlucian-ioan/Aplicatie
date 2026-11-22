'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
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

test('stale idempotency metadata cannot block a key that is absent from the event journal', () => {
  const base = setupBase();
  const staleCache = E.normDb({
    ...base.db,
    meta: { ...base.db.meta, processedIntentKeys: ['phantom-intent'] }
  });
  const result = commit(staleCache, 'phantom-intent-event', T1, [
    { operation: 'event.note', data: { description: 'not in the journal before this event' } }
  ], { intentKey: 'phantom-intent' });
  assert.equal(result.duplicate, false);
  assert.equal(result.db.events.at(-1).intentKey, 'phantom-intent');
});

test('event attribute projections survive export validation despite generated projection IDs', () => {
  const base = setupBase();
  const source = commit(base.db, 'event-attribute-source', T1, [
    { operation: 'event.note', data: { description: 'calibration' } }
  ]);
  const attributed = commit(source.db, 'event-attribute-value', T2, [
    { operation: 'event.attribute.set', data: {
      eventId: 'event-attribute-source', name: 'operatorNote', value: 'measured manually'
    } }
  ]);
  const imported = E.validateImport(JSON.parse(JSON.stringify(attributed.db)));
  assert.equal(imported.eventAttributes.length, 1);
  assert.equal(imported.eventAttributes[0].value, 'measured manually');
});

test('commit requires non-empty text event IDs and intent keys', () => {
  const base = setupBase();
  const operation = [{ operation: 'event.note', data: { description: 'identity validation' } }];
  for (const id of [0, 42, '', '  ']) {
    assert.throws(() => E.commit(base.db, { id, timestamp: T1, operations: operation }), /ID text valid/);
  }
  for (const intentKey of ['', '  ', 42, {}]) {
    assert.throws(() => E.commit(base.db, {
      id: 'intent-invalid-' + String(intentKey),
      intentKey,
      timestamp: T1,
      operations: operation
    }), /Cheia de intenție/);
  }
});

test('Replay skips projection effects for malformed event IDs and intent keys with warnings', () => {
  const base = setupBase();
  const malformedId = {
    id: '  ',
    type: 'note',
    timestamp: T1,
    status: 'committed',
    operations: [{ operation: 'entity.create', target: 'must-not-exist-id', data: { name: 'Invalid', type: 'generic' } }]
  };
  const malformedIntent = {
    id: 'malformed-intent-event',
    intentKey: '  ',
    type: 'note',
    timestamp: T1,
    status: 'committed',
    operations: [{ operation: 'entity.create', target: 'must-not-exist-intent', data: { name: 'Invalid', type: 'generic' } }]
  };
  const replayed = E.replay([...base.db.events, malformedId, malformedIntent]);
  assert.equal(replayed.entities.some(entity => entity.id === 'must-not-exist-id'), false);
  assert.equal(replayed.entities.some(entity => entity.id === 'must-not-exist-intent'), false);
  assert.ok(replayed.meta.replayWarnings.some(w => /fără ID/i.test(w.error)));
  assert.ok(replayed.meta.replayWarnings.some(w => /intentKey invalidă/i.test(w.error)));
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

test('correcting an older measurement does not replace a later journal write when timestamps are out of order', () => {
  const base = setupBase();
  const definition = commit(base.db, 'attribute-schema', T0, [
    { operation: 'attribute.define', data: { name: 'pH', type: 'number', nature: 'dynamic', role: 'measurement', historyEnabled: true } }
  ]);
  const entityId = base.entities.item;
  const firstMeasurement = commit(definition.db, 'measurement-first', T2, [
    { operation: 'attribute.set', target: entityId, data: { name: 'pH', value: 6.4, forceHistory: true } }
  ]);
  const secondMeasurement = commit(firstMeasurement.db, 'measurement-second', T1, [
    { operation: 'attribute.set', target: entityId, data: { name: 'pH', value: 6.8, forceHistory: true } }
  ]);
  const corrected = commit(secondMeasurement.db, 'measurement-correction', '2026-11-01T13:00:00.000Z', [
    { operation: 'attribute.correct', target: entityId, data: {
      name: 'pH', value: 6.5, correctsEventId: 'measurement-first'
    } }
  ]);
  assert.equal(corrected.db.entities.find(entity => entity.id === entityId).attributes.pH, 6.8);
  const replayed = E.replay(corrected.db.events, corrected.db.attributes);
  assert.equal(replayed.entities.find(entity => entity.id === entityId).attributes.pH, 6.8);
  assert.deepEqual(replayed.meta.replayWarnings || [], []);
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


test('stock.reverse cannot apply a second compensation to an event already reversed', () => {
  const base = setupBase();
  const added = commit(base.db, 'reverse-original-add', T1, [{
    operation: 'stock.change',
    data: { populationId: base.entities.pop, locationId: base.entities.a, quantity: 5, action: 'add' }
  }]);
  const reversed = commit(added.db, 'reverse-once', T2, [{
    operation: 'stock.reverse', data: { correctsEventId: 'reverse-original-add' }
  }]);
  assert.equal(activeBalance(reversed.db, base.entities.pop, base.entities.a), 0);

  const laterAddition = commit(reversed.db, 'reverse-later-add', T2, [{
    operation: 'stock.change',
    data: { populationId: base.entities.pop, locationId: base.entities.a, quantity: 8, action: 'add' }
  }]);
  assert.throws(() => commit(laterAddition.db, 'reverse-twice', T2, [{
    operation: 'stock.reverse', data: { correctsEventId: 'reverse-original-add' }
  }]), /deja corectate/);
  assert.equal(activeBalance(laterAddition.db, base.entities.pop, base.entities.a), 8);
});

test('Replay uses append order as the source-of-truth when clock timestamps are out of order', () => {
  const base = setupBase();
  const created = commit(base.db, 'append-create', T2, [
    { operation: 'entity.create', target: 'append-order-entity', data: { name: 'Original', type: 'generic' } }
  ]);
  const renamed = commit(created.db, 'append-rename', T1, [
    { operation: 'entity.rename', target: 'append-order-entity', data: { name: 'Renamed' } }
  ]);
  const replayed = E.replay(renamed.db.events);
  assert.equal(replayed.entities.find(entity => entity.id === 'append-order-entity').name, 'Renamed');
  assert.deepEqual(replayed.meta.replayWarnings || [], []);
});

test('commit rejects an explicitly malformed event timestamp', () => {
  const base = setupBase();
  for (const timestamp of ['yesterday-ish', '2026-11-22', '2026-02-30T10:00:00.000Z', '2026-11-22T10:00:00']) {
    assert.throws(() => E.commit(base.db, {
      id: 'bad-timestamp-' + String(timestamp),
      timestamp,
      operations: [{ operation: 'event.note', data: { description: 'must reject' } }]
    }), /timestamp ISO valid/);
  }
});

test('Replay warns and skips projection effects for an event with an invalid timestamp', () => {
  const base = setupBase();
  const invalid = {
    id: 'invalid-time-event',
    type: 'entity.create',
    timestamp: 'not-a-date',
    status: 'committed',
    operations: [{ operation: 'entity.create', target: 'invalid-time-entity', data: { name: 'Invalid', type: 'generic' } }]
  };
  const dateOnly = { ...invalid, id: 'date-only-event', timestamp: '2026-11-22' };
  const replayed = E.replay([...base.db.events, invalid, dateOnly]);
  assert.equal(replayed.entities.some(entity => entity.id === 'invalid-time-entity'), false);
  assert.ok(replayed.meta.replayWarnings.some(w => w.eventId === 'invalid-time-event' && /timestamp/i.test(w.error)));
  assert.ok(replayed.meta.replayWarnings.some(w => w.eventId === 'date-only-event' && /timestamp/i.test(w.error)));
});

test('import rejects a future schema version instead of silently downgrading it', () => {
  const base = setupBase();
  const future = JSON.parse(JSON.stringify(base.db));
  future.schemaVersion = 8;
  assert.throws(() => E.validateImport(future), /mai nouă decât versiunea suportată/);
  future.schemaVersion = '8';
  assert.throws(() => E.validateImport(future), /versiunea schemei este invalidă/);
});

test('import rejects malformed projection collections rather than silently normalizing them to empty', () => {
  const base = setupBase();
  const malformed = JSON.parse(JSON.stringify(base.db));
  malformed.stock = { quantity: 99 };
  assert.throws(() => E.validateImport(malformed), /stock.*trebuie să fie o listă/);
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

test('Replay applies only the first committed event for a duplicated intent key', () => {
  const base = setupBase();
  const first = {
    id: 'replay-intent-first',
    intentKey: 'same-delivery',
    type: 'stock.add',
    timestamp: T1,
    status: 'committed',
    operations: [{ operation: 'stock.change', data: {
      populationId: base.entities.pop, locationId: base.entities.a,
      quantity: 5, action: 'add', disposition: 'active'
    } }]
  };
  const retry = {
    ...first,
    id: 'replay-intent-retry',
    timestamp: T1,
    operations: [{ operation: 'stock.change', data: {
      populationId: base.entities.pop, locationId: base.entities.a,
      quantity: 7, action: 'add', disposition: 'active'
    } }]
  };
  const replayed = E.replay([...base.db.events, first, retry]);
  assert.equal(activeBalance(replayed, base.entities.pop, base.entities.a), 5);
  assert.ok(replayed.meta.replayWarnings.some(w => /intentKey.*duplicată/i.test(w.error)));
  assert.deepEqual(replayed.events.map(event => event.id).slice(-2), ['replay-intent-first', 'replay-intent-retry']);
});

test('Replay keeps insertion order for events with identical timestamps', () => {
  const events = [
    { id: 'same-time-a', type: 'note', timestamp: T1, status: 'committed', operations: [{ operation: 'event.note', data: { description: 'A' } }] },
    { id: 'same-time-b', type: 'note', timestamp: T1, status: 'committed', operations: [{ operation: 'event.note', data: { description: 'B' } }] },
    { id: 'same-time-c', type: 'note', timestamp: T1, status: 'committed', operations: [{ operation: 'event.note', data: { description: 'C' } }] }
  ];
  const replayed = E.replay(events);
  assert.deepEqual(replayed.events.map(event => event.id), ['same-time-a', 'same-time-b', 'same-time-c']);
  assert.deepEqual(replayed.meta.replayWarnings || [], []);
});

test('import rejects malformed and duplicate journal identities rather than silently dropping history', () => {
  const base = setupBase();
  const note = commit(base.db, 'import-note', T1, [
    { operation: 'event.note', data: { description: 'historical note' } }
  ], { intentKey: 'history-note-key' }).db;

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

test('legacy schema 6 retains projection-only attribute definitions during safe migration', () => {
  const base = setupBase();
  const legacy = {
    ...JSON.parse(JSON.stringify(base.db)),
    schemaVersion: 6,
    attributes: [{
      id: 'legacy-attribute-ph',
      name: 'pH',
      type: 'number',
      nature: 'dynamic',
      role: 'measurement',
      ownerType: 'entity',
      required: false,
      historyEnabled: true,
      validation: { min: 5.5, max: 6.5 }
    }]
  };
  const migrated = E.validateImport(legacy);
  assert.equal(migrated.schemaVersion, 7);
  assert.equal(migrated.attributes.length, 1);
  assert.equal(migrated.attributes[0].name, 'pH');
  assert.equal(migrated.attributes[0].validation.max, 6.5);
  assert.deepEqual(migrated.meta.replayWarnings || [], []);
});

test('normDb normalizes all collection and metadata cache arrays', () => {
  const normalized = E.normDb({
    eventAttributes: null,
    meta: { processedIntentKeys: null, replayWarnings: null }
  });
  assert.deepEqual(normalized.eventAttributes, []);
  assert.deepEqual(normalized.meta.processedIntentKeys, []);
  assert.deepEqual(normalized.meta.replayWarnings, []);
});
