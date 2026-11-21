'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('./engine');

function event(id, intentKey, operations, extra = {}) {
  return {
    id,
    type: 'ai.command',
    timestamp: '2026-11-21T12:00:00.000Z',
    source: 'user',
    actor: 'local-user',
    certainty: 'certain',
    intentKey,
    payload: { source: 'ai-foundation' },
    operations,
    ...extra
  };
}

test('Core primește operațiile în forma { operation, target, data }', () => {
  const initial = Core.emptyState();
  const result = Core.commit(initial, event('evt-1', 'intent-1', [
    { operation: 'entity.create', target: 'population-1', data: { name: 'Fancy Tiger', type: 'population' } },
    { operation: 'entity.create', target: 'location-1', data: { name: 'B1', type: 'location' } },
    { operation: 'stock.change', data: { populationId: 'population-1', locationId: 'location-1', action: 'add', quantity: 5, disposition: 'active' } }
  ]));

  assert.equal(result.duplicate, false);
  assert.equal(result.db.entities.length, 2);
  assert.equal(Core.balances(result.db)[0].quantity, 5);
  assert.equal(initial.events.length, 0);
  assert.equal(initial.entities.length, 0);
});

test('idempotencyKey trebuie mapat la event.intentKey în Core', () => {
  const initial = Core.emptyState();
  const first = Core.commit(initial, event('evt-1', 'same-user-intent', [
    { operation: 'entity.create', target: 'entity-1', data: { name: 'Plant', type: 'plant' } }
  ]));
  const retry = Core.commit(first.db, event('evt-2', 'same-user-intent', [
    { operation: 'entity.create', target: 'entity-2', data: { name: 'Duplicate', type: 'plant' } }
  ]));

  assert.equal(retry.duplicate, true);
  assert.equal(retry.db.entities.length, 1);
  assert.equal(retry.db.events.length, 1);
});

test('o comandă compusă invalidă este atomică: nu modifică starea inițială', () => {
  const initial = Core.emptyState();
  assert.throws(() => Core.commit(initial, event('evt-1', 'intent-1', [
    { operation: 'entity.create', target: 'entity-1', data: { name: 'Temporary', type: 'plant' } },
    { operation: 'stock.change', data: { populationId: 'missing', action: 'add', quantity: 2 } }
  ])), /nu există/);

  assert.equal(initial.entities.length, 0);
  assert.equal(initial.events.length, 0);
  assert.equal(initial.stock.length, 0);
});

test('cantitatea trebuie să fie în operation.data.quantity, nu la rădăcina operației', () => {
  const initial = Core.emptyState();
  const withPopulation = Core.commit(initial, event('evt-1', 'create-population', [
    { operation: 'entity.create', target: 'population-1', data: { name: 'Fancy Tiger', type: 'population' } }
  ])).db;

  assert.throws(() => Core.commit(withPopulation, event('evt-2', 'bad-shape', [
    { operation: 'stock.change', quantity: 5, data: { populationId: 'population-1', action: 'add' } }
  ])), /Cantitatea trebuie să fie un număr pozitiv/);
});
