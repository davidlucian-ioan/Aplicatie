'use strict';

const MAX_ENTITIES=30, MAX_FACTS=80, MAX_RELATIONS=60, MAX_TEXT=500;

function record(v){return v&&typeof v==='object'&&!Array.isArray(v)}
function text(v,label,{required=true,max=MAX_TEXT}={}){if(typeof v!=='string'||(required&&!v.trim()))throw new TypeError(label+' invalid');if(v.length>max)throw new TypeError(label+' too long');return v.trim()}
function validateExtraction(input){
 if(!record(input))throw new TypeError('Extraction must be an object');
 const entities=Array.isArray(input.entities)?input.entities:[];
 const facts=Array.isArray(input.facts)?input.facts:[];
 const relations=Array.isArray(input.relations)?input.relations:[];
 if(entities.length>MAX_ENTITIES||facts.length>MAX_FACTS||relations.length>MAX_RELATIONS)throw new RangeError('Extraction exceeds bounded limits');
 const keys=new Set();
 const normalizedEntities=entities.map((e,i)=>{
  if(!record(e))throw new TypeError('Entity '+i+' invalid');
  const key=text(e.key,'entity.key',{max:80});
  if(keys.has(key))throw new TypeError('Duplicate entity key');
  keys.add(key);
  const aliases=Array.isArray(e.aliases)?e.aliases.slice(0,10).map(x=>text(x,'alias',{max:100})): [];
  return {key,name:text(e.name,'entity.name',{max:160}),type:text(e.type||'generic','entity.type',{max:64}),aliases,existingId:typeof e.existingId==='string'?e.existingId:null};
 });
 const normalizedFacts=facts.map((f,i)=>{
  if(!record(f))throw new TypeError('Fact '+i+' invalid');
  if(!keys.has(f.subject))throw new TypeError('Fact subject must reference extracted entity');
  const value=f.value;
  if(value===undefined||value===null||!(typeof value==='string'||typeof value==='number'||typeof value==='boolean'))throw new TypeError('Fact value invalid');
  if(typeof value==='string'&&value.length>MAX_TEXT)throw new TypeError('Fact value too long');
  return {subject:f.subject,name:text(f.name,'fact.name',{max:120}),value,certainty:f.certainty==='uncertain'?'uncertain':'certain',validAt:typeof f.validAt==='string'?f.validAt:null};
 });
 const normalizedRelations=relations.map((r,i)=>{
  if(!record(r)||!keys.has(r.source)||!keys.has(r.target))throw new TypeError('Relation '+i+' references unknown keys');
  if(r.source===r.target)throw new TypeError('Self relation not allowed');
  return {source:r.source,target:r.target,type:text(r.type||'related_to','relation.type',{max:80}),certainty:r.certainty==='uncertain'?'uncertain':'certain'};
 });
 const summary=text(input.summary||'Structured memory capture','summary',{max:1000});
 return {summary,entities:normalizedEntities,facts:normalizedFacts,relations:normalizedRelations,clarification:typeof input.clarification==='string'?input.clarification.slice(0,500):'',confidence:typeof input.confidence==='number'&&input.confidence>=0&&input.confidence<=1?input.confidence:0.5};
}

function normalizeName(v){return String(v||'').normalize('NFKC').toLocaleLowerCase().replace(/[’']/g,"'").replace(/[^\p{L}\p{N}]+/gu,' ').trim()}
function mergeAliases(existing,candidate){const output=[],seen=new Set();for(const alias of [...(Array.isArray(existing)?existing:[]),...(Array.isArray(candidate)?candidate:[])]){if(typeof alias!=='string'||!alias.trim())continue;const key=normalizeName(alias);if(!key||seen.has(key))continue;seen.add(key);output.push(alias.trim())}return output}
function resolveEntities(extraction,state,{threshold=0.92}={}){
 const all=Array.isArray(state?.entities)?state.entities:[];
 return extraction.entities.map(candidate=>{
  if(candidate.existingId){const exact=all.find(e=>e.id===candidate.existingId);if(!exact)throw new Error('Unknown existing entity ID');if(exact.type!==candidate.type)throw new Error('Existing entity type mismatch');return {...candidate,aliases:mergeAliases(exact.attributes?.aliases,candidate.aliases),resolvedId:exact.id,match:'explicit'};}
  const names=[candidate.name,...candidate.aliases].map(normalizeName).filter(Boolean);
  const matches=all.filter(e=>e.type===candidate.type&&(names.includes(normalizeName(e.name))||(Array.isArray(e.attributes?.aliases)&&e.attributes.aliases.some(a=>names.includes(normalizeName(a))))));
  const unique=[...new Map(matches.map(e=>[e.id,e])).values()];
  if(unique.length===1)return {...candidate,aliases:mergeAliases(unique[0].attributes?.aliases,candidate.aliases),resolvedId:unique[0].id,match:'exact'};
  if(unique.length>1)return {...candidate,resolvedId:null,match:'ambiguous',candidateIds:unique.map(e=>e.id)};
  return {...candidate,resolvedId:null,match:'new'};
 });
}

function buildOperations(extraction,resolutions,{idFactory=()=> 'mem-'+Math.random().toString(36).slice(2,12)}={}){
 const map=new Map(),operations=[];
 for(const r of resolutions){
  const id=r.resolvedId||idFactory();
  map.set(r.key,id);
  if(!r.resolvedId)operations.push({operation:'entity.create',target:id,data:{name:r.name,type:r.type}});if(r.aliases?.length)operations.push({operation:'attribute.set',target:id,data:{name:'aliases',value:r.aliases}});
 }
 for(const fact of extraction.facts){const target=map.get(fact.subject);operations.push({operation:'attribute.set',target,data:{name:fact.name,value:fact.value,certainty:fact.certainty,validAt:fact.validAt}});}
 for(const relation of extraction.relations){operations.push({operation:'relation.create',target:null,data:{sourceId:map.get(relation.source),targetId:map.get(relation.target),type:relation.type,attributes:{certainty:relation.certainty}}});}
 operations.push({operation:'event.note',target:null,data:{description:extraction.summary}});
 return {operations,entityIds:Object.fromEntries(map),requiresConfirmation:extraction.relations.length>0||extraction.facts.some(f=>typeof f.value==='number')};
}

function createCommand(extraction,resolutions,{captureId,turnId=null}={}){
 if(!captureId||typeof captureId!=='string')throw new TypeError('captureId is required for idempotency');
 const built=buildOperations(extraction,resolutions,{idFactory:(()=>{let n=0;return()=>captureId+':entity:'+ ++n})()});
 return {contractVersion:'collector.command.v1',intent:'structured_memory.capture',idempotencyKey:'collector-memory-capture:'+captureId,certainty:extraction.confidence>=0.8?'certain':'uncertain',requiresConfirmation:built.requiresConfirmation,payload:{captureId,turnId,summary:extraction.summary,entityIds:built.entityIds},operations:built.operations};
}
module.exports={validateExtraction,resolveEntities,buildOperations,createCommand,normalizeName,MAX_ENTITIES,MAX_FACTS,MAX_RELATIONS};
