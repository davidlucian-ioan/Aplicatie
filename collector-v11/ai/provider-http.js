(function(root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.CollectorAIHttpProvider = api.HttpProvider;
})(typeof window !== 'undefined' ? window : globalThis, function() {
  'use strict';

  class HttpProvider {
    constructor({ endpoint, getAccessToken, fetchImpl = globalThis.fetch, timeoutMs = 20000, maxResponseBytes = 65536 } = {}) {
      if (typeof endpoint !== 'string' || !endpoint.trim()) throw new TypeError('AI gateway endpoint este obligatoriu.');
      const url = new URL(endpoint);
      if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
        throw new TypeError('AI gateway trebuie să folosească HTTPS; HTTP este permis numai pentru localhost.');
      }
      if (typeof getAccessToken !== 'function') throw new TypeError('getAccessToken trebuie injectat de mecanismul de autentificare.');
      if (typeof fetchImpl !== 'function') throw new TypeError('Fetch nu este disponibil.');
      this.endpoint = url.href.endsWith('/') ? url.href : url.href + '/';
      this.getAccessToken = getAccessToken;
      this.fetchImpl = fetchImpl;
      this.timeoutMs = timeoutMs;
      this.maxResponseBytes = maxResponseBytes;
    }

    async _post(path, payload) {
      const token = await this.getAccessToken();
      if (typeof token !== 'string' || !token.trim()) throw new Error('Sesiunea de autentificare pentru AI gateway lipsește sau a expirat.');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetchImpl(new URL(path, this.endpoint), {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`AI gateway a răspuns cu HTTP ${response.status}.`);
        const raw = await response.text();
        if (raw.length > this.maxResponseBytes) throw new Error('Răspunsul AI gateway depășește limita permisă.');
        let data;
        try { data = JSON.parse(raw); }
        catch { throw new TypeError('AI gateway a returnat un răspuns JSON invalid.'); }
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new TypeError('Răspunsul AI gateway trebuie să fie un obiect.');
        return data;
      } catch (error) {
        if (error?.name === 'AbortError' || controller.signal.aborted) throw new Error('AI gateway nu a răspuns în intervalul permis.');
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }

    async interpret({ input, context = null, turnId }) {
      const result = await this._post('v1/interpret', { input, context, turnId });
      if (!result.interpretation || typeof result.interpretation !== 'object' || Array.isArray(result.interpretation)) {
        throw new TypeError('AI gateway nu a returnat interpretation.');
      }
      return result.interpretation;
    }

    async respond({ input, context = null, turnId, readRequest, data }) {
      const result = await this._post('v1/respond', { input, context, turnId, readRequest, data });
      if (typeof result.answer !== 'string' || !result.answer.trim() || result.answer.length > 4000) {
        throw new TypeError('AI gateway nu a returnat un răspuns valid.');
      }
      return result.answer;
    }
  }

  return { HttpProvider };
});
