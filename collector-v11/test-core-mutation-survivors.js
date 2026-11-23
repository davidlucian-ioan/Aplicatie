'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./engine.js');

const BASE = Date.parse('2026-11-01T00:00:00.000Z');

function setup() {
  let tick = 0;
  let db = E.emptyState();
  const commit = (id, operations, extra = {}) => {
    const result = E.commit(db, {
      id,
      type: 'test.' + id,
      timestamp: new Date(BASE + tick++).toISOString(),
      operations,
      ...extra
    });
    db = result.db;
    return result;
  };
  commit('setup', [
    { operation: 'entity.create', target: 'population', data: { name: 'Fancy', type: 'population' } },
    { operation: 'entity.create', target: 'location-a', data: { name: 'Sera', type: 'location' } },
    { operation: 'entity.create', target: 'location-b', data: { name: 'Raft', type: 'location' } },
    { operation: 'entity.create', target: 'item', data: { name: 'Plant', type: 'plant' } },
    { operation: 'entity.create', target: 'other', data: { name: 'Other', type: 'generic' } }
  ]);
  return { get db() { return db; }, commit };
}

function balance(db, populationId = 'population', locationId = 'location-a', disposition = 'active') {
  return E.balances(db).find(row =>
    row.populationId === populationId &&
    row.locationId === locationId &&
    row.disposition === disposition
  )?.quantity || 0;
}

