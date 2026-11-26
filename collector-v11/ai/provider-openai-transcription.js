'use strict';

const AUDIO_FORMATS = Object.freeze({
  'audio/webm':'webm',
  'audio/mp4':'mp4',
  'audio/mpeg':'mp3',
  'audio/mp3':'mp3',
  'audio/wav':'wav',
  'audio/x-wav':'wav',
  'audio/ogg':'ogg',
  'audio/aac':'aac',
  'audio/m4a':'m4a',
  'audio/x-m4a':'m4a'
});

class OpenAITranscriptionProvider {
  constructor({
    apiKey = process.env.OPENAI_API_KEY,
    model = process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe',
    fetchImpl = globalThis.fetch,
    timeoutMs = 60_000
  } = {}) {
    if (!apiKey) throw new Error('OPENAI_API_KEY nu este configurată pe server.');
    if (typeof fetchImpl !== 'function') throw new TypeError('Fetch API indisponibil.');
    this.apiKey = apiKey;
    this.model = model;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async transcribe({ audio, contentType }) {
    if (!Buffer.isBuffer(audio) || audio.length === 0) {
      throw Object.assign(new TypeError('Înregistrarea audio este goală.'), { status:400 });
    }
    const mime = String(contentType || '').split(';')[0].trim().toLowerCase();
    const extension = AUDIO_FORMATS[mime];
    if (!extension) throw Object.assign(new Error('Format audio neacceptat.'), { status:415 });

    const form = new FormData();
    form.append('file', new Blob([audio], { type:mime }), 'recording.' + extension);
    form.append('model', this.model);
    form.append('response_format', 'json');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + this.apiKey },
        body: form,
        signal: controller.signal
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error('Providerul de transcriere nu a putut procesa înregistrarea.');
        error.status = response.status >= 400 && response.status < 500 ? 422 : 502;
        throw error;
      }
      if (typeof body.text !== 'string' || !body.text.trim()) {
        throw Object.assign(new Error('Providerul nu a returnat un transcript valid.'), { status:502 });
      }
      return { text:body.text.trim(), model:this.model };
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = { OpenAITranscriptionProvider, AUDIO_FORMATS };
