'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const { validateInput, validateReadRequest } = require('../ai/contracts');

function sendJson(response, status, value, origin = null) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (origin) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
  }
  response.end(JSON.stringify(value));
}

function readJson(request, maxBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    request.on('data', chunk => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > maxBytes) {
        tooLarge = true;
        chunks.length = 0;
        reject(Object.assign(new Error('Cererea depășește limita permisă.'), { statusCode: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (tooLarge) return;
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(JSON.parse(raw || '{}'));
      } catch {
        reject(Object.assign(new Error('Corpul cererii nu este JSON valid.'), { statusCode: 400 }));
      }
    });
    request.on('error', reject);
  });
}

function safeInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw Object.assign(new TypeError('input trebuie să fie un obiect.'), { statusCode: 400 });
  }
  if ('userId' in value || 'requestId' in value) {
    throw Object.assign(new TypeError('Identificatorii de utilizator și request nu sunt acceptați în payload-ul providerului.'), { statusCode: 400 });
  }
  let parsed;
  try { parsed = validateInput(value); }
  catch (error) { error.statusCode = 400; throw error; }
  return {
    text: parsed.text,
    source: parsed.source,
    receivedAt: parsed.receivedAt,
    metadata: parsed.metadata
  };
}

function safeContext(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw Object.assign(new TypeError('context trebuie să fie un obiect sau null.'), { statusCode: 400 });
  }
  return structuredClone(value);
}

function safeTurnId(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 128) {
    throw Object.assign(new TypeError('turnId invalid.'), { statusCode: 400 });
  }
  return value;
}

function timingSafeTokenMatch(expected, provided) {
  if (typeof expected !== 'string' || !expected || typeof provided !== 'string') return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function createAiGateway({
  provider,
  bearerToken = process.env.COLLECTOR_AI_GATEWAY_TOKEN,
  authorize = null,
  allowedOrigins = [],
  maxBodyBytes = 32768,
  rateLimit = 30,
  rateWindowMs = 60000,
  clock = () => Date.now(),
  logger = null
} = {}) {
  if (!provider || typeof provider.interpret !== 'function' || typeof provider.respond !== 'function') {
    throw new TypeError('Gateway necesită un provider cu interpret() și respond().');
  }
  if (typeof authorize !== 'function' && (typeof bearerToken !== 'string' || bearerToken.length < 24)) {
    throw new Error('Configurează authorize() pentru validarea tokenurilor sau COLLECTOR_AI_GATEWAY_TOKEN de minimum 24 de caractere pentru dezvoltare locală.');
  }
  const origins = new Set(allowedOrigins);
  const buckets = new Map();

  function rateAllowed(key) {
    const now = clock();
    const bucket = buckets.get(key);
    if (!bucket || now - bucket.startedAt >= rateWindowMs) {
      buckets.set(key, { startedAt: now, count: 1 });
      return true;
    }
    if (bucket.count >= rateLimit) return false;
    bucket.count += 1;
    return true;
  }

  const server = http.createServer(async (request, response) => {
    const origin = request.headers.origin || null;
    if (origin && !origins.has(origin)) {
      sendJson(response, 403, { error: 'Origin nepermis.' });
      return;
    }
    if (request.method === 'OPTIONS') {
      if (origin) {
        response.statusCode = 204;
        response.setHeader('Access-Control-Allow-Origin', origin);
        response.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        response.setHeader('Access-Control-Max-Age', '600');
        response.setHeader('Vary', 'Origin');
        response.end();
      } else {
        sendJson(response, 403, { error: 'Origin lipsă.' });
      }
      return;
    }
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, { status: 'ok', providerReady: true }, origin);
      return;
    }
    if (request.method !== 'POST' || !['/v1/interpret', '/v1/respond'].includes(url.pathname)) {
      sendJson(response, 404, { error: 'Endpoint inexistent.' }, origin);
      return;
    }
    const auth = String(request.headers.authorization || '');
    const providedToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const remote = request.socket.remoteAddress || 'unknown';
    let authorized = false;
    try {
      authorized = typeof authorize === 'function'
        ? await authorize({ token: providedToken, request, remoteAddress: remote })
        : timingSafeTokenMatch(bearerToken, providedToken);
    } catch {
      authorized = false;
    }
    if (authorized !== true) {
      sendJson(response, 401, { error: 'Autentificare necesară.' }, origin);
      return;
    }
    if (!rateAllowed(remote)) {
      sendJson(response, 429, { error: 'Limită temporară de cereri depășită.' }, origin);
      return;
    }

    const requestId = crypto.randomUUID();
    try {
      if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
        throw Object.assign(new TypeError('Content-Type application/json este obligatoriu.'), { statusCode: 415 });
      }
      const body = await readJson(request, maxBodyBytes);
      const input = safeInput(body.input);
      const context = safeContext(body.context);
      const turnId = safeTurnId(body.turnId);
      let result;
      if (url.pathname === '/v1/interpret') {
        const interpretation = await provider.interpret({ input, context, turnId });
        if (!interpretation || typeof interpretation !== 'object' || Array.isArray(interpretation)) {
          throw new TypeError('Provider-ul a returnat o interpretare invalidă.');
        }
        result = { interpretation };
      } else {
        try { validateReadRequest(body.readRequest); }
        catch (error) { error.statusCode = 400; throw error; }
        if (!body.data || typeof body.data !== 'object') {
          throw Object.assign(new TypeError('data trebuie să fie un obiect sau un array returnat de Core.'), { statusCode: 400 });
        }
        const answer = await provider.respond({
          input, context, turnId,
          readRequest: body.readRequest,
          data: structuredClone(body.data)
        });
        if (typeof answer !== 'string' || !answer.trim() || answer.length > 4000) {
          throw new TypeError('Provider-ul a returnat un răspuns invalid.');
        }
        result = { answer };
      }
      if (logger) logger({ requestId, route: url.pathname, status: 200 });
      sendJson(response, 200, result, origin);
    } catch (error) {
      const status = Number.isInteger(error.statusCode) ? error.statusCode : 502;
      if (logger) logger({ requestId, route: url.pathname, status, error: error.message });
      sendJson(response, status, { error: status >= 500 ? 'Serviciul AI nu a putut procesa cererea.' : error.message, requestId }, origin);
    }
  });

  return server;
}

module.exports = { createAiGateway, safeInput, safeContext, timingSafeTokenMatch };
