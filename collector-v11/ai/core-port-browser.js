(function (root) {
  'use strict';
  const ALLOWED = new Set([
    'entity.create', 'entity.rename', 'attribute.set', 'attribute.define',
    'relation.create', 'relation.close', 'relation.move',
    'stock.change', 'stock.adjust', 'finance.record', 'event.note',
    'event.attribute.set', 'relation.attribute.set'
  ]);
  const HIGH_RISK = new Set([
    'relation.close', 'relation.move', 'stock.change', 'stock.adjust', 'finance.record',
    'event.invalidate', 'stock.reverse', 'entity.rename.correct', 'attribute.correct',
    'relation.create.correct', 'relation.move.correct', 'relation.close.correct'
  ]);
  const clone = value => structuredClone(value);
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

  function validate(command) {
    if (!isObject(command) || command.contractVersion !== 'collector.command.v1') {
      throw new TypeError('Contract invalid: collector.command.v1 este obligatoriu.');
    }
    if (typeof command.intent !== 'string' || !command.intent.trim() || command.intent.length > 128) {
      throw new TypeError('Comanda nu are un intent valid.');
    }
    if (!Array.isArray(command.operations) || !command.operations.length || command.operations.length > 50) {
      throw new TypeError('Comanda trebuie să conțină între 1 și 50 de operații.');
    }
    for (const [index, op] of command.operations.entries()) {
      if (!isObject(op) || typeof op.operation !== 'string' || !op.operation.trim() || op.operation.length > 128) {
        throw new TypeError(`Operația ${index + 1} este invalidă.`);
      }
      if (op.target !== undefined && (typeof op.target !== 'string' || !op.target.trim() || op.target.length > 128)) {
        throw new TypeError(`Ținta operației ${index + 1} este invalidă.`);
      }
      if (!isObject(op.data)) {
        throw new TypeError(`Datele operației ${index + 1} trebuie să fie un obiect.`);
      }
    }
    if (typeof command.idempotencyKey !== 'string' || !command.idempotencyKey.trim() || command.idempotencyKey.length > 200) {
      throw new TypeError('Comanda nu are un idempotencyKey valid.');
    }
    if (command.turnId !== undefined && (typeof command.turnId !== 'string' || command.turnId.length > 128)) {
      throw new TypeError('turnId este invalid.');
    }
    if (command.payload !== undefined && !isObject(command.payload)) {
      throw new TypeError('Payload-ul comenzii trebuie să fie un obiect.');
    }
    if (command.requiresConfirmation !== undefined && typeof command.requiresConfirmation !== 'boolean') {
      throw new TypeError('requiresConfirmation trebuie să fie boolean.');
    }
    if (command.certainty !== undefined && !['certain', 'uncertain', 'unknown'].includes(command.certainty)) {
      throw new TypeError('certainty trebuie să fie certain, uncertain sau unknown.');
    }
  }

  class BrowserCorePort {
    constructor({ core, store, allowedOperations = ALLOWED, highRiskOperations = HIGH_RISK,
      idFactory, clock, actor = 'local-user' } = {}) {
      if (!core || typeof core.commit !== 'function' || typeof core.normDb !== 'function' ||
          typeof core.uid !== 'function' || typeof core.now !== 'function') {
        throw new TypeError('Collector Core indisponibil sau incomplet.');
      }
      if (!store || typeof store.getState !== 'function' || typeof store.persistState !== 'function') {
        throw new TypeError('Store local invalid.');
      }
      this.core = core;
      this.store = store;
      this.allowedOperations = new Set(allowedOperations);
      this.highRiskOperations = new Set(highRiskOperations);
      this.idFactory = idFactory || (() => core.uid());
      this.clock = clock || (() => core.now());
      this.actor = actor;
      this.executing = false;
    }

    snapshot() {
      const state = this.store.getState();
      if (!state || typeof state !== 'object') throw new Error('Starea Collector nu este disponibilă.');
      return this.core.normDb(clone(state));
    }

    buildEvent(command, actor = this.actor) {
      validate(command);
      for (const op of command.operations) {
        if (!this.allowedOperations.has(op.operation)) {
          throw new Error(`Operația „${op.operation}” nu este permisă prin Core Port.`);
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

    async read(request = {}) {
      if (!isObject(request)) throw new TypeError('Cererea de citire trebuie să fie un obiect.');
      const state = this.snapshot();
      switch (request.kind) {
        case 'entities': {
          const limit = request.limit === undefined ? 20 : Number(request.limit);
          if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new TypeError('Limită de entități invalidă.');
          return clone(state.entities.filter(entity =>
            (!request.type || entity.type === request.type) &&
            (!request.id || entity.id === request.id) &&
            (!request.name || entity.name.toLocaleLowerCase().includes(request.name.toLocaleLowerCase())))
            .slice(0, limit)
            .map(({ id, name, type, status }) => ({ id, name, type, status })));
        }
        case 'entityAttributes': {
          const entity = state.entities.find(item => item.id === request.id);
          if (!entity) return { found: false, id: request.id };
          const selected = request.attributeNames?.length
            ? Object.fromEntries(request.attributeNames.filter(name => Object.prototype.hasOwnProperty.call(entity.attributes || {}, name))
              .map(name => [name, entity.attributes[name]]))
            : clone(entity.attributes || {});
          return { found: true, id: entity.id, name: entity.name, type: entity.type, attributes: selected };
        }
        case 'balances':
          return clone(this.core.balances(state).filter(row =>
            (!request.populationId || row.populationId === request.populationId) &&
            (!request.locationId || row.locationId === request.locationId)));
        case 'finance':
          return clone(this.core.totalFinance(state));
        case 'events': {
          const limit = request.limit === undefined ? 20 : Number(request.limit);
          if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new TypeError('Limită de istoric invalidă.');
          return clone(state.events.filter(event =>
            (!request.entityId || event.payload?.entityId === request.entityId ||
              event.operations?.some(op => op.target === request.entityId || op.data?.entityId === request.entityId ||
                op.data?.populationId === request.entityId || op.data?.sourceId === request.entityId ||
                op.data?.targetId === request.entityId)))
            .slice(-limit));
        }
        case 'relations': {
          const related = state.relations.filter(relation =>
            relation.sourceId === request.entityId || relation.targetId === request.entityId);
          return clone(related.map(relation => {
            const source = state.entities.find(entity => entity.id === relation.sourceId);
            const target = state.entities.find(entity => entity.id === relation.targetId);
            return {
              id: relation.id, type: relation.type, sourceId: relation.sourceId,
              sourceName: source?.name || null, targetId: relation.targetId,
              targetName: target?.name || null, startedAt: relation.startedAt,
              endedAt: relation.endedAt
            };
          }));
        }
        default:
          throw new Error('Tip de citire nepermis.');
      }
    }
    async preview(command) {
      const event = this.buildEvent(command), current = this.snapshot();
      let result;
      try { result = this.core.commit(current, event); }
      catch (error) { return { status: 'rejected', errors: [String(error?.message || error)] }; }
      if (result.duplicate) return { status: 'duplicate', eventId: result.event?.id || null };
      return {
        status: 'preview_ok', eventId: result.event.id,
        affectedEntities: this.affectedEntities(event.operations),
        projectionChanges: {
          entities: result.db.entities.length - current.entities.length,
          relations: result.db.relations.length - current.relations.length,
          stock: result.db.stock.length - current.stock.length,
          finance: result.db.finance.length - current.finance.length
        }
      };
    }

    async execute(command, { confirmed = false, actor = this.actor } = {}) {
      const event = this.buildEvent(command, actor);
      const risky = event.operations.some(op => this.highRiskOperations.has(op.operation));
      if ((risky || command.requiresConfirmation === true) && confirmed !== true) {
        return { status: 'rejected', errors: ['Este necesară confirmarea explicită a utilizatorului.'] };
      }
      if (this.executing) return { status: 'conflict', errors: ['Există deja o comandă AI în curs de persistare.'] };
      this.executing = true;
      try {
        const current = this.snapshot();
        let result;
        try { result = this.core.commit(current, event); }
        catch (error) { return { status: 'rejected', errors: [String(error?.message || error)] }; }
        if (result.duplicate) return { status: 'duplicate', eventId: result.event?.id || null };
        let persisted;
        try { persisted = await this.store.persistState(clone(result.db)); }
        catch (error) { return { status: 'unavailable', errors: [`Persistența a eșuat: ${error.message}`] }; }
        if (persisted !== true) {
          return { status: 'unavailable', errors: ['Persistența a eșuat; starea activă nu a fost publicată.'] };
        }
        let warnings = [];
        if (typeof this.store.publishState === 'function') {
          try { await this.store.publishState(clone(result.db)); }
          catch (error) { warnings = [`Datele au fost salvate, dar interfața nu a putut fi actualizată: ${error.message}`]; }
        }
        return {
          status: 'committed', eventId: result.event.id,
          affectedEntities: this.affectedEntities(event.operations),
          projectionChanges: {
            entities: result.db.entities.length - current.entities.length,
            relations: result.db.relations.length - current.relations.length,
            stock: result.db.stock.length - current.stock.length,
            finance: result.db.finance.length - current.finance.length
          },
          warnings
        };
      } finally {
        this.executing = false;
      }
    }

    affectedEntities(operations) {
      return [...new Set(operations.flatMap(op => [
        op.target, op.entityId, op.data?.entityId, op.data?.populationId,
        op.data?.sourceId, op.data?.targetId
      ]).filter(Boolean))];
    }
  }

  root.CollectorBrowserCorePort = BrowserCorePort;
  if (typeof module !== 'undefined' && module.exports) module.exports = { BrowserCorePort, ALLOWED, HIGH_RISK };
})(typeof window !== 'undefined' ? window : globalThis);
