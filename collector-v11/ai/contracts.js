'use strict';

const CONTRACT_VERSION = 'collector.command.v1';
const INTENTS = new Set(['answer', 'propose', 'clarify', 'refuse', 'model_extension']);
const CORE_STATUSES = new Set(['preview_ok', 'committed', 'duplicate', 'rejected', 'conflict', 'unavailable', 'stale_preview']);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateInput(input) {
  if (!isObject(input)) throw new TypeError('Input-ul trebuie să fie un obiect.');
  if (typeof input.text !== 'string' || !input.text.trim()) {
    throw new TypeError('Mesajul utilizatorului este obligatoriu.');
  }
  return {
    text: input.text.trim(),
    source: input.source || 'text',
    userId: input.userId || null,
    receivedAt: input.receivedAt || new Date().toISOString(),
    metadata: isObject(input.metadata) ? input.metadata : {}
  };
}

function validateInterpretation(value) {
  if (!isObject(value) || !INTENTS.has(value.intent)) {
    throw new TypeError('Provider-ul a returnat o intenție invalidă.');
  }
  const result = { ...value };
  if (result.confidence !== undefined &&
      (typeof result.confidence !== 'number' || result.confidence < 0 || result.confidence > 1)) {
    throw new TypeError('Confidence trebuie să fie un număr între 0 și 1.');
  }
  if (result.intent === 'clarify' &&
      (typeof result.question !== 'string' || !result.question.trim())) {
    throw new TypeError('O clarificare trebuie să conțină o întrebare.');
  }
  if (result.intent === 'propose') {
    if (!isObject(result.command)) throw new TypeError('Propunerea nu conține command.');
    validateCommand(result.command);
  }
  if (result.intent === 'answer' && typeof result.answer !== 'string') {
    throw new TypeError('Răspunsul trebuie să fie text.');
  }
  return result;
}

function validateCommand(command) {
  if (!isObject(command) || command.contractVersion !== CONTRACT_VERSION) {
    throw new TypeError(`Comanda trebuie să folosească ${CONTRACT_VERSION}.`);
  }
  if (typeof command.intent !== 'string' || !command.intent.trim()) {
    throw new TypeError('Comanda nu are intent.');
  }
  if (!Array.isArray(command.operations) || command.operations.length === 0) {
    throw new TypeError('Comanda trebuie să conțină cel puțin o operație.');
  }
  for (const [index, operation] of command.operations.entries()) {
    if (!isObject(operation) || typeof operation.operation !== 'string' || !operation.operation.trim()) {
      throw new TypeError(`Operația ${index + 1} este invalidă.`);
    }
  }
  if (typeof command.idempotencyKey !== 'string' || !command.idempotencyKey.trim()) {
    throw new TypeError('Comanda nu are idempotencyKey.');
  }
  return command;
}

function validateCoreResult(result) {
  if (!isObject(result) || !CORE_STATUSES.has(result.status)) {
    throw new TypeError('Core a returnat un status necunoscut.');
  }
  return result;
}

module.exports = {
  CONTRACT_VERSION,
  validateInput,
  validateInterpretation,
  validateCommand,
  validateCoreResult
};
