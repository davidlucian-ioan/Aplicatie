'use strict';

const CONTRACT_VERSION = 'collector.command.v1';
const INTENTS = new Set(['answer', 'propose', 'clarify', 'refuse', 'model_extension']);
const CORE_STATUSES = new Set(['preview_ok', 'committed', 'duplicate', 'rejected', 'conflict', 'unavailable']);
const MAX_TEXT = 4000;
const MAX_OPERATIONS = 50;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeMetadata(value) {
  if (!isObject(value)) return {};
  const metadata = {};
  if (typeof value.language === 'string' && value.language.length <= 35) metadata.language = value.language;
  if (typeof value.transcriptionSource === 'string' && value.transcriptionSource.length <= 64) {
    metadata.transcriptionSource = value.transcriptionSource;
  }
  if (typeof value.transcriptionConfidence === 'number' && Number.isFinite(value.transcriptionConfidence) &&
      value.transcriptionConfidence >= 0 && value.transcriptionConfidence <= 1) {
    metadata.transcriptionConfidence = value.transcriptionConfidence;
  }
  for (const key of ['segmentStartMs', 'segmentEndMs', 'durationMs']) {
    if (typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] >= 0) metadata[key] = value[key];
  }
  if (Number.isInteger(value.segmentIndex) && value.segmentIndex >= 0) metadata.segmentIndex = value.segmentIndex;
  if (typeof value.observedAt === 'string' && value.observedAt.length <= 80 &&
      Number.isFinite(Date.parse(value.observedAt))) metadata.observedAt = value.observedAt;
  return metadata;
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
    metadata: normalizeMetadata(input.metadata)
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
    if (result.readRequest !== undefined) throw new TypeError('O propunere de modificare nu poate include readRequest.');
    validateCommand(result.command);
  } else if (result.command !== undefined && result.command !== null) {
    throw new TypeError('Numai intent=propose poate conține command.');
  }
  if (result.answerSource !== undefined && !['general', 'core'].includes(result.answerSource)) {
    throw new TypeError('answerSource trebuie să fie general sau core.');
  }
  if (result.intent === 'answer') {
    if (typeof result.answer !== 'string' || result.answer.length > MAX_TEXT) {
      throw new TypeError('Răspunsul trebuie să fie text de maximum 4.000 de caractere.');
    }
    if (result.readRequest !== undefined) validateReadRequest(result.readRequest);
    if (result.answerSource === 'core' && result.readRequest === undefined) {
      throw new TypeError('Un răspuns despre datele Collector necesită readRequest.');
    }
  }
  return result;
}

function validateReadRequest(request) {
  const kinds = ['entities', 'entityAttributes', 'balances', 'finance', 'events', 'relations'];
  if (!isObject(request) || !kinds.includes(request.kind)) {
    throw new TypeError('Cererea de citire AI este invalidă.');
  }
  for (const key of ['type', 'id', 'name', 'populationId', 'locationId', 'entityId']) {
    if (request[key] !== undefined &&
        (typeof request[key] !== 'string' || !request[key].trim() || request[key].length > 128)) {
      throw new TypeError(`Filtrul ${key} este invalid.`);
    }
  }
  if (request.kind === 'entities' &&
      !request.id && !request.name && !request.type) {
    throw new TypeError('Căutarea entităților necesită ID, nume sau tip; nu este permisă citirea întregului registru.');
  }
  if (request.kind === 'entityAttributes' && !request.id) {
    throw new TypeError('Citirea atributelor necesită un ID de entitate rezolvat.');
  }
  if (request.kind === 'relations' && !request.entityId) {
    throw new TypeError('Citirea relațiilor necesită un ID de entitate rezolvat.');
  }
  if (request.kind === 'balances' && !request.populationId && !request.locationId) {
    throw new TypeError('Citirea soldurilor necesită o populație sau o locație.');
  }
  if (request.kind === 'events' && !request.entityId) {
    throw new TypeError('Citirea istoricului necesită un ID de entitate rezolvat.');
  }
  if (request.attributeNames !== undefined &&
      (!Array.isArray(request.attributeNames) || request.attributeNames.length > 20 ||
       request.attributeNames.some(name => typeof name !== 'string' || !name.trim() || name.length > 128))) {
    throw new TypeError('Lista atributelor solicitate este invalidă.');
  }
  if (request.limit !== undefined &&
      (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > 100)) {
    throw new TypeError('Limita cererii trebuie să fie între 1 și 100.');
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
  CONTRACT_VERSION, MAX_TEXT, MAX_OPERATIONS, normalizeMetadata,
  validateInput, validateInterpretation, validateReadRequest, validateCommand, validateCoreResult
};
