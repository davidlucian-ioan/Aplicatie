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
  assert.throws(() => s.commit('stock-invalid-action', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', quantity: 1, action: 'transfer' } }]), /Acțiunea de stoc nu este validă/);
  assert.throws(() => s.commit('stock-internal-move-in-action', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', quantity: 1, action: 'move_in' } }]), /Acțiunea de stoc nu este validă/);
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
  assert.throws(() => s.commit('stock-adjust-missing-location', [{ operation: 'stock.adjust', data: { changes: [{ populationId: 'population', locationId: 'missing', quantity: 1 }] } }]), /Locația corectată nu există/);
  assert.throws(() => s.commit('stock-adjust-non-location', [{ operation: 'stock.adjust', data: { changes: [{ populationId: 'population', locationId: 'item', quantity: 1 }] } }]), /Locația corectată nu există/);
  assert.throws(() => s.commit('stock-adjust-negative', [{ operation: 'stock.adjust', data: { correctsEventId: 'stock-seed', changes: [{ populationId: 'population', locationId: 'location-a', quantity: -4 }] } }]), /sold (?:activ )?negativ/);
  assert.equal(JSON.stringify(s.db), before);

  s.commit('stock-sell-for-adjust', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', quantity: 2, action: 'sell' } }]);
  const beforeSold = JSON.stringify(s.db);
  assert.throws(
    () => s.commit('stock-adjust-sold-negative', [{ operation: 'stock.adjust', data: { changes: [{ populationId: 'population', locationId: 'location-a', disposition: 'sold', quantity: -3 }] } }]),
    /sold negativ/
  );
  assert.equal(JSON.stringify(s.db), beforeSold);

  s.commit('stock-dispose-for-adjust', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', quantity: 1, action: 'dispose' } }]);
  const beforeDisposed = JSON.stringify(s.db);
  assert.throws(
    () => s.commit('stock-adjust-disposed-negative', [{ operation: 'stock.adjust', data: { changes: [{ populationId: 'population', locationId: 'location-a', disposition: 'disposed', quantity: -2 }] } }]),
    /sold negativ/
  );
  assert.equal(JSON.stringify(s.db), beforeDisposed);
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
    /sold (?:activ )?negativ/
  );
  assert.equal(JSON.stringify(s.db), before);
});

test('stock.reverse respinge inversarea unei vânzări dacă o ajustare ulterioară a epuizat categoria sold', () => {
  const s = setup();
  s.commit('reverse-old-sale-seed', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', quantity: 5, action: 'add' } }]);
  s.commit('reverse-old-sale', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', quantity: 2, action: 'sell' } }]);
  s.commit('reverse-sold-adjustment', [{ operation: 'stock.adjust', data: { changes: [{ populationId: 'population', locationId: 'location-a', disposition: 'sold', quantity: -2 }] } }]);
  assert.equal(balance(s.db, 'population', 'location-a', 'sold'), 0);

  const before = JSON.stringify(s.db);
  assert.throws(
    () => s.commit('reverse-old-sale-correction', [{ operation: 'stock.reverse', data: { correctsEventId: 'reverse-old-sale' } }]),
    /sold negativ/
  );
  assert.equal(JSON.stringify(s.db), before);
});

test('stock.reverse respinge inversarea unei eliminări dacă o ajustare ulterioară a epuizat categoria disposed', () => {
  const s = setup();
  s.commit('reverse-dispose-seed', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', quantity: 5, action: 'add' } }]);
  s.commit('reverse-dispose', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', quantity: 2, action: 'dispose' } }]);
  s.commit('reverse-disposed-adjustment', [{ operation: 'stock.adjust', data: { changes: [{ populationId: 'population', locationId: 'location-a', disposition: 'disposed', quantity: -2 }] } }]);
  assert.equal(balance(s.db, 'population', 'location-a', 'disposed'), 0);

  const before = JSON.stringify(s.db);
  assert.throws(
    () => s.commit('reverse-dispose-correction', [{ operation: 'stock.reverse', data: { correctsEventId: 'reverse-dispose' } }]),
    /sold negativ/
  );
  assert.equal(JSON.stringify(s.db), before);
});

test('stock.reverse respinge inversarea unei mutări după vânzare din destinație și păstrează atomicitatea', () => {
  const s = setup();
  s.commit('reverse-moved-stock-seed', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', quantity: 5, action: 'add' } }]);
  s.commit('reverse-moved-stock', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', destinationId: 'location-b', quantity: 2, action: 'move_out' } }]);
  s.commit('reverse-moved-stock-sale', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-b', quantity: 1, action: 'sell' } }]);
  const before = JSON.stringify(s.db);

  assert.throws(
    () => s.commit('reverse-partially-consumed-move', [{ operation: 'stock.reverse', data: { correctsEventId: 'reverse-moved-stock' } }]),
    /sold (?:activ )?negativ/
  );
  assert.equal(JSON.stringify(s.db), before);
  assert.equal(balance(s.db, 'population', 'location-a'), 3);
  assert.equal(balance(s.db, 'population', 'location-b'), 1);
});

test('stock.reverse inversează atomic toate efectele unui eveniment compus pe locații și dispoziții', () => {
  const s = setup();
  s.commit('reverse-composite-seed', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', quantity: 10, action: 'add' } }]);

  s.commit('reverse-composite-event', [
    { operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', quantity: 2, action: 'sell' } },
    { operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', quantity: 3, action: 'dispose' } },
    { operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', destinationId: 'location-b', quantity: 1, action: 'move_out' } }
  ]);

  assert.equal(balance(s.db, 'population', 'location-a'), 4);
  assert.equal(balance(s.db, 'population', 'location-a', 'sold'), 2);
  assert.equal(balance(s.db, 'population', 'location-a', 'disposed'), 3);
  assert.equal(balance(s.db, 'population', 'location-b'), 1);
  assert.equal(s.db.stock.filter(row => row.eventId === 'reverse-composite-event').length, 6);

  s.commit('reverse-composite-correction', [{ operation: 'stock.reverse', data: { correctsEventId: 'reverse-composite-event' } }]);

  assert.equal(balance(s.db, 'population', 'location-a'), 10);
  assert.equal(balance(s.db, 'population', 'location-a', 'sold'), 0);
  assert.equal(balance(s.db, 'population', 'location-a', 'disposed'), 0);
  assert.equal(balance(s.db, 'population', 'location-b'), 0);
  assert.equal(s.db.stock.filter(row => row.eventId === 'reverse-composite-correction').length, 6);
});

test('stock.reverse folosește dispoziția activă implicită pentru rândurile legacy fără disposition', () => {
  const s = setup();
  s.commit('reverse-legacy-seed', [{ operation: 'stock.change', data: { populationId: 'population', locationId: null, quantity: 4, action: 'add' } }]);
  const legacyRow = s.db.stock.find(row => row.eventId === 'reverse-legacy-seed');
  delete legacyRow.disposition;

  assert.equal(balance(s.db, 'population', null), 4);
  s.commit('reverse-legacy-correction', [{ operation: 'stock.reverse', data: { correctsEventId: 'reverse-legacy-seed' } }]);
  assert.equal(balance(s.db, 'population', null), 0);
  const inverse = s.db.stock.find(row => row.eventId === 'reverse-legacy-correction');
  assert.equal(inverse.disposition, 'active');
  assert.equal(inverse.locationId, null);
});

test('stock.reverse poate inversa un eveniment stock.adjust fără să dubleze corecția originală', () => {
  const s = setup();
  s.commit('reverse-adjust-seed', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', quantity: 5, action: 'add' } }]);
  s.commit('reverse-adjust-event', [{ operation: 'stock.adjust', data: { changes: [{ populationId: 'population', locationId: 'location-a', quantity: 2 }] } }]);
  assert.equal(balance(s.db), 7);

  s.commit('reverse-adjust-correction', [{ operation: 'stock.reverse', data: { correctsEventId: 'reverse-adjust-event' } }]);
  assert.equal(balance(s.db), 5);
  assert.equal(s.db.stock.filter(row => row.eventId === 'reverse-adjust-correction').length, 1);
  assert.throws(
    () => s.commit('reverse-adjust-correction-twice', [{ operation: 'stock.reverse', data: { correctsEventId: 'reverse-adjust-event' } }]),
    /deja corectate/
  );
  assert.equal(balance(s.db), 5);
});

test('stock.reverse nu dublează o corecție stock.adjust deja legată de evenimentul țintă', () => {
  const s = setup();
  s.commit('reverse-adjusted-seed', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', quantity: 5, action: 'add' } }]);
  s.commit('reverse-adjusted-manual-correction', [{
    operation: 'stock.adjust',
    data: { correctsEventId: 'reverse-adjusted-seed', changes: [{ populationId: 'population', locationId: 'location-a', quantity: 1 }] }
  }]);
  assert.equal(balance(s.db), 6);
  const before = JSON.stringify(s.db);

  assert.throws(
    () => s.commit('reverse-adjusted-seed-again', [{ operation: 'stock.reverse', data: { correctsEventId: 'reverse-adjusted-seed' } }]),
    /deja corectate/
  );
  assert.equal(JSON.stringify(s.db), before);
});

test('Replay face rollback atomic când stock.reverse ar crea un sold negativ', () => {
  const s = setup();
  s.commit('replay-reverse-seed', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', quantity: 5, action: 'add' } }]);
  s.commit('replay-reverse-sale', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', quantity: 2, action: 'sell' } }]);

  const invalidReverse = {
    id: 'replay-reverse-invalid',
    type: 'test.stock.reverse',
    timestamp: new Date(BASE + 100).toISOString(),
    status: 'committed',
    operations: [{ operation: 'stock.reverse', data: { correctsEventId: 'replay-reverse-seed' } }]
  };
  const replayed = E.replay([...s.db.events, invalidReverse]);

  assert.equal(replayed.meta.replayWarnings.filter(row => row.eventId === 'replay-reverse-invalid').length, 1);
  assert.equal(replayed.meta.replayWarnings.filter(row => row.eventId !== 'replay-reverse-invalid').length, 0);
  assert.equal(balance(replayed, 'population', 'location-a'), 3);
  assert.equal(balance(replayed, 'population', 'location-a', 'sold'), 2);
  assert.equal(replayed.stock.some(row => row.eventId === 'replay-reverse-invalid'), false);
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

test('commit și replay validează calendarul, fusul orar ISO și cheile de intenție', () => {
  const s = setup();
  assert.throws(() => s.commit('bad-date', [{ operation: 'event.note', data: { description: 'bad date' } }], { timestamp: '2026-02-30T12:00:00.000Z' }), /timestamp ISO valid/);
  assert.throws(() => s.commit('bad-offset-over-14', [{ operation: 'event.note', data: { description: 'invalid offset' } }], { timestamp: '2026-02-28T12:00:00+14:01' }), /timestamp ISO valid/);
  assert.throws(() => s.commit('bad-offset-over-23', [{ operation: 'event.note', data: { description: 'invalid offset' } }], { timestamp: '2026-02-28T12:00:00-15:00' }), /timestamp ISO valid/);
  const boundary = s.commit('valid-offset-boundary', [{ operation: 'event.note', data: { description: 'valid offset boundary' } }], { timestamp: '2026-02-28T12:00:00+14:00' });
  assert.equal(boundary.event.timestamp, '2026-02-28T12:00:00+14:00');
  assert.throws(() => s.commit('bad-intent', [{ operation: 'event.note', data: { description: 'bad intent' } }], { intentKey: ' padded ' }), /Cheia de intenție/);

  s.commit('intent-first', [{ operation: 'event.note', data: { description: 'intent' } }], { intentKey: 'same-intent' });
  const duplicate = s.commit('intent-second', [{ operation: 'event.note', data: { description: 'duplicate' } }], { intentKey: 'same-intent' });
  assert.equal(duplicate.duplicate, true);

  const replayed = E.replay([
    { id: 'invalid-date', type: 'event.note', timestamp: '2026-02-30T12:00:00.000Z', status: 'committed', operations: [{ operation: 'event.note', data: { description: 'invalid' } }] },
    { id: 'invalid-offset', type: 'event.note', timestamp: '2026-02-28T12:00:00+14:01', status: 'committed', operations: [{ operation: 'event.note', data: { description: 'invalid offset' } }] },
    { id: 'valid-date', type: 'event.note', timestamp: '2026-02-28T12:00:00+14:00', status: 'committed', operations: [{ operation: 'event.note', data: { description: 'valid' } }] }
  ]);
  assert.equal(replayed.meta.replayWarnings.length, 2);
  assert.deepEqual(replayed.meta.replayWarnings.map(row => row.eventId), ['invalid-date', 'invalid-offset']);
});

test('commit deduplică ID-ul evenimentului și intentKey fără să aplice operațiile repetate', () => {
  const s = setup();
  s.commit('commit-idempotent', [{ operation: 'event.note', data: { description: 'original event' } }], { intentKey: 'original-intent' });
  const beforeDuplicateId = JSON.stringify(s.db);
  const duplicateId = s.commit('commit-idempotent', [{ operation: 'entity.create', target: 'must-not-exist', data: { name: 'Duplicate', type: 'generic' } }], { intentKey: 'different-intent' });
  assert.equal(duplicateId.duplicate, true);
  assert.equal(duplicateId.event.id, 'commit-idempotent');
  assert.equal(JSON.stringify(s.db), beforeDuplicateId);
  assert.equal(s.db.entities.some(entity => entity.id === 'must-not-exist'), false);

  const beforeDuplicateIntent = JSON.stringify(s.db);
  const duplicateIntent = s.commit('commit-new-id-same-intent', [{ operation: 'entity.create', target: 'must-not-exist-either', data: { name: 'Duplicate intent', type: 'generic' } }], { intentKey: 'original-intent' });
  assert.equal(duplicateIntent.duplicate, true);
  assert.equal(duplicateIntent.event.id, 'commit-idempotent');
  assert.equal(JSON.stringify(s.db), beforeDuplicateIntent);
  assert.equal(s.db.entities.some(entity => entity.id === 'must-not-exist-either'), false);
});

test('commit este atomic pentru o listă de operații dacă o operație ulterioară e invalidă', () => {
  const s = setup();
  const before = JSON.stringify(s.db);
  assert.throws(
    () => s.commit('commit-composed-invalid', [
      { operation: 'entity.create', target: 'must-rollback', data: { name: 'Temporary', type: 'generic' } },
      { operation: 'stock.change', data: { populationId: 'missing-population', quantity: 2, action: 'add' } }
    ]),
    /nu există/
  );
  assert.equal(JSON.stringify(s.db), before);
  assert.equal(s.db.entities.some(entity => entity.id === 'must-rollback'), false);
});


test('relation.close.correct nu redeschide o a doua locație activă pentru aceeași entitate', () => {
  const s = setup();
  s.commit('located-a-create', [{ operation: 'relation.create', data: { sourceId: 'population', targetId: 'location-a', type: 'located_in' } }]);
  const relationA = s.db.relations.find(row => row.sourceId === 'population' && row.targetId === 'location-a');
  s.commit('located-a-close', [{ operation: 'relation.close', data: { relationId: relationA.id } }]);
  s.commit('located-b-create', [{ operation: 'relation.create', data: { sourceId: 'population', targetId: 'location-b', type: 'located_in' } }]);

  const before = JSON.stringify(s.db);
  assert.throws(
    () => s.commit('located-a-close-correction', [{ operation: 'relation.close.correct', data: { relationId: relationA.id, correctsEventId: 'located-a-close' } }]),
    /altă locație activă/i
  );
  assert.equal(JSON.stringify(s.db), before);
  assert.equal(E.activeLocation(s.db, 'population').id, 'location-b');
});

test('relation.close.correct nu redeschide o relație a cărei creare a fost anulată', () => {
  const s = setup();
  s.commit('voided-relation-create', [{ operation: 'relation.create', data: { sourceId: 'population', targetId: 'location-a', type: 'located_in' } }]);
  const relationId = s.db.relations.find(row => row.sourceId === 'population' && row.targetId === 'location-a').id;
  s.commit('voided-relation-close', [{ operation: 'relation.close', data: { relationId } }]);
  s.commit('voided-relation-create-correction', [{ operation: 'relation.create.correct', data: { correctsEventId: 'voided-relation-create' } }]);
  assert.ok(s.db.relations.find(row => row.id === relationId).voidedByEventId);

  const before = JSON.stringify(s.db);
  assert.throws(
    () => s.commit('voided-relation-close-correction', [{ operation: 'relation.close.correct', data: { relationId, correctsEventId: 'voided-relation-close' } }]),
    /anulată prin corectarea creării/i
  );
  assert.equal(JSON.stringify(s.db), before);
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

test('relation.create.correct anulează toate relațiile create de același eveniment', () => {
  const s = setup();
  s.commit('multi-relation-create', [
    { operation: 'relation.create', data: { sourceId: 'population', targetId: 'item', type: 'related_to' } },
    { operation: 'relation.create', data: { sourceId: 'population', targetId: 'other', type: 'related_to' } }
  ]);
  const created = s.db.relations.filter(row => row.history.some(entry => entry.eventId === 'multi-relation-create' && entry.action === 'created'));
  assert.equal(created.length, 2);

  s.commit('multi-relation-correct', [{ operation: 'relation.create.correct', data: { correctsEventId: 'multi-relation-create' } }]);
  const corrected = s.db.relations.filter(row => row.voidedByEventId === 'multi-relation-correct');
  assert.equal(corrected.length, 2);
  assert.ok(corrected.every(row => row.endedAt));
});

test('relation.create.correct păstrează închiderea anterioară și inversează membrul identificat', () => {
  const s = setup();
  s.commit('individual-create-closed', [{ operation: 'entity.create', target: 'individual', data: { name: 'Shrimp closed', type: 'individual' } }]);
  s.commit('population-member-closed', [{ operation: 'relation.create', data: { sourceId: 'population', targetId: 'individual', type: 'contains' } }]);
  const relation = s.db.relations.find(row => row.history.some(entry => entry.eventId === 'population-member-closed' && entry.action === 'created'));
  s.commit('population-member-close', [{ operation: 'relation.close', data: { relationId: relation.id } }]);
  const closedAt = s.db.relations.find(row => row.id === relation.id).endedAt;
  assert.equal(balance(s.db, 'population', null), 1);

  s.commit('population-member-closed-correct', [{ operation: 'relation.create.correct', data: { correctsEventId: 'population-member-closed' } }]);
  const corrected = s.db.relations.find(row => row.id === relation.id);
  assert.equal(corrected.endedAt, closedAt);
  assert.equal(corrected.voidedByEventId, 'population-member-closed-correct');
  assert.equal(balance(s.db, 'population', null), 0);
});

test('relation.create.correct respinge un eveniment existent fără relații și păstrează atomicitatea', () => {
  const s = setup();
  s.commit('non-relation-event', [{ operation: 'event.note', data: { description: 'no relation created' } }]);
  const before = JSON.stringify(s.db);
  assert.throws(
    () => s.commit('non-relation-correction', [{ operation: 'relation.create.correct', data: { correctsEventId: 'non-relation-event' } }]),
    /Relația creată de evenimentul vizat nu există/
  );
  assert.equal(JSON.stringify(s.db), before);
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

test('relation.move.correct nu redeschide relația precedentă dacă crearea ei a fost anulată', () => {
  const s = setup();
  s.commit('move-prior-create', [{ operation: 'relation.create', data: { sourceId: 'population', targetId: 'location-a', type: 'located_in' } }]);
  s.commit('move-to-b-after-prior-create', [{ operation: 'relation.move', data: { sourceId: 'population', targetId: 'location-b' } }]);
  s.commit('void-prior-location-create', [{ operation: 'relation.create.correct', data: { correctsEventId: 'move-prior-create' } }]);

  const before = JSON.stringify(s.db);
  assert.throws(
    () => s.commit('correct-move-with-voided-previous', [{ operation: 'relation.move.correct', data: { correctsEventId: 'move-to-b-after-prior-create' } }]),
    /relația precedentă a fost deja anulată/i
  );
  assert.equal(JSON.stringify(s.db), before);
  assert.equal(E.activeLocation(s.db, 'population').id, 'location-b');
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
  assert.equal(moved.ignoredCorrectionByEventId, 'population-move-b-stale-correct');
  assert.equal(moved.voidedByEventId, undefined);
  assert.equal(JSON.stringify(s.db.stock), beforeStaleCorrection, 'a superseded move must not reverse current stock');
  assert.equal(E.activeLocation(s.db, 'population').id, 'location-a');

  const beforeDuplicate = JSON.stringify(s.db);
  assert.throws(
    () => s.commit('population-move-b-stale-correct-twice', [{ operation: 'relation.move.correct', data: { correctsEventId: 'population-move-b-repeat' } }]),
    /deja corectată/
  );
  assert.equal(JSON.stringify(s.db), beforeDuplicate);
});

test('relation.move.correct ignoră corecția stale fără să blocheze revenirea ulterioară la locația precedentă', () => {
  const s = setup();
  s.commit('create-location-c', [{ operation: 'entity.create', target: 'location-c', data: { name: 'Depozit C', type: 'location' } }]);
  s.commit('population-located-a-chain', [{ operation: 'relation.create', data: { sourceId: 'population', targetId: 'location-a', type: 'located_in' } }]);
  s.commit('population-stock-chain', [{ operation: 'stock.change', data: { populationId: 'population', locationId: 'location-a', quantity: 5, action: 'add' } }]);
  s.commit('population-move-b-chain', [{ operation: 'relation.move', data: { sourceId: 'population', targetId: 'location-b' } }]);
  s.commit('population-move-c-chain', [{ operation: 'relation.move', data: { sourceId: 'population', targetId: 'location-c' } }]);

  const stockBeforeIgnoredCorrection = JSON.stringify(s.db.stock);
  s.commit('population-move-b-ignored-correction', [{ operation: 'relation.move.correct', data: { correctsEventId: 'population-move-b-chain' } }]);
  const firstMove = s.db.relations.find(row => row.history.some(entry => entry.eventId === 'population-move-b-chain' && entry.action === 'created_by_move'));
  assert.equal(firstMove.ignoredCorrectionByEventId, 'population-move-b-ignored-correction');
  assert.equal(firstMove.voidedByEventId, undefined);
  assert.equal(JSON.stringify(s.db.stock), stockBeforeIgnoredCorrection);
  assert.equal(E.activeLocation(s.db, 'population').id, 'location-c');

  s.commit('population-move-c-correct', [{ operation: 'relation.move.correct', data: { correctsEventId: 'population-move-c-chain' } }]);
  assert.equal(E.activeLocation(s.db, 'population').id, 'location-b');
  assert.equal(balance(s.db, 'population', 'location-b'), 5);
  assert.equal(balance(s.db, 'population', 'location-c'), 0);
  assert.equal(s.db.relations.find(row => row.id === firstMove.id).endedAt, null);
  assert.throws(
    () => s.commit('population-move-b-ignored-correction-twice', [{ operation: 'relation.move.correct', data: { correctsEventId: 'population-move-b-chain' } }]),
    /deja corectată/
  );

  const replayed = E.replay(s.db.events);
  assert.equal(E.activeLocation(replayed, 'population').id, 'location-b');
  assert.equal(balance(replayed, 'population', 'location-b'), 5);
  assert.equal(balance(replayed, 'population', 'location-c'), 0);
  const replayedFirstMove = replayed.relations.find(row => row.history.some(entry => entry.eventId === 'population-move-b-chain' && entry.action === 'created_by_move'));
  assert.equal(replayedFirstMove.ignoredCorrectionByEventId, 'population-move-b-ignored-correction');
});

test('relation.create.correct nu poate șterge un membru dacă ar crea sold negativ după vânzare', () => {
  const s = setup();
  s.commit('individual-create-for-sale', [{ operation: 'entity.create', target: 'individual', data: { name: 'Shrimp sold', type: 'individual' } }]);
  s.commit('population-member-for-sale', [{ operation: 'relation.create', data: { sourceId: 'population', targetId: 'individual', type: 'contains' } }]);
  s.commit('population-member-sold', [{ operation: 'stock.change', data: { populationId: 'population', quantity: 1, action: 'sell' } }]);

  const before = JSON.stringify(s.db);
  assert.throws(
    () => s.commit('population-member-sale-correct', [{ operation: 'relation.create.correct', data: { correctsEventId: 'population-member-for-sale' } }]),
    /sold (?:activ )?negativ/
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
