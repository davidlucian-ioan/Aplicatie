'use strict';

const DEFAULT_TTL_MS = 30 * 60 * 1000;

class ContextManager {
  constructor({ ttlMs = DEFAULT_TTL_MS, clock = () => Date.now() } = {}) {
    this.ttlMs = ttlMs;
    this.clock = clock;
    this.sessions = new Map();
  }

  get(userId = 'anonymous') {
    const session = this.sessions.get(userId);
    if (!session) return null;
    if (this.clock() - session.lastActivityAt >= this.ttlMs) {
      this.sessions.delete(userId);
      return null;
    }
    session.lastActivityAt = this.clock();
    return structuredClone(session.value);
  }

  set(value, userId = 'anonymous') {
    this.sessions.set(userId, {
      value: structuredClone(value),
      lastActivityAt: this.clock()
    });
  }

  clear(userId = 'anonymous') {
    this.sessions.delete(userId);
  }
}

module.exports = { ContextManager, DEFAULT_TTL_MS };
