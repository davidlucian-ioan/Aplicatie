'use strict';

const { randomUUID } = require('node:crypto');
const { validateInput, validateCoreResult } = require('./contracts');
const { decide } = require('./decision-gate');

class Orchestrator {
  constructor({ provider, contextManager, coreAdapter, idFactory = randomUUID }) {
    if (!provider || typeof provider.interpret !== 'function') throw new TypeError('Provider invalid.');
    if (!contextManager || typeof contextManager.get !== 'function' ||
        typeof contextManager.set !== 'function') {
      throw new TypeError('ContextManager invalid.');
    }
    if (!coreAdapter || typeof coreAdapter.read !== 'function' ||
        typeof coreAdapter.preview !== 'function' || typeof coreAdapter.execute !== 'function') {
      throw new TypeError('CoreAdapter invalid.');
    }
    this.provider = provider;
    this.contextManager = contextManager;
    this.coreAdapter = coreAdapter;
    this.idFactory = idFactory;
  }

  async handle(rawInput, { preview = false } = {}) {
    const input = validateInput(rawInput);
    const turnId = this.idFactory();
    const userId = input.userId || 'anonymous';
    const context = this.contextManager.get(userId);
    const interpretation = await this.provider.interpret({ input, context, turnId });
    const decision = decide(interpretation);

    if (decision.action === 'clarify' || decision.action === 'refuse' ||
        decision.action === 'model_extension') {
      this.contextManager.set({ lastTurnId: turnId, pending: decision }, userId);
      return { turnId, ...decision };
    }

    if (decision.action === 'answer') {
      let data = null, answer = decision.answer;
      if (decision.readRequest) {
        data = await this.coreAdapter.read(decision.readRequest);
        // A model must summarize operational facts only after receiving the
        // authoritative Core result, never before the read has completed.
        if (typeof this.provider.respond === 'function') {
          answer = await this.provider.respond({ input, context, turnId, readRequest: decision.readRequest, data });
          if (typeof answer !== 'string' || !answer.trim() || answer.length > 4000) {
            throw new TypeError('Provider-ul a returnat un răspuns invalid pentru datele Core.');
          }
        } else {
          answer = null;
        }
      }
      this.contextManager.set({ lastTurnId: turnId, pending: null }, userId);
      return { turnId, action: 'answer', answer, data };
    }

    if (decision.action === 'propose') {
      // The request ID is supplied by the trusted input gateway, never by the model.
      // It remains stable across transport retries of the same user submission.
      const command = structuredClone(decision.command);
      command.turnId = turnId;
      command.idempotencyKey = 'ai-turn:' + (input.requestId || turnId);

      if (preview) {
        const result = validateCoreResult(await this.coreAdapter.preview(command));
        this.contextManager.set({ lastTurnId: turnId, pending: { action: 'propose', command } }, userId);
        return { turnId, action: 'preview', command, result };
      }

      this.contextManager.set({ lastTurnId: turnId, pending: { action: 'propose', command } }, userId);
      return { turnId, action: 'proposal', command };
    }

    throw new Error('Orchestrator a primit o decizie nesuportată.');
  }

  async confirm({ userId = 'anonymous', turnId } = {}) {
    if (typeof turnId !== 'string' || !turnId.trim()) {
      throw new TypeError('Confirmarea necesită turnId-ul propunerii.');
    }
    const context = this.contextManager.get(userId);
    const pending = context?.pending;
    if (!pending || pending.action !== 'propose' || pending.command?.turnId !== turnId) {
      return { turnId, action: 'confirmation_expired' };
    }

    // This method is the explicit confirmation boundary. It executes the exact
    // command previously shown to the user; it does not ask the model again.
    const result = validateCoreResult(await this.coreAdapter.execute(pending.command, { confirmed: true }));
    const success = result.status === 'committed' || result.status === 'duplicate';
    const keepPending = result.status === 'unavailable' || result.status === 'conflict';
    this.contextManager.set({
      lastTurnId: turnId,
      pending: keepPending ? pending : null,
      lastExecutionStatus: result.status
    }, userId);
    return { turnId, action: success ? 'executed' : 'execution_failed', result };
  }

  cancel({ userId = 'anonymous', turnId } = {}) {
    const context = this.contextManager.get(userId);
    if (!context?.pending || (turnId && context.pending.command?.turnId !== turnId)) {
      return false;
    }
    this.contextManager.set({ lastTurnId: context.lastTurnId || null, pending: null }, userId);
    return true;
  }
}

module.exports = { Orchestrator };
