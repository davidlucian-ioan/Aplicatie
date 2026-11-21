'use strict';

const { randomUUID } = require('node:crypto');
const { validateInput, validateCoreResult } = require('./contracts');
const { decide } = require('./decision-gate');

class Orchestrator {
  constructor({ provider, contextManager, coreAdapter, idFactory = randomUUID }) {
    if (!provider || typeof provider.interpret !== 'function') throw new TypeError('Provider invalid.');
    if (!contextManager || typeof contextManager.get !== 'function' || typeof contextManager.set !== 'function') {
      throw new TypeError('ContextManager invalid.');
    }
    if (!coreAdapter) throw new TypeError('CoreAdapter invalid.');
    this.provider = provider;
    this.contextManager = contextManager;
    this.coreAdapter = coreAdapter;
    this.idFactory = idFactory;
  }

  async handle(rawInput, { execute = false, preview = false } = {}) {
    const input = validateInput(rawInput);
    const turnId = this.idFactory();
    const context = this.contextManager.get(input.userId || 'anonymous');
    const interpretation = await this.provider.interpret({ input, context, turnId });
    const decision = decide(interpretation);

    if (decision.action === 'clarify' || decision.action === 'refuse' || decision.action === 'model_extension') {
      this.contextManager.set({ lastTurnId: turnId, pending: decision }, input.userId || 'anonymous');
      return { turnId, ...decision };
    }

    if (decision.action === 'answer') {
      let data = null;
      if (decision.readRequest) data = await this.coreAdapter.read(decision.readRequest);
      this.contextManager.set({ lastTurnId: turnId }, input.userId || 'anonymous');
      return { turnId, action: 'answer', answer: decision.answer, data };
    }

    if (decision.action === 'propose') {
      if (preview) {
        const result = validateCoreResult(await this.coreAdapter.preview(decision.command));
        this.contextManager.set({ lastTurnId: turnId }, input.userId || 'anonymous');
        return { turnId, action: 'preview', result };
      }
      if (!execute) {
        this.contextManager.set({ lastTurnId: turnId, pending: decision }, input.userId || 'anonymous');
        return { turnId, action: 'proposal', command: decision.command };
      }
      const result = validateCoreResult(await this.coreAdapter.execute(decision.command));
      const success = result.status === 'committed' || result.status === 'duplicate';
      this.contextManager.set({ lastTurnId: turnId, lastExecutionStatus: result.status }, input.userId || 'anonymous');
      return { turnId, action: success ? 'executed' : 'execution_failed', result };
    }

    throw new Error('Orchestrator a primit o decizie nesuportată.');
  }
}

module.exports = { Orchestrator };
