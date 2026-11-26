'use strict';
const {normalizeName}=require('./structured-memory');
const MAX_RESULTS=100;
function tokenize(q){return normalizeName(q).split(' ').filter(t=>t.length>=2)}
function searchStructuredMemory(state,query,{limit=30,from=null,to=null}={}){
 if(!state||typeof state!=='object')throw new TypeError('State required');
 const terms=tokenize(query);if(!terms.length)return {entities:[],relations:[],events:[],attributes:[],evidence:[]};
 const entities=Array.isArray(state.entities)?state.entities:[];
 const relations=Array.isArray(state.relations)?state.relations:[];
 const events=Array.isArray(state.events)?state.events:[];
 const attrs=Array.isArray(state.eventAttributes)?state.eventAttributes:[];
 const matched=entities.filter(e=>{const hay=normalizeName([e.name,e.type,...Object.values(e.attributes||{})].join(' '));return terms.some(t=>hay.includes(t));});
 const matchedIds=new Set(matched.map(e=>e.id));
 const relevantRelations=relations.filter(r=>matchedIds.has(r.sourceId)||matchedIds.has(r.targetId));
 const entityById=new Map(entities.map(e=>[e.id,e]));
 const relationEvidence=relevantRelations.map(r=>({...r,sourceName:entityById.get(r.sourceId)?.name||r.sourceId,targetName:entityById.get(r.targetId)?.name||r.targetId}));
 const filteredEvents=events.filter(e=>{
  const ts=Date.parse(e.timestamp||'');if(from&&(!Number.isFinite(ts)||ts<Date.parse(from)))return false;if(to&&(!Number.isFinite(ts)||ts>Date.parse(to)))return false;
  const refs=new Set([e.payload?.entityId,...(e.operations||[]).flatMap(o=>[o.target,o.data?.entityId,o.data?.sourceId,o.data?.targetId,o.data?.populationId])].filter(Boolean));
  const text=normalizeName(JSON.stringify({payload:e.payload,operations:e.operations}));
  return [...matchedIds].some(id=>refs.has(id))||terms.some(t=>text.includes(t));
 }).slice(-Math.min(Math.max(Number(limit)||30,1),MAX_RESULTS));
 const attributeRows=matched.flatMap(e=>Object.entries(e.attributes||{}).map(([name,value])=>({entityId:e.id,entityName:e.name,name,value,history:e.attributeHistory?.[name]||[]})));
 const evidence=[
  ...matched.map(e=>({kind:'entity',id:e.id,label:e.name,type:e.type})),
  ...relationEvidence.map(r=>({kind:'relation',id:r.id,source:r.sourceName,type:r.type,target:r.targetName,at:r.startedAt||r.createdAt||null})),
  ...filteredEvents.map(e=>({kind:'event',id:e.id,at:e.timestamp,summary:e.payload?.summary||e.payload?.description||e.operations?.find(o=>o.operation==='event.note')?.data?.description||e.type,certainty:e.certainty,status:e.status})),
  ...attributeRows.map(a=>({kind:'attribute',entityId:a.entityId,entityName:a.entityName,name:a.name,value:a.value}))
 ];
 return {entities:matched.slice(0,Math.min(limit,MAX_RESULTS)),relations:relationEvidence.slice(0,MAX_RESULTS),events:filteredEvents,attributes:attributeRows,evidence:evidence.slice(0,MAX_RESULTS)};
}
module.exports={searchStructuredMemory,tokenize,MAX_RESULTS};
