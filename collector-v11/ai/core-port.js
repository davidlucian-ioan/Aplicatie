'use strict';

const { validateCommand } = require('./contracts');

const DEFAULT_ALLOWED_OPERATIONS = new Set([
  'entity.create', 'entity.rename', 'attribute.set', 'attribute.define',
  'relation.create', 'relation.close', 'relation.move',
  'stock.change', 'stock.adjust', 'finance.record', 'event.note',
  'event.attribute.set', 'relation.attribute.set'
]);

const DEFAULT_HIGH_RISK_OPERATIONS = new Set([
  'relation.close', 'relation.move', 'stock.change', 'stock.adjust', 'finance.record',
  'event.invalidate', 'stock.reverse', 'entity.rename.correct',
  'attribute.correct', 'relation.create.correct', 'relation.move.correct',
  'relation.close.correct'
]);

const clone = value => structuredClone(value);

/**
 * Explicit boundary between AI Foundation and Collector Core.
 * Store contract: getState() -> state; persistState(nextState) -> true on durable success.
 * publishState(nextState) is optional and must only update the UI after persistence.
 */
class CorePort {
  constructor({ core, store, allowedOperations = DEFAULT_ALLOWED_OPERATIONS,
    highRiskOperations = DEFAULT_HIGH_RISK_OPERATIONS, idFactory,
    clock = () => new Date().toISOString(), actor = 'ai-assistant' } = {}) {
    if (!core || typeof core.commit !== 'function' || typeof core.replay !== 'function') {
      throw new TypeError('CorePort are nevoie de engine-ul Collector.');
    }
    if (!store || typeof store.getState !== 'function' || typeof store.persistState !== 'function') {
      throw new TypeError('Store trebuie să expună getState() și persistState().');
    }
    this.core = core;
    this.store = store;
    this.allowedOperations = new Set(allowedOperations);
    this.highRiskOperations = new Set(highRiskOperations);
    this.idFactory = idFactory || (() => core.uid());
    this.clock = clock;
    this.actor = actor;
  }

  async read(request = {}) {
    const state = this._snapshot();
    const kind = request.kind;
    switch (kind) {
      case 'entities':
        return clone(state.entities.filter(entity =>
          (!request.type || entity.type === request.type) &&
          (!request.id || entity.id === request.id)));
      case 'balances':
        return clone(this.core.balances(state).filter(row =>
          (!request.populationId || row.populationId === request.populationId) &&
          (!request.locationId || row.locationId === request.locationId)));
      case 'finance':
        return clone(this.core.totalFinance(state));
      case 'events':
        return clone(state.events.filter(event =>
          (!request.entityId || event.payload?.entityId === request.entityId ||
            event.operations?.some(op => op.target === request.entityId || op.data?.entityId === request.entityId)))
          .slice(-Math.min(Math.max(Number(request.limit) || 20, 1), 100)));
      default:
        throw new Error('Cerere de citire nepermisă sau necunoscută.');
    }
  }

  async preview(command) {
    const event = this._buildEvent(command);
    const current = this._snapshot();
    const result = this.core.commit(current, event);
    if (result.duplicate) return { status: 'duplicate', eventId: result.event?.id || null };
    return {
      status: 'preview_ok', eventId: result.event.id,
      affectedEntities: this._affectedEntities(event.operations),
      projectionChanges: {
        entities: result.db.entities.length - current.entities.length,
        relations: result.db.relations.length - current.relations.length,
        stock: result.db.stock.length - current.stock.length,
        finance: result.db.finance.length - current.finance.length
      }
    };
  }

  async execute(command, { confirmed = false, actor = this.actor } = {}) {
    const event = this._buildEvent(command, actor);
    const risky = event.operations.some(op => this.highRiskOperations.has(op.operation));
    if ((risky || command.requiresConfirmation === true) && confirmed !== true) {
      return { status: 'rejected', errors: ['Este necesară confirmarea explicită a utilizatorului.'] };
    }

    const current = this._snapshot();
    const result = this.core.commit(current, event);
    if (result.duplicate) return { status: 'duplicate', eventId: result.event?.id || null };

    // Durable persistence must succeed before in-memory/UI state is published.
    let persisted;
    try {
      persisted = await this.store.persistState(clone(result.db));
    } catch (error) {
      return { status: 'unavailable', errors: [`Persistența a eșuat: ${error.message}`] };
    }
    if (persisted !== true) {
      return { status: 'unavailable', errors: ['Persistența a eșuat; starea activă nu a fost publicată.'] };
    }
    if (typeof this.store.publishState === 'function') {
      await this.store.publishState(clone(result.db));
    }
    return {
      status: 'committed', eventId: result.event.id,
      affectedEntities: this._affectedEntities(event.operations),
      projectionChanges: {
        entities: result.db.entities.length - current.entities.length,
        relations: result.db.relations.length - current.relations.length,
        stock: result.db.stock.length - current.stock.length,
        finance: result.db.finance.length - current.finance.length
      }
    };
  }

  _snapshot() {
    const state = this.store.getState();
    if (!state || typeof state !== 'object') throw new Error('Core store nu a returnat o stare validă.');
    return this.core.normDb(clone(state));
  }

  _buildEvent(command, actor = this.actor) {
    validateCommand(command);
    for (const operation of command.operations) {
      if (!this.allowedOperations.has(operation.operation)) {
        throw new Error(`Operația „${operation.operation}” nu este permisă pentru AI.`);
      }
    }
    return {
      id: this.idFactory(), type: 'ai.command', timestamp: this.clock(),
      source: 'ai-foundation', actor,
      certainty: command.certainty || 'certain',
      intentKey: command.idempotencyKey,
      payload: { ...(command.payload || {}), turnId: command.turnId || null, intent: command.intent || null },
      operations: clone(command.operations)
    };
  }

  _affectedEntities(operations) {
    return [...new Set(operations.flatMap(op => [
      op.target, op.entityId, op.data?.entityId, op.data?.populationId,
      op.data?.sourceId, op.data?.targetId
    ]).filter(Boolean))];
  }
}

module.exports = { CorePort, DEFAULT_ALLOWED_OPERATIONS, DEFAULT_HIGH_RISK_OPERATIONS };
