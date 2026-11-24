'use strict';

const CONTRACT_VERSION = 'collector.command.v1';
const INTENTS = new Set(['answer', 'propose', 'clarify', 'refuse', 'model_extension']);
const CORE_STATUSES = new Set(['preview_ok', 'committed', 'duplicate', 'rejected', 'conflict', 'unavailable']);
const MAX_TEXT = 4000;
const MAX_OPERATIONS = 50;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateInput(input) {
  if (!isObject(input)) throw new TypeError('Input-ul trebuie să fie un obiect.');
  if (typeof input.text !== 'string' || !input.text.trim()) {
    throw new TypeError('Mesajul utilizatorului este obligatoriu.');
  }
  if (input.text.length > MAX_TEXT) throw new TypeError('Mesajul depășește limita de 4.000 de caractere.');
  if (input.userId !== undefined && input.userId !== null &&
      (typeof input.userId !== 'string' || input.userId.length > 128)) {
    throw new TypeError('Identificatorul utilizatorului este invalid.');
  }
  if (input.requestId !== undefined &&
      (typeof input.requestId !== 'string' || !input.requestId.trim() || input.requestId.length > 128)) {
    throw new TypeError('requestId este invalid.');
  }
  return {
    text: input.text.trim(),
    source: typeof input.source === 'string' ? input.source : 'text',
    userId: input.userId || null,
    requestId: input.requestId || null,
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
      (typeof result.confidence !== 'number' || !Number.isFinite(result.confidence) ||
       result.confidence < 0 || result.confidence > 1)) {
    throw new TypeError('Confidence trebuie să fie un număr între 0 și 1.');
  }
  if (result.intent === 'clarify' &&
      (typeof result.question !== 'string' || !result.question.trim())) {
    throw new TypeError('O clarificare trebuie să conțină o întrebare.');
  }
  if (result.intent === 'refuse' &&
      result.reason !== undefined && typeof result.reason !== 'string') {
    throw new TypeError('Motivul refuzului trebuie să fie text.');
  }
  if (result.intent === 'propose') {
    if (!isObject(result.command)) throw new TypeError('Propunerea nu conține command.');
    validateCommand(result.command);
  }
  if (result.intent === 'answer') {
    if (typeof result.answer !== 'string' || result.answer.length > MAX_TEXT) {
      throw new TypeError('Răspunsul trebuie să fie text de maximum 4.000 de caractere.');
    }
    if (result.readRequest !== undefined) validateReadRequest(result.readRequest);
  }
  return result;
}

function validateReadRequest(request) {
  if (!isObject(request) || !['entities', 'balances', 'finance', 'events'].includes(request.kind)) {
    throw new TypeError('Cererea de citire AI este invalidă.');
  }
  for (const key of ['type', 'id', 'populationId', 'locationId', 'entityId']) {
    if (request[key] !== undefined &&
        (typeof request[key] !== 'string' || request[key].length > 128)) {
      throw new TypeError(`Filtrul ${key} este invalid.`);
    }
  }
  if (request.limit !== undefined &&
      (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > 100)) {
    throw new TypeError('Limita cererii de istoric trebuie să fie între 1 și 100.');
  }
  return request;
}

function validateCommand(command) {
  if (!isObject(command) || command.contractVersion !== CONTRACT_VERSION) {
    throw new TypeError(`Comanda trebuie să folosească ${CONTRACT_VERSION}.`);
  }
  if (typeof command.intent !== 'string' || !command.intent.trim() || command.intent.length > 128) {
    throw new TypeError('Comanda nu are un intent valid.');
  }
  if (!Array.isArray(command.operations) || command.operations.length === 0 ||
      command.operations.length > MAX_OPERATIONS) {
    throw new TypeError('Comanda trebuie să conțină între 1 și 50 de operații.');
  }
  for (const [index, operation] of command.operations.entries()) {
    if (!isObject(operation) || typeof operation.operation !== 'string' ||
        !operation.operation.trim() || operation.operation.length > 128) {
      throw new TypeError(`Operația ${index + 1} este invalidă.`);
    }
    if (operation.target !== undefined &&
        (typeof operation.target !== 'string' || !operation.target.trim() || operation.target.length > 128)) {
      throw new TypeError(`Ținta operației ${index + 1} este invalidă.`);
    }
    if (!isObject(operation.data)) {
      throw new TypeError(`Datele operației ${index + 1} trebuie să fie un obiect.`);
    }
  }
  if (typeof command.idempotencyKey !== 'string' || !command.idempotencyKey.trim() ||
      command.idempotencyKey.length > 200) {
    throw new TypeError('Comanda nu are un idempotencyKey valid.');
  }
  if (command.turnId !== undefined &&
      (typeof command.turnId !== 'string' || command.turnId.length > 128)) {
    throw new TypeError('turnId este invalid.');
  }
  if (command.payload !== undefined && !isObject(command.payload)) {
    throw new TypeError('Payload-ul comenzii trebuie să fie un obiect.');
  }
  if (command.requiresConfirmation !== undefined && typeof command.requiresConfirmation !== 'boolean') {
    throw new TypeError('requiresConfirmation trebuie să fie boolean.');
  }
  if (command.certainty !== undefined &&
      !['certain', 'uncertain', 'unknown'].includes(command.certainty)) {
    throw new TypeError('certainty trebuie să fie certain, uncertain sau unknown.');
  }
  return command;
}

function validateCoreResult(result) {
  if (!isObject(result) || !CORE_STATUSES.has(result.status)) {
    throw new TypeError('Core a returnat un status necunoscut.');
  }
  if (result.eventId !== undefined && result.eventId !== null && typeof result.eventId !== 'string') {
    throw new TypeError('Core a returnat un eventId invalid.');
  }
  if (result.errors !== undefined &&
      (!Array.isArray(result.errors) || result.errors.some(error => typeof error !== 'string'))) {
    throw new TypeError('Core a returnat o listă de erori invalidă.');
  }
  return result;
}

module.exports = {
  CONTRACT_VERSION, MAX_TEXT, MAX_OPERATIONS,
  validateInput, validateInterpretation, validateReadRequest, validateCommand, validateCoreResult
};
