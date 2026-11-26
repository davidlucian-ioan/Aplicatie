(function(root){'use strict';
function normalizeName(v){return String(v||'').normalize('NFKC').toLocaleLowerCase().replace(/[’']/g,"'").replace(/[^\\p{L}\\p{N}]+/gu,' ').trim()}
function tokenize(q){return normalizeName(q).split(' ').filter(t=>t.length>=2)}
function searchStructuredMemory(state,query,{limit=30,from=null,to=null}={}){
 if(!state||typeof state!=='object')throw new TypeError('State required');
 const terms=tokenize(query);if(!terms.length)return {entities:[],relations:[],events:[],attributes:[],evidence:[]};
 const entities=Array.isArray(state.entities)?state.entities:[],relations=Array.isArray(state.relations)?state.relations:[],events=Array.isArray(state.events)?state.events:[],eventAttributes=Array.isArray(state.eventAttributes)?state.eventAttributes:[];
 const matched=entities.filter(e=>{const hay=normalizeName([e.name,e.type,...Object.values(e.attributes||{}),...(Array.isArray(e.attributes?.aliases)?e.attributes.aliases:[])].join(' '));return terms.some(t=>hay.includes(t))});
 const ids=new Set(matched.map(e=>e.id)),entityById=new Map(entities.map(e=>[e.id,e]));
 const rel=relations.filter(r=>ids.has(r.sourceId)||ids.has(r.targetId)).map(r=>({...r,sourceName:entityById.get(r.sourceId)?.name||r.sourceId,targetName:entityById.get(r.targetId)?.name||r.targetId}));
 const eventMatches=events.filter(e=>{const ts=Date.parse(e.timestamp||'');if(from&&(!Number.isFinite(ts)||ts<Date.parse(from)))return false;if(to&&(!Number.isFinite(ts)||ts>Date.parse(to)))return false;
 const refs=new Set([e.payload?.entityId,...Object.values(e.payload?.entityIds||{}),...(e.payload?.linkedEntityIds||[]),...(e.operations||[]).flatMap(o=>[o.target,o.data?.entityId,o.data?.sourceId,o.data?.targetId,o.data?.populationId])].filter(Boolean));
 const content=normalizeName(JSON.stringify({payload:e.payload,operations:e.operations}));return [...ids].some(id=>refs.has(id))||terms.some(t=>content.includes(t));
 }).slice(-Math.min(Math.max(Number(limit)||30,1),100));
 const attributes=matched.flatMap(e=>Object.entries(e.attributes||{}).map(([name,value])=>({entityId:e.id,entityName:e.name,name,value,history:e.attributeHistory?.[name]||[]})));
 const evidence=[...matched.map(e=>({kind:'entity',id:e.id,label:e.name,type:e.type})),...rel.map(r=>({kind:'relation',id:r.id,source:r.sourceName,type:r.type,target:r.targetName,at:r.startedAt||r.createdAt||null})),...eventMatches.map(e=>({kind:'event',id:e.id,at:e.timestamp,summary:e.payload?.summary||e.payload?.description||e.operations?.find(o=>o.operation==='event.note')?.data?.description||e.type,certainty:e.certainty,status:e.status})),...attributes.map(a=>({kind:'attribute',entityId:a.entityId,entityName:a.entityName,name:a.name,value:a.value})),...eventAttributes.filter(a=>eventMatches.some(e=>e.id===a.eventId)).map(a=>({kind:'event_attribute',eventId:a.eventId,name:a.name,value:a.value}))];
 return {entities:matched.slice(0,100),relations:rel.slice(0,100),events:eventMatches,attributes,evidence:evidence.slice(0,100)};
}
root.CollectorStructuredRecall={searchStructuredMemory,tokenize};
})(typeof window!=='undefined'?window:globalThis);