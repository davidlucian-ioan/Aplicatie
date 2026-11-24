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
  const metadata = validateInput({ text: 'dictare', metadata: {
    language: 'ro-RO', transcriptionConfidence: 0.92, segmentStartMs: 10,
    segmentEndMs: 900, privateNote: 'do-not-forward'
  } }).metadata;
  assert.equal(metadata.language, 'ro-RO');
  assert.equal(metadata.transcriptionConfidence, 0.92);
  assert.equal(metadata.privateNote, undefined);
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
  assert.throws(() => validateInterpretation({ intent: 'answer', answer: 'ok', readRequest: { kind: 'events', entityId: 'entity-1', limit: 1000 } }), /Limita/);
  assert.throws(() => validateInterpretation({ intent: 'answer', answer: 'ok', readRequest: { kind: 'entities' } }), /întregului registru/);
  assert.throws(() => validateInterpretation({ intent: 'answer', answer: 'ok', readRequest: { kind: 'relations' } }), /ID de entitate/);
  assert.doesNotThrow(() => validateInterpretation({ intent: 'answer', answer: 'ok', readRequest: { kind: 'entities', name: 'Monstera' } }));
  assert.doesNotThrow(() => validateInterpretation({ intent: 'answer', answer: 'ok', readRequest: { kind: 'events', entityId: 'entity-1', limit: 50 } }));
});

test('rezultatele Core cu status sau erori malformate sunt respinse', () => {
  assert.throws(() => validateCoreResult({ status: 'unknown' }), /status necunoscut/);
  assert.throws(() => validateCoreResult({ status: 'rejected', errors: 'bad' }), /listă de erori/);
});


test('Core read requests reject unbounded entity, balance and event reads', () => {
  assert.throws(() => validateInterpretation({
    intent: 'answer', answer: 'Am citit registrul.', readRequest: { kind: 'entities' }
  }), /ID, nume sau tip/);
  assert.throws(() => validateInterpretation({
    intent: 'answer', answer: 'Am citit soldurile.', readRequest: { kind: 'balances' }
  }), /populație sau o locație/);
  assert.throws(() => validateInterpretation({
    intent: 'answer', answer: 'Am citit istoricul.', readRequest: { kind: 'events' }
  }), /ID de entitate/);
});

test('answers marked as Core-grounded require a scoped read request', () => {
  assert.throws(() => validateInterpretation({
    intent: 'answer', answer: 'Soldul este 10.', answerSource: 'core'
  }), /necesită readRequest/);
  assert.doesNotThrow(() => validateInterpretation({
    intent: 'answer', answer: 'Informație generală.', answerSource: 'general'
  }));
});
