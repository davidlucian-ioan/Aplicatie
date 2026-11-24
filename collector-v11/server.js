'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { OpenAIProvider } = require('./ai/provider-openai');

// Load a local .env file without an extra dependency. Existing process variables win.
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match || match[1].startsWith('#') || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^(['\"])(.*)\1$/, '$2');
  }
}

const ROOT = __dirname;
const HOST = process.env.COLLECTOR_HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 8000);
const MAX_BODY = 128 * 1024;
const MIME = {
  '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8',
  '.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg',
  '.webp':'image/webp','.ico':'image/x-icon'
};
const hits = new Map();

function send(res, status, value) {
  res.writeHead(status, {
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff'
  });
  res.end(JSON.stringify(value));
}
function rateLimit(ip) {
  const now = Date.now(), windowMs = 60_000;
  const state = hits.get(ip);
  if (!state || now - state.start >= windowMs) {
    hits.set(ip, { start: now, count: 1 });
    return true;
  }
  state.count += 1;
  return state.count <= 20;
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0, chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Cererea este prea mare.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('JSON invalid.'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}
function safeContext(input) {
  const entities = Array.isArray(input.entities) ? input.entities.slice(0, 150) : [];
  const attributes = Array.isArray(input.attributes) ? input.attributes.slice(0, 100) : [];
  return {
    entities: entities.map(e => ({
      id: String(e.id || '').slice(0, 128),
      name: String(e.name || '').slice(0, 160),
      type: String(e.type || 'generic').slice(0, 64)
    })),
    attributes: attributes.map(a => ({
      id: String(a.id || '').slice(0, 128),
      name: String(a.name || '').slice(0, 120),
      type: String(a.type || 'text').slice(0, 64),
      required: Boolean(a.required),
      identifying: Boolean(a.identifying),
      temporal: Boolean(a.temporal),
      min: typeof a.min === 'number' && Number.isFinite(a.min) ? a.min : null,
      max: typeof a.max === 'number' && Number.isFinite(a.max) ? a.max : null
    }))
  };
}
function staticFile(req, res) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400).end('Bad request'); return; }
  if (pathname === '/') pathname = '/index-server.html';
  if (pathname === '/.env' || (pathname.startsWith('/.env.') && pathname !== '/.env.example')) {
    res.writeHead(404).end('Not found'); return;
  }
  const file = path.resolve(ROOT, '.' + pathname);
  if (!file.startsWith(ROOT + path.sep) || file === ROOT || pathname.includes('..')) {
    res.writeHead(403).end('Forbidden'); return;
  }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'no-referrer',
      'Cache-Control':'no-cache'
    });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  if (url.pathname.startsWith('/api/')) {
    if (req.method === 'GET' && url.pathname === '/api/ai/status') {
      return send(res, 200, {
        provider: 'openai',
        configured: Boolean(process.env.OPENAI_API_KEY),
        model: process.env.OPENAI_MODEL || 'gpt-6.2-sol'
      });
    }
    if (req.method !== 'POST' || url.pathname !== '/api/ai/interpret') {
      return send(res, 404, { error: 'Endpoint inexistent.' });
    }
    if (!rateLimit(req.socket.remoteAddress || 'local')) return send(res, 429, { error: 'Prea multe cereri. Încearcă din nou peste un minut.' });
    const origin = req.headers.origin;
    if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return send(res, 403, { error: 'Origine nepermisă.' });
    }
    try {
      const body = await readJson(req);
      if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 8000) {
        return send(res, 400, { error: 'Textul trebuie să aibă între 1 și 8000 de caractere.' });
      }
      if (!process.env.OPENAI_API_KEY) return send(res, 503, { error: 'Configurează OPENAI_API_KEY în mediul serverului pentru a activa AI.' });
      const provider = new OpenAIProvider();
      const interpretation = await provider.interpret({
        text: body.text,
        context: safeContext(body.context || {})
      });
      return send(res, 200, { provider: 'openai', model: provider.model, interpretation });
    } catch (error) {
      const status = error.status === 429 ? 429 : error.status === 401 || error.status === 403 ? 502 : error.status || 502;
      return send(res, status, { error: status >= 500 ? 'OpenAI nu a putut procesa cererea. Verifică cheia, modelul și limitele API.' : error.message });
    }
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow:'GET, HEAD' }).end('Method not allowed'); return;
  }
  staticFile(req, res);
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`Collector server: http://${HOST}:${PORT}/index-server.html\\n`);
  process.stdout.write(`OpenAI provider: ${process.env.OPENAI_API_KEY ? 'configured' : 'not configured'}\\n`);
});
