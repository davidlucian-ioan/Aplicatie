'use strict';

const { OpenAIResponsesProvider } = require('../ai/provider-openai');
const { createAiGateway } = require('./ai-gateway');

const port = Number(process.env.PORT || 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT invalid.');
}
const allowedOrigins = String(process.env.COLLECTOR_ALLOWED_ORIGINS || '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);

const provider = new OpenAIResponsesProvider();
const server = createAiGateway({
  provider,
  bearerToken: process.env.COLLECTOR_AI_GATEWAY_TOKEN,
  allowedOrigins,
  rateLimit: Number(process.env.COLLECTOR_AI_RATE_LIMIT || 30),
  rateWindowMs: 60000
});

server.listen(port, '0.0.0.0', () => {
  process.stdout.write(`Collector AI gateway listening on port ${port}; provider model: ${process.env.OPENAI_MODEL}.\\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
