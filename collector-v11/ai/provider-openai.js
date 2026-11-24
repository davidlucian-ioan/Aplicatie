'use strict';

const { randomUUID } = require('node:crypto');
const { CONTRACT_VERSION, validateInterpretation } = require('./contracts');

const ALLOWED_OPERATIONS = [
  'entity.create','entity.rename','attribute.set','attribute.define',
  'relation.create','relation.close','relation.move','stock.change',
  'stock.adjust','finance.record','event.note','event.attribute.set',
  'relation.attribute.set'
];

const INTERPRETATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    intent: { type: 'string', enum: ['answer','propose','clarify','refuse'] },
    answer: { type: 'string' },
    question: { type: 'string' },
    confidence: { type: 'number' },
    ambiguities: { type: 'array', items: { type: 'string' } },
    clarificationQuestion: { type: 'string' },
    command_intent: { type: 'string' },
    certainty: { type: 'string', enum: ['certain','uncertain'] },
    requires_confirmation: { type: 'boolean' },
    payload_json: { type: 'string' },
    operations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          operation: { type: 'string', enum: ALLOWED_OPERATIONS },
          target: { type: ['string','null'] },
          data_json: { type: 'string' }
        },
        required: ['operation','target','data_json']
      }
    }
  },
  required: [
    'intent','answer','question','confidence','ambiguities',
    'clarificationQuestion','command_intent','certainty',
    'requires_confirmation','payload_json','operations'
  ]
};

function extractOutputText(response) {
  if (typeof response?.output_text === 'string') return response.output_text;
  for (const item of response?.output || []) {
    if (item.type !== 'message') continue;
    for (const part of item.content || []) {
      if (part.type === 'refusal') throw new Error('Modelul a refuzat interpretarea.');
      if (part.type === 'output_text' && typeof part.text === 'string') return part.text;
    }
  }
  throw new Error('Răspunsul OpenAI nu conține text structurat.');
}

class OpenAIProvider {
  constructor({ apiKey = process.env.OPENAI_API_KEY, model = process.env.OPENAI_MODEL || 'gpt-6.2-sol', fetchImpl = globalThis.fetch, timeoutMs = 30000 } = {}) {
    if (!apiKey) throw new Error('OPENAI_API_KEY nu este configurată pe server.');
    if (typeof fetchImpl !== 'function') throw new TypeError('Fetch API indisponibil.');
    this.apiKey = apiKey;
    this.model = model;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async interpret({ text, context = {} }) {
    if (typeof text !== 'string' || !text.trim()) throw new TypeError('Textul de interpretat este obligatoriu.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          store: false,
          max_output_tokens: 1800,
          instructions: [
            'Ești modulul de interpretare pentru Collector, o aplicație local-first de evidență universală.',
            'Transformă cererea utilizatorului într-o propunere structurată sau într-un răspuns/clarificare.',
            'Nu executa operații, nu pretinde că ai salvat date și nu inventa entități, ID-uri, valori sau relații.',
            'Folosește numai ID-urile și definițiile din context. Dacă identificarea este ambiguă, cere o singură clarificare.',
            'Nu modifica schema și nu inventa atribute. Nu converti valori incerte în valori certe.',
            'Operațiile trebuie să folosească exact contractul Collector și numai operațiile permise de schema.',
            'Pentru operații cu efect asupra stocului, relațiilor sau banilor setează requires_confirmation=true.',
            'Răspunde în limba utilizatorului. Câmpurile nefolosite trebuie completate cu șiruri goale, array gol sau valori implicite.',
            'payload_json și data_json trebuie să fie obiecte JSON serializate ca text.'
          ].join(' '),
          input: JSON.stringify({
            user_text: text.trim(),
            collector_context: context
          }),
          text: {
            format: {
              type: 'json_schema',
              name: 'collector_interpretation',
              strict: true,
              schema: INTERPRETATION_SCHEMA
            }
          }
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = body?.error;
        const message = error?.message || `OpenAI API a răspuns cu HTTP ${response.status}.`;
        const err = new Error(message);
        err.status = response.status;
        err.code = error?.code || error?.type || 'openai_error';
        throw err;
      }
      if (body.status && body.status !== 'completed') {
        throw new Error(body.incomplete_details?.reason
          ? `Răspuns OpenAI incomplet: ${body.incomplete_details.reason}`
          : `Răspuns OpenAI nefinalizat: ${body.status}`);
      }
      const parsed = JSON.parse(extractOutputText(body));
      if (!['answer','propose','clarify','refuse'].includes(parsed.intent)) throw new Error('Intenție AI invalidă.');
      if (!Number.isFinite(parsed.confidence) || parsed.confidence < 0 || parsed.confidence > 1) throw new Error('Confidence AI invalid.');
      const interpretation = {
        intent: parsed.intent,
        confidence: parsed.confidence,
        ambiguities: parsed.ambiguities || [],
        answer: parsed.answer || '',
        question: parsed.question || parsed.clarificationQuestion || '',
        clarificationQuestion: parsed.clarificationQuestion || ''
      };
      if (parsed.intent === 'propose') {
        if (!Array.isArray(parsed.operations) || parsed.operations.length === 0) throw new Error('Propunerea AI nu conține operații.');
        interpretation.command = {
          contractVersion: CONTRACT_VERSION,
          intent: parsed.command_intent || 'ai.proposal',
          source: 'ai-openai',
          certainty: parsed.certainty === 'uncertain' ? 'uncertain' : 'certain',
          idempotencyKey: randomUUID(),
          payload: JSON.parse(parsed.payload_json || '{}'),
          operations: parsed.operations.map(op => ({
            operation: op.operation,
            target: op.target || null,
            data: JSON.parse(op.data_json || '{}')
          })),
          requiresConfirmation: Boolean(parsed.requires_confirmation)
        };
      }
      return validateInterpretation(interpretation);
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Cererea către OpenAI a depășit limita de timp.');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

module.exports = { OpenAIProvider, INTERPRETATION_SCHEMA, ALLOWED_OPERATIONS };