test('stock.change validează cantitatea, locația și soldul disponibil', () => {
  const s = setup();
  s.commit('stock-add', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', quantity: 5, action: 'add' } }]);
  s.commit('stock-sell', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', quantity: 2, action: 'sell', disposition: 'sold' } }]);

  assert.equal(balance(s.db), 3);
  assert.equal(balance(s.db, 'population', 'location-a', 'sold'), 2);

  const before = JSON.stringify(s.db);
  assert.throws(() => s.commit('stock-too-much', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', quantity: 4, action: 'sell' } }]), /Cantitate insuficientă/);
  assert.throws(() => s.commit('stock-zero', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', quantity: 0, action: 'add' } }]), /pozitiv/);
  assert.throws(() => s.commit('stock-invalid-location', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'missing', quantity: 1, action: 'add' } }]), /Locația selectată/);
  assert.equal(JSON.stringify(s.db), before, 'failed stock operations must not mutate the committed state');
});

test('stock.adjust aplică numai corecții nenule care nu produc sold negativ', () => {
  const s = setup();
  s.commit('stock-seed', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', quantity: 5, action: 'add' } }]);
  s.commit('stock-adjust', [{ operation: 'stock.adjust', data: { correctsEventId: 'stock-seed', changes: [{ populationId: 'population', locationId: 'location-a', disposition: 'active', quantity: -2 }] } }]);
  assert.equal(balance(s.db), 3);

  const before = JSON.stringify(s.db);
  assert.throws(() => s.commit('stock-adjust-empty', [{ operation: 'stock.adjust', data: { correctsEventId: 'stock-seed', changes: [] } }]), /nu conține modificări/);
  assert.throws(() => s.commit('stock-adjust-zero', [{ operation: 'stock.adjust', data: { correctsEventId: 'stock-seed', changes: [{ populationId: 'population', locationId: 'location-a', quantity: 0 }] } }]), /nenulă/);
  assert.throws(() => s.commit('stock-adjust-unknown', [{ operation: 'stock.adjust', data: { correctsEventId: 'stock-seed', changes: [{ populationId: 'missing', quantity: 1 }] } }]), /nu există/);
  assert.throws(() => s.commit('stock-adjust-negative', [{ operation: 'stock.adjust', data: { correctsEventId: 'stock-seed', changes: [{ populationId: 'population', locationId: 'location-a', quantity: -4 }] } }]), /sold activ negativ/);
  assert.equal(JSON.stringify(s.db), before);
});

test('stock.reverse inversează un eveniment o singură dată', () => {
  const s = setup();
  s.commit('stock-seed', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', quantity: 4, action: 'add' } }]);
  s.commit('stock-reverse', [{ operation: 'stock.reverse', data: { correctsEventId: 'stock-seed' } }]);
  assert.equal(balance(s.db), 0);
  assert.throws(() => s.commit('stock-reverse-twice', [{ operation: 'stock.reverse', data: { correctsEventId: 'stock-seed' } }]), /deja corectate/);
});

test('stock.reverse inversează toate componentele unei vânzări și restaurează soldul activ', () => {
  const s = setup();
  s.commit('reverse-sale-seed', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', quantity: 5, action: 'add' } }]);
  s.commit('reverse-sale', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', quantity: 2, action: 'sell' } }]);
  assert.equal(balance(s.db, 'population', 'location-a'), 3);
  assert.equal(balance(s.db, 'population', 'location-a', 'sold'), 2);

  s.commit('reverse-sale-correction', [{ operation: 'stock.reverse', data: { correctsEventId: 'reverse-sale' } }]);
  assert.equal(balance(s.db, 'population', 'location-a'), 5);
  assert.equal(balance(s.db, 'population', 'location-a', 'sold'), 0);
});

test('stock.reverse inversează atomic ambele laturi ale unei mutări între locații', () => {
  const s = setup();
  s.commit('reverse-move-seed', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', quantity: 5, action: 'add' } }]);
  s.commit('reverse-move', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', destinationId: 'location-b', quantity: 2, action: 'move_out' } }]);
  assert.equal(balance(s.db, 'population', 'location-a'), 3);
  assert.equal(balance(s.db, 'population', 'location-b'), 2);

  s.commit('reverse-move-correction', [{ operation: 'stock.reverse', data: { correctsEventId: 'reverse-move' } }]);
  assert.equal(balance(s.db, 'population', 'location-a'), 5);
  assert.equal(balance(s.db, 'population', 'location-b'), 0);
});

test('stock.reverse respinge evenimente inexistente sau fără efecte de stoc fără să modifice baza', () => {
  const s = setup();
  s.commit('reverse-non-stock-event', [{ operation: 'finance.record', data: { entityId: 'item', kind: 'cost', amount: 10, currency: 'RON' } }]);
  const before = JSON.stringify(s.db);

  assert.throws(() => s.commit('reverse-missing-event', [{ operation: 'stock.reverse', data: { correctsEventId: 'missing-event' } }]), /nu există/);
  assert.throws(() => s.commit('reverse-event-without-stock', [{ operation: 'stock.reverse', data: { correctsEventId: 'reverse-non-stock-event' } }]), /nu are efecte de stoc/);
  assert.equal(JSON.stringify(s.db), before);
});

test('stock.reverse respinge inversarea unei adăugări după vânzare parțială și păstrează atomicitatea', () => {
  const s = setup();
  s.commit('reverse-partial-seed', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', quantity: 5, action: 'add' } }]);
  s.commit('reverse-partial-sale', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', quantity: 2, action: 'sell' } }]);
  const before = JSON.stringify(s.db);

  assert.throws(
    () => s.commit('reverse-partially-consumed-add', [{ operation: 'stock.reverse', data: { correctsEventId: 'reverse-partial-seed' } }]),
    /sold activ negativ/
  );
  assert.equal(JSON.stringify(s.db), before);
});

test('finance.record și finance.adjust validează și păstrează totalurile', () => {
  const s = setup();
  s.commit('finance-cost', [{ operation: 'finance.record', data: { entityId: 'item', kind: 'cost', amount: 100, currency: 'RON', description: 'purchase' } }]);
  s.commit('finance-sale', [{ operation: 'finance.record', data: { entityId: 'population', kind: 'sale', amount: 25, currency: 'RON', description: 'sale' } }]);
  assert.equal(E.totalFinance(s.db)['RON|cost'], 100);
  assert.equal(E.totalFinance(s.db)['RON|sale'], 25);

  s.commit('finance-correction', [{ operation: 'finance.adjust', data: { entityId: 'item', kind: 'cost', amount: -100, currency: 'RON', correctsEventId: 'finance-cost' } }]);
  assert.equal(E.totalFinance(s.db)['RON|cost'], 0);

  const before = JSON.stringify(s.db);
  assert.throws(() => s.commit('finance-negative', [{ operation: 'finance.record', data: { entityId: 'item', amount: -1, currency: 'RON' } }]), /pozitivă sau zero/);
  assert.throws(() => s.commit('finance-infinite', [{ operation: 'finance.record', data: { entityId: 'item', amount: 'Infinity', currency: 'RON' } }]), /pozitivă sau zero/);
  assert.throws(() => s.commit('finance-missing-entity', [{ operation: 'finance.record', data: { entityId: 'missing', amount: 1, currency: 'RON' } }]), /nu există/);
  assert.throws(() => s.commit('finance-zero-adjustment', [{ operation: 'finance.adjust', data: { amount: 0, currency: 'RON' } }]), /nenulă/);
  assert.equal(JSON.stringify(s.db), before);
});

test('attribute.define și attribute.set aplică tipul, câmpul required și compatibilitatea definiției', () => {
  const s = setup();
  s.commit('define-ph', [{ operation: 'attribute.define', data: { name: 'pH', type: 'number', ownerType: 'entity', required: true } }]);
  s.commit('set-ph', [{ operation: 'attribute.set', target: 'item', data: { name: 'pH', value: 6.4 } }]);
  assert.equal(s.db.entities.find(entity => entity.id === 'item').attributes.pH, 6.4);

  const before = JSON.stringify(s.db);
  assert.throws(() => s.commit('set-ph-text', [{ operation: 'attribute.set', target: 'item', data: { name: 'pH', value: 'not-a-number' } }]), /trebuie să fie numeric/);
  assert.throws(() => s.commit('set-ph-empty', [{ operation: 'attribute.set', target: 'item', data: { name: 'pH', value: '' } }]), /obligatoriu/);
  assert.throws(() => s.commit('redefine-ph-type', [{ operation: 'attribute.define', data: { name: 'pH', type: 'text' } }]), /Tipul atributului este deja folosit/);
  assert.equal(JSON.stringify(s.db), before);
});

test('relation.create respinge relații invalide, duplicate și cicluri în ierarhia locațiilor', () => {
  const s = setup();
  s.commit('relation-ok', [{ operation: 'relation.create', data: { sourceId: 'item', targetId: 'other', type: 'related_to' } }]);
  assert.throws(() => s.commit('relation-duplicate', [{ operation: 'relation.create', data: { sourceId: 'item', targetId: 'other', type: 'related_to' } }]), /există deja/);
  assert.throws(() => s.commit('relation-self', [{ operation: 'relation.create', data: { sourceId: 'item', targetId: 'item', type: 'related_to' } }]), /ea însăși/);
  assert.throws(() => s.commit('relation-custom-empty', [{ operation: 'relation.create', data: { sourceId: 'item', targetId: 'other', type: 'custom' } }]), /numele tipului este obligatoriu/);
  assert.throws(() => s.commit('relation-located-invalid', [{ operation: 'relation.create', data: { sourceId: 'item', targetId: 'other', type: 'located_in' } }]), /trebuie să fie o locație/);

  s.commit('location-parent-child', [{ operation: 'relation.create', data: { sourceId: 'location-a', targetId: 'location-b', type: 'contains' } }]);
  assert.throws(() => s.commit('location-cycle', [{ operation: 'relation.create', data: { sourceId: 'location-b', targetId: 'location-a', type: 'contains' } }]), /nu poate conține cicluri/);
});

test('atributele evenimentelor pot fi înregistrate și corectate, iar evenimentele invalidate sunt ascunse', () => {
  const s = setup();
  s.commit('note-original', [{ operation: 'event.note', data: { description: 'note' } }]);
  s.commit('event-attribute', [{ operation: 'event.attribute.set', data: { eventId: 'note-original', name: 'weather', value: 'sunny' } }]);
  assert.equal(s.db.eventAttributes.length, 1);
  assert.equal(s.db.eventAttributes[0].value, 'sunny');

  s.commit('event-attribute-correction', [{ operation: 'event.attribute.correct', data: { eventId: 'note-original', correctsEventId: 'event-attribute' } }]);
  assert.equal(s.db.eventAttributes[0].voidedByEventId, 'event-attribute-correction');
  assert.throws(() => s.commit('event-attribute-correction-missing', [{ operation: 'event.attribute.correct', data: { eventId: 'note-original', correctsEventId: 'missing' } }]), /nu există/);

  s.commit('invalidate-note', [{ operation: 'event.invalidate', data: { correctsEventId: 'note-original' } }]);
  assert.equal(s.db.events.find(event => event.id === 'note-original').hiddenFromHistory, true);
});

test('helper-ele de locație, identificare, corecție și expirare context au rezultate stabile', () => {
  const s = setup();
  s.commit('location-hierarchy', [{ operation: 'relation.create', data: { sourceId: 'location-a', targetId: 'location-b', type: 'contains' } }]);
  s.commit('population-location', [{ operation: 'relation.create', data: { sourceId: 'population', targetId: 'location-b', type: 'located_in' } }]);
  s.commit('define-code', [{ operation: 'attribute.define', data: { name: 'code', type: 'text', ownerType: 'entity', identifying: true } }]);
  s.commit('set-code', [{ operation: 'attribute.set', target: 'item', data: { name: 'code', value: 'PLANT-001' } }]);

  assert.deepEqual(E.locationPath(s.db, 'location-b'), ['Sera', 'Raft']);
  assert.equal(E.activeLocation(s.db, 'population').id, 'location-b');
  assert.deepEqual(E.identify(s.db, 'plant', { code: 'plant-001' }).map(entity => entity.id), ['item']);
  assert.equal(E.correctionDelta(10, null, 7), -3);
  assert.equal(E.correctionDelta(10, 7, 8), 1);

  const active = { ...s.db, meta: { lastActivityAt: new Date(Date.now() - 29 * 60 * 1000).toISOString() } };
  const expired = { ...s.db, meta: { lastActivityAt: new Date(Date.now() - 31 * 60 * 1000).toISOString() } };
  assert.equal(E.contextIsActive(active), true);
  assert.equal(E.contextIsActive(expired), false);
});

test('commit și replay resping timestamp-uri și chei de intenție invalide', () => {
  const s = setup();
  assert.throws(() => s.commit('bad-date', [{ operation: 'event.note', data: { description: 'bad date' } }], { timestamp: '2026-02-30T12:00:00.000Z' }), /timestamp ISO valid/);
  assert.throws(() => s.commit('bad-intent', [{ operation: 'event.note', data: { description: 'bad intent' } }], { intentKey: ' padded ' }), /Cheia de intenție/);

  s.commit('intent-first', [{ operation: 'event.note', data: { description: 'intent' } }], { intentKey: 'same-intent' });
  const duplicate = s.commit('intent-second', [{ operation: 'event.note', data: { description: 'duplicate' } }], { intentKey: 'same-intent' });
  assert.equal(duplicate.duplicate, true);

  const replayed = E.replay([
    { id: 'invalid-date', type: 'event.note', timestamp: '2026-02-30T12:00:00.000Z', status: 'committed', operations: [{ operation: 'event.note', data: { description: 'invalid' } }] },
    { id: 'valid-date', type: 'event.note', timestamp: '2026-02-28T12:00:00.000Z', status: 'committed', operations: [{ operation: 'event.note', data: { description: 'valid' } }] }
  ]);
  assert.equal(replayed.meta.replayWarnings.length, 1);
  assert.equal(replayed.meta.replayWarnings[0].eventId, 'invalid-date');
});


test('relation.close și relation.close.correct păstrează istoricul și resping corecțiile stale', () => {
  const s = setup();
  s.commit('relation-lifecycle-create', [{ operation: 'relation.create', data: { sourceId: 'item', targetId: 'other', type: 'related_to' } }]);
  const relationId = s.db.relations[0].id;

  s.commit('relation-close-first', [{ operation: 'relation.close', data: { relationId } }]);
  assert.equal(s.db.relations[0].endedAt, new Date(BASE + 2).toISOString());

  s.commit('relation-close-correct', [{ operation: 'relation.close.correct', data: { relationId, correctsEventId: 'relation-close-first' } }]);
  assert.equal(s.db.relations[0].endedAt, null);
  assert.equal(s.db.relations[0].history.at(-1).action, 'reopened_by_correction');

  s.commit('relation-close-second', [{ operation: 'relation.close', data: { relationId } }]);
  const before = JSON.stringify(s.db);
  assert.throws(
    () => s.commit('relation-close-stale-correction', [{ operation: 'relation.close.correct', data: { relationId, correctsEventId: 'relation-close-first' } }]),
    /modificată ulterior/
  );
  assert.equal(JSON.stringify(s.db), before);
});

test('relation.attribute.set și relation.attribute.correct refac numai valoarea curentă vizată', () => {
  const s = setup();
  s.commit('relation-attribute-create', [{ operation: 'relation.create', data: { sourceId: 'item', targetId: 'other', type: 'related_to' } }]);
  const relationId = s.db.relations[0].id;

  s.commit('relation-attribute-one', [{ operation: 'relation.attribute.set', data: { relationId, name: 'strength', value: 3 } }]);
  s.commit('relation-attribute-two', [{ operation: 'relation.attribute.set', data: { relationId, name: 'strength', value: 5 } }]);
  s.commit('relation-attribute-correct-old', [{ operation: 'relation.attribute.correct', data: { relationId, name: 'strength', correctsEventId: 'relation-attribute-one' } }]);
  assert.equal(s.db.relations[0].attributes.strength, 5);

  s.commit('relation-attribute-correct-latest', [{ operation: 'relation.attribute.correct', data: { relationId, name: 'strength', correctsEventId: 'relation-attribute-two' } }]);
  assert.equal(s.db.relations[0].attributes.strength, 3);
});

test('relation.create.correct anulează relația și efectul de membru identificat o singură dată', () => {
  const s = setup();
  s.commit('individual-create', [{ operation: 'entity.create', target: 'individual', data: { name: 'Shrimp 1', type: 'individual' } }]);
  s.commit('population-member', [{ operation: 'relation.create', data: { sourceId: 'population', targetId: 'individual', type: 'contains' } }]);

  assert.equal(s.db.stock.filter(row => row.eventId === 'population-member' && row.action === 'identified_member').length, 1);
  assert.equal(E.balances(s.db).reduce((sum, row) => sum + row.quantity, 0), 1);

  s.commit('population-member-correct', [{ operation: 'relation.create.correct', data: { correctsEventId: 'population-member' } }]);
  assert.ok(s.db.relations[0].endedAt);
  assert.equal(s.db.relations[0].voidedByEventId, 'population-member-correct');
  assert.equal(E.balances(s.db).reduce((sum, row) => sum + row.quantity, 0), 0);
  assert.throws(
    () => s.commit('population-member-correct-twice', [{ operation: 'relation.create.correct', data: { correctsEventId: 'population-member' } }]),
    /deja corectată/
  );
});

test('relation.move transferă soldul și corectează numai ultima mutare activă', () => {
  const s = setup();
  s.commit('population-located-a', [{ operation: 'relation.create', data: { sourceId: 'population', targetId: 'location-a', type: 'located_in' } }]);
  s.commit('population-stock-a', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', quantity: 5, action: 'add' } }]);

  s.commit('population-move-b', [{ operation: 'relation.move', data: { sourceId: 'population', targetId: 'location-b' } }]);
  assert.equal(E.activeLocation(s.db, 'population').id, 'location-b');
  assert.equal(balance(s.db), 0);
  assert.equal(balance(s.db, 'population', 'location-b'), 5);

  s.commit('population-move-b-correct', [{ operation: 'relation.move.correct', data: { correctsEventId: 'population-move-b' } }]);
  assert.equal(E.activeLocation(s.db, 'population').id, 'location-a');
  assert.equal(balance(s.db), 5);
  assert.equal(balance(s.db, 'population', 'location-b'), 0);

  s.commit('population-move-b-again', [{ operation: 'relation.move', data: { sourceId: 'population', targetId: 'location-b' } }]);
  s.commit('population-move-back-a', [{ operation: 'relation.move', data: { sourceId: 'population', targetId: 'location-a' } }]);
  s.commit('population-move-old-correct', [{ operation: 'relation.move.correct', data: { correctsEventId: 'population-move-b-again' } }]);
  assert.equal(E.activeLocation(s.db, 'population').id, 'location-a');
  assert.equal(balance(s.db), 5);
  assert.equal(balance(s.db, 'population', 'location-b'), 0);
});

test('relation.move.correct marchează corecția și respinge repetarea fără a afecta mutările ulterioare', () => {
  const s = setup();
  s.commit('population-located-a-repeat', [{ operation: 'relation.create', data: { sourceId: 'population', targetId: 'location-a', type: 'located_in' } }]);
  s.commit('population-stock-repeat', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', quantity: 5, action: 'add' } }]);
  s.commit('population-move-b-repeat', [{ operation: 'relation.move', data: { sourceId: 'population', targetId: 'location-b' } }]);
  s.commit('population-move-back-a-repeat', [{ operation: 'relation.move', data: { sourceId: 'population', targetId: 'location-a' } }]);

  const beforeStaleCorrection = JSON.stringify(s.db.stock);
  s.commit('population-move-b-stale-correct', [{ operation: 'relation.move.correct', data: { correctsEventId: 'population-move-b-repeat' } }]);
  const moved = s.db.relations.find(row => row.history.some(entry => entry.eventId === 'population-move-b-repeat' && entry.action === 'created_by_move'));
  assert.equal(moved.voidedByEventId, 'population-move-b-stale-correct');
  assert.equal(JSON.stringify(s.db.stock), beforeStaleCorrection, 'a superseded move must not reverse current stock');
  assert.equal(E.activeLocation(s.db, 'population').id, 'location-a');

  const beforeDuplicate = JSON.stringify(s.db);
  assert.throws(
    () => s.commit('population-move-b-stale-correct-twice', [{ operation: 'relation.move.correct', data: { correctsEventId: 'population-move-b-repeat' } }]),
    /deja corectată/
  );
  assert.equal(JSON.stringify(s.db), beforeDuplicate);
});

test('relation.create.correct nu poate șterge un membru dacă ar crea sold negativ după vânzare', () => {
  const s = setup();
  s.commit('individual-create-for-sale', [{ operation: 'entity.create', target: 'individual', data: { name: 'Shrimp sold', type: 'individual' } }]);
  s.commit('population-member-for-sale', [{ operation: 'relation.create', data: { sourceId: 'population', targetId: 'individual', type: 'contains' } }]);
  s.commit('population-member-sold', [{ operation: 'stock.change', data: { populationId: 'population', quantity: 1, action: 'sell' } }]);

  const before = JSON.stringify(s.db);
  assert.throws(
    () => s.commit('population-member-sale-correct', [{ operation: 'relation.create.correct', data: { correctsEventId: 'population-member-for-sale' } }]),
    /sold activ negativ/
  );
  assert.equal(JSON.stringify(s.db), before, 'rejected relation correction must roll back relation and stock projections');
});


test('stock.change izolează soldul după populație și locație și permite epuizarea exactă', () => {
  const s = setup();
  s.commit('stock-primary-a', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', quantity: 5, action: 'add', certainty: 'estimated' } }]);
  s.commit('stock-primary-b', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-b', quantity: 4, action: 'add' } }]);
  s.commit('stock-other-population', [{ operation: 'stock.change', data: { populationId: 'item', locationId: 'location-a', quantity: 6, action: 'add' } }]);

  assert.equal(s.db.stock.find(row => row.eventId === 'stock-primary-a').certainty, 'estimated');
  s.commit('stock-partial-sale', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', quantity: 2, action: 'sell' } }]);
  assert.equal(balance(s.db, 'population', 'location-a'), 3);
  assert.equal(balance(s.db, 'population', 'location-b'), 4);
  assert.equal(balance(s.db, 'item', 'location-a'), 6);

  s.commit('stock-exact-sale', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', quantity: 3, action: 'sell' } }]);
  assert.equal(balance(s.db, 'population', 'location-a'), 0);
  assert.equal(balance(s.db, 'population', 'location-a', 'sold'), 5);
  assert.equal(balance(s.db, 'population', 'location-b'), 4);
  assert.equal(balance(s.db, 'item', 'location-a'), 6);

  const before = JSON.stringify(s.db);
  assert.throws(
    () => s.commit('stock-sale-after-exhaustion', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', quantity: 1, action: 'sell' } }]),
    /Cantitate insuficientă/
  );
  assert.equal(JSON.stringify(s.db), before);
});

test('stock.change mută cantitatea între locații și respinge destinații invalide atomic', () => {
  const s = setup();
  s.commit('stock-move-seed', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', quantity: 5, action: 'add' } }]);
  s.commit('stock-move-out', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', destinationId: 'location-b', quantity: 2, action: 'move_out', certainty: 'estimated' } }]);

  assert.equal(balance(s.db, 'population', 'location-a'), 3);
  assert.equal(balance(s.db, 'population', 'location-b'), 2);
  const movedIn = s.db.stock.find(row => row.eventId === 'stock-move-out' && row.action === 'move_in');
  const movedOut = s.db.stock.find(row => row.eventId === 'stock-move-out' && row.action === 'move_out');
  assert.equal(movedIn.quantity, 2);
  assert.equal(movedIn.locationId, 'location-b');
  assert.equal(movedIn.sourceLocationId, 'location-a');
  assert.equal(movedIn.certainty, 'estimated');
  assert.equal(movedOut.quantity, -2);
  assert.equal(movedOut.locationId, 'location-a');

  const before = JSON.stringify(s.db);
  assert.throws(
    () => s.commit('stock-move-missing-destination', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', destinationId: 'missing', quantity: 1, action: 'move_out' } }]),
    /Destinația nu este o locație validă/
  );
  assert.throws(
    () => s.commit('stock-move-non-location-destination', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', destinationId: 'other', quantity: 1, action: 'move_out' } }]),
    /Destinația nu este o locație validă/
  );
  assert.throws(
    () => s.commit('stock-move-insufficient', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', destinationId: 'location-b', quantity: 4, action: 'move_out' } }]),
    /Cantitate insuficientă/
  );
  assert.equal(JSON.stringify(s.db), before);
});

test('stock.change dispose scade soldul activ și păstrează dispoziția și acțiunea', () => {
  const s = setup();
  s.commit('stock-dispose-seed', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', quantity: 5, action: 'add' } }]);
  s.commit('stock-dispose', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', quantity: 2, action: 'dispose' } }]);

  assert.equal(balance(s.db, 'population', 'location-a'), 3);
  assert.equal(balance(s.db, 'population', 'location-a', 'disposed'), 2);
  const disposed = s.db.stock.find(row => row.eventId === 'stock-dispose' && row.action === 'dispose');
  assert.equal(disposed.disposition, 'disposed');
  assert.equal(disposed.quantity, 2);
  assert.equal(s.db.stock.find(row => row.eventId === 'stock-dispose' && row.disposition === 'active').quantity, -2);
});

test('stock.change păstrează aliasul entityId, locația nulă și valorile implicite', () => {
  const s = setup();
  s.commit('stock-legacy-alias', [{ operation: 'stock.change', data: { entityId: 'population', quantity: 2 } }]);

  const row = s.db.stock.find(entry => entry.eventId === 'stock-legacy-alias');
  assert.equal(row.populationId, 'population');
  assert.equal(row.locationId, null);
  assert.equal(row.disposition, 'active');
  assert.equal(row.action, 'add');
  assert.equal(row.certainty, 'certain');
  assert.equal(E.balances(s.db).find(entry => entry.populationId === 'population' && entry.locationId === null && entry.disposition === 'active').quantity, 2);
});
