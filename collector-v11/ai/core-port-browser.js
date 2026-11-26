(function (root) {
  'use strict';
  const ALLOWED = new Set(['entity.create','entity.rename','attribute.set','attribute.define','relation.create','relation.close','relation.move','stock.change','stock.adjust','finance.record','event.note','event.attribute.set','relation.attribute.set']);
  const HIGH_RISK = new Set(['relation.close','relation.move','stock.change','stock.adjust','finance.record']);
  const clone = value => structuredClone(value);
  function validate(command) {
    if (!command || command.contractVersion !== 'collector.command.v1') throw new TypeError('Contract invalid: collector.command.v1 este obligatoriu.');
    if (typeof command.intent !== 'string' || !command.intent.trim()) throw new TypeError('Comanda nu are intent.');
    if (!Array.isArray(command.operations) || !command.operations.length) throw new TypeError('Comanda nu conține operații.');
    if (typeof command.idempotencyKey !== 'string' || !command.idempotencyKey.trim()) throw new TypeError('Comanda nu are idempotencyKey.');
    for (const op of command.operations) if (!op || typeof op.operation !== 'string') throw new TypeError('Operație invalidă.');
  }
  class BrowserCorePort {
    constructor({ core, store }) {
      if (!core || typeof core.commit !== 'function' || typeof core.normDb !== 'function') throw new TypeError('Collector Core indisponibil.');
      if (!store || typeof store.getState !== 'function' || typeof store.persistState !== 'function' || typeof store.readPersistedState !== 'function') throw new TypeError('Store local invalid: getState/persistState/readPersistedState sunt obligatorii.');
      this.core=core; this.store=store;
    }
    snapshot(){ const state=this.store.getState(); if(!state) throw new Error('Starea Collector nu este disponibilă.'); return this.core.normDb(clone(state)); }
    buildEvent(command){
      validate(command);
      for(const op of command.operations) if(!ALLOWED.has(op.operation)) throw new Error(`Operația „${op.operation}” nu este permisă prin Core Port.`);
      return {id:this.core.uid(),type:'ai.command',timestamp:this.core.now(),source:'ai-foundation',actor:'local-user',certainty:command.certainty||'certain',intentKey:command.idempotencyKey,payload:{...(command.payload||{}),turnId:command.turnId||null,intent:command.intent||null},operations:clone(command.operations)};
    }
    async read(request={}) {
      const s=this.snapshot();
      if(request.kind==='entities') return clone(s.entities.filter(e=>(!request.type||e.type===request.type)&&(!request.id||e.id===request.id)));
      if(request.kind==='balances') return clone(this.core.balances(s).filter(x=>(!request.populationId||x.populationId===request.populationId)&&(!request.locationId||x.locationId===request.locationId)));
      if(request.kind==='finance') return clone(this.core.totalFinance(s));
      if(request.kind==='events') return clone(s.events.filter(e=>!request.entityId||e.payload?.entityId===request.entityId||e.operations?.some(o=>o.target===request.entityId||o.data?.entityId===request.entityId)).slice(-Math.min(Math.max(Number(request.limit)||20,1),100)));
      throw new Error('Tip de citire nepermis.');
    }
    async preview(command){
      const ev=this.buildEvent(command), current=this.snapshot(), result=this.core.commit(current,ev);
      if(result.duplicate) return {status:'duplicate',eventId:result.event?.id||null};
      return {status:'preview_ok',eventId:result.event.id,affectedEntities:[...new Set(ev.operations.flatMap(o=>[o.target,o.data?.entityId,o.data?.populationId,o.data?.sourceId,o.data?.targetId].filter(Boolean)))],projectionChanges:{entities:result.db.entities.length-current.entities.length,relations:result.db.relations.length-current.relations.length,stock:result.db.stock.length-current.stock.length,finance:result.db.finance.length-current.finance.length}};
    }
    async execute(command,{confirmed=false}={}){
      const ev=this.buildEvent(command), risky=ev.operations.some(o=>HIGH_RISK.has(o.operation));
      if((risky||command.requiresConfirmation===true)&&confirmed!==true) return {status:'rejected',errors:['Este necesară confirmarea explicită a utilizatorului.']};
      const current=this.snapshot(), result=this.core.commit(current,ev);
      if(result.duplicate){
        let verifiedState;
        try {
          const persistedState=await this.store.readPersistedState();
          if(!persistedState||typeof persistedState!=='object'||!Array.isArray(persistedState.events))throw new Error('Starea recitită nu conține jurnalul de evenimente.');
          verifiedState=typeof this.core.validateImport==='function'?this.core.validateImport(clone(persistedState)):this.core.normDb(clone(persistedState));
          const prior=result.event;
          const persistedEvent=verifiedState.events.find(item=>item.id===prior?.id&&item.intentKey===command.idempotencyKey);
          if(!persistedEvent)throw new Error('Evenimentul deja procesat nu a fost găsit în jurnalul persistent.');
          if(JSON.stringify(persistedEvent.operations)!==JSON.stringify(prior.operations))throw new Error('Operațiile evenimentului deja procesat diferă de jurnalul persistent.');
          if(this.store.publishState)await this.store.publishState(clone(verifiedState));
          return {status:'duplicate',eventId:persistedEvent.id,persistenceVerified:true};
        } catch(error) {
          try { if(typeof this.store.onVerificationFailure==='function')this.store.onVerificationFailure(error); } catch(_) {}
          return {status:'verification_failed',eventId:result.event?.id||null,errors:[`Verificarea comenzii deja procesate a eșuat: ${error.message}`]};
        }
      }
      let persistConfirmed=false, persistError=null;
      try { persistConfirmed=await this.store.persistState(clone(result.db))===true; }
      catch(error) { persistError=error; }
      let verifiedState;
      try {
        const persistedState = await this.store.readPersistedState();
        if (!persistedState || typeof persistedState !== 'object' || !Array.isArray(persistedState.events)) throw new Error('Starea recitită nu conține jurnalul de evenimente.');
        verifiedState = typeof this.core.validateImport === 'function'
          ? this.core.validateImport(clone(persistedState))
          : this.core.normDb(clone(persistedState));
        const persistedEvent = verifiedState.events.find(item => item.id === ev.id && item.intentKey === command.idempotencyKey);
        if (!persistedEvent) {
          if (!persistConfirmed || persistError) return {status:'unavailable',eventId:ev.id,errors:[`Commit-ul nu a fost găsit în jurnalul recitit; starea activă nu a fost publicată.${persistError ? ' Persistența a raportat: '+persistError.message : ''}`]};
          throw new Error('Persistența a raportat succes, dar evenimentul confirmat lipsește din jurnalul recitit.');
        }
        if (JSON.stringify(persistedEvent.operations) !== JSON.stringify(ev.operations)) throw new Error('Operațiile recitite diferă de operațiile confirmate.');
      } catch (error) {
        try { if (typeof this.store.onVerificationFailure === 'function') this.store.onVerificationFailure(error); } catch (_) {}
        return {status:'verification_failed',eventId:ev.id,errors:[`Verificarea independentă a persistenței a eșuat: ${error.message}`]};
      }
      if(this.store.publishState) await this.store.publishState(clone(verifiedState));
      return {status:'committed',eventId:ev.id,affectedEntities:[...new Set(ev.operations.flatMap(o=>[o.target,o.data?.entityId,o.data?.populationId,o.data?.sourceId,o.data?.targetId].filter(Boolean)))],projectionChanges:{entities:result.db.entities.length-current.entities.length,relations:result.db.relations.length-current.relations.length,stock:result.db.stock.length-current.stock.length,finance:result.db.finance.length-current.finance.length}};
    }
  }
  root.CollectorBrowserCorePort=BrowserCorePort;
  if(typeof module!=='undefined'&&module.exports) module.exports={BrowserCorePort};
})(typeof window!=='undefined'?window:globalThis);
