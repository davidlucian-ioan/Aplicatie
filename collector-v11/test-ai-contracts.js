'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateInput, validateInterpretation, validateCommand, validateCoreResult
} = require('./ai/contracts');

const validCommand = () => ({
  contractVersion: 'collector.command.v1',
  intent: 'stock.change',
  idempotencyKey: 'ai-turn:request-1',
  operations: [{
    operation: 'stock.change',
    data: { populationId: 'p1', locationId: 'l1', action: 'move_out', destinationId: 'l2', quantity: 2 }
  }]
});

test('input-ul impune text nenul și limite de dimensiune', () => {
  assert.throws(() => validateInput({ text: '   ' }), /obligatoriu/);
  assert.throws(() => validateInput({ text: 'x'.repeat(4001) }), /4.000/);
  assert.equal(validateInput({ text: '  Bună  ', requestId: 'r1' }).text, 'Bună');
});

test('comanda acceptă forma Core {operation, target, data} și respinge data non-object', () => {
  assert.equal(validateCommand(validCommand()).operations[0].data.quantity, 2);
  assert.throws(() => validateCommand({ ...validCommand(), operations: [{ operation: 'event.note', data: [] }] }), /obiect/);
  assert.throws(() => validateCommand({ ...validCommand(), operations: [{ operation: 'event.note' }] }), /obiect/);
});

test('comanda respinge operații excesive, idempotency key invalid și certainty necunoscută', () => {
  assert.throws(() => validateCommand({ ...validCommand(), operations: Array.from({ length: 51 }, () => ({ operation: 'event.note', data: {} })) }), /1 și 50/);
  assert.throws(() => validateCommand({ ...validCommand(), idempotencyKey: '' }), /idempotencyKey/);
  assert.throws(() => validateCommand({ ...validCommand(), certainty: 'guaranteed' }), /certainty/);
});

test('cererile de citire sunt limitate la tipuri și intervale permise', () => {
  assert.throws(() => validateInterpretation({ intent: 'answer', answer: 'ok', readRequest: { kind: 'raw-db' } }), /citire AI/);
  assert.throws(() => validateInterpretation({ intent: 'answer', answer: 'ok', readRequest: { kind: 'events', limit: 1000 } }), /Limita/);
  assert.doesNotThrow(() => validateInterpretation({ intent: 'answer', answer: 'ok', readRequest: { kind: 'events', limit: 50 } }));
});

test('rezultatele Core cu status sau erori malformate sunt respinse', () => {
  assert.throws(() => validateCoreResult({ status: 'unknown' }), /status necunoscut/);
  assert.throws(() => validateCoreResult({ status: 'rejected', errors: 'bad' }), /listă de erori/);
});
