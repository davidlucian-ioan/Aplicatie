'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { OpenAIProvider } = require('./ai/provider-openai');
const { safeContext } = require('./ai/context-sanitizer');

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
function staticFile(req, res) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400).end('Bad request'); return; }
  if (pathname === '/') pathname = '/index-server.html';
  const segments = pathname.split('/').filter(Boolean);
  const privateFiles = new Set([
    'server.js', 'package.json', 'package-lock.json',
    'provider-openai.js', 'context-sanitizer.js', 'contracts.js'
  ]);
  const basename = path.basename(pathname);
  if (segments.some(segment => segment.startsWith('.')) ||
      privateFiles.has(basename) ||
      /^test[-_].*\.js$/i.test(basename) ||
      /\.(?:test|spec)\.js$/i.test(basename) ||
      /^(?:README|CONTINUARE-PROIECT|OPENAI-INTEGRATION|AI-FOUNDATION-README)\.md$/i.test(basename)) {
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
      'X-Frame-Options':'DENY',
      'Permissions-Policy':'camera=(), microphone=(self), geolocation=()',
      'Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
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
    if (req.method === 'POST' && url.pathname === '/api/ai/transcribe') {
      if (!rateLimit(req.socket.remoteAddress || 'local')) return send(res, 429, { error: 'Prea multe cereri. Încearcă din nou peste un minut.' });
      const origin = req.headers.origin;
      if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return send(res, 403, { error: 'Origine nepermisă.' });
      const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      const extensions = {'audio/webm':'webm','audio/mp4':'mp4','audio/mpeg':'mp3','audio/mp3':'mp3','audio/wav':'wav','audio/x-wav':'wav','audio/ogg':'ogg','audio/aac':'aac','audio/m4a':'m4a','audio/x-m4a':'m4a'};
      if (!extensions[contentType]) return send(res, 415, { error: 'Format audio neacceptat.' });
      if (!process.env.OPENAI_API_KEY) return send(res, 503, { error: 'Configurează OPENAI_API_KEY pentru transcriere.' });
      try {
        const chunks=[];let size=0;
        for await (const chunk of req) { size+=chunk.length;if(size>25*1024*1024){send(res,413,{error:'Audio depășește limita de 25 MB.'});req.resume();return}chunks.push(chunk)}
        if(!size)return send(res,400,{error:'Fișier audio gol.'});
        const form=new FormData();form.append('file',new Blob(chunks,{type:contentType}),'recording.'+extensions[contentType]);
        const model=process.env.OPENAI_TRANSCRIPTION_MODEL||'gpt-4o-mini-transcribe';
        form.append('model',model);form.append('response_format','json');
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
        try{
          const upstream=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY},body:form,signal:controller.signal});
          const data=await upstream.json().catch(()=>({}));
          if(!upstream.ok)return send(res,upstream.status===429?429:502,{error:'Transcrierea OpenAI a eșuat. Verifică providerul și limitele API.'});
          if(typeof data.text!=='string'||!data.text.trim())return send(res,502,{error:'Transcrierea nu a returnat text.'});
          return send(res,200,{text:data.text.trim(),model});
        }finally{clearTimeout(timer)}
      }catch(error){return send(res,502,{error:'Transcrierea audio nu a putut fi finalizată.'})}
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
