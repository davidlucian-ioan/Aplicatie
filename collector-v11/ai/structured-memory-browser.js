(function(root){
'use strict';
const MAX_ENTITIES=30,MAX_FACTS=80,MAX_RELATIONS=60,MAX_TEXT=500;
function record(v){return v&&typeof v==='object'&&!Array.isArray(v)}
function text(v,label,{required=true,max=MAX_TEXT}={}){if(typeof v!=='string'||(required&&!v.trim()))throw new TypeError(label+' invalid');if(v.length>max)throw new TypeError(label+' too long');return v.trim()}

function certainty(value,label){if(value===undefined)return 'certain';if(value!=='certain'&&value!=='uncertain')throw new TypeError(label+' certainty invalid');return value}
function validTemporal(value){
 if(typeof value!=='string'||!value.trim())return false;
 const v=value.trim(),date=v.match(/^(\d{4})-(\d{2})-(\d{2})$/),timestamp=v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/);
 const parts=date||timestamp;if(!parts)return false;
 const year=Number(parts[1]),month=Number(parts[2]),day=Number(parts[3]),days=new Date(Date.UTC(year,month,0)).getUTCDate();
 if(month<1||month>12||day<1||day>days)return false;
 if(date)return true;
 const hour=Number(parts[4]),minute=Number(parts[5]),second=Number(parts[6]||0),zone=parts[7];
 if(hour>23||minute>59||second>59||!Number.isFinite(Date.parse(v)))return false;
 if(zone!=='Z'){const offset=zone.match(/^[+-](\d{2}):(\d{2})$/);if(!offset)return false;const h=Number(offset[1]),m=Number(offset[2]);if(h>14||m>59||(h===14&&m!==0))return false}
 return true;
}
function temporal(value,label){
 if(value===undefined||value===null)return null;
 if(typeof value!=='string'||!validTemporal(value))throw new TypeError(label+' must be an ISO date or timezone-aware timestamp');
 return value.trim();
}
function validateExtraction(input){
 if(!record(input))throw new TypeError('Extraction must be an object');
 const entities=Array.isArray(input.entities)?input.entities:[],facts=Array.isArray(input.facts)?input.facts:[],relations=Array.isArray(input.relations)?input.relations:[];
 if(entities.length>MAX_ENTITIES||facts.length>MAX_FACTS||relations.length>MAX_RELATIONS)throw new RangeError('Extraction exceeds bounded limits');
 const keys=new Set();
 const normalizedEntities=entities.map((e,i)=>{if(!record(e))throw new TypeError('Entity '+i+' invalid');const key=text(e.key,'entity.key',{max:80});if(keys.has(key))throw new TypeError('Duplicate entity key');keys.add(key);const aliases=Array.isArray(e.aliases)?e.aliases.slice(0,10).map(x=>text(x,'alias',{max:100})):[];return {key,name:text(e.name,'entity.name',{max:160}),type:text(e.type||'generic','entity.type',{max:64}),aliases,existingId:typeof e.existingId==='string'?e.existingId:null}});
 const normalizedFacts=facts.map((f,i)=>{if(!record(f))throw new TypeError('Fact '+i+' invalid');if(!keys.has(f.subject))throw new TypeError('Fact subject must reference extracted entity');const value=f.value;if(value===undefined||value===null||!(typeof value==='string'||typeof value==='number'||typeof value==='boolean'))throw new TypeError('Fact value invalid');if(typeof value==='string'&&value.length>MAX_TEXT)throw new TypeError('Fact value too long');return {subject:f.subject,name:text(f.name,'fact.name',{max:120}),value,certainty:certainty(f.certainty,'fact'),validAt:temporal(f.validAt,'fact.validAt')}});
 const normalizedRelations=relations.map((r,i)=>{if(!record(r)||!keys.has(r.source)||!keys.has(r.target))throw new TypeError('Relation '+i+' references unknown keys');if(r.source===r.target)throw new TypeError('Self relation not allowed');return {source:r.source,target:r.target,type:text(r.type||'related_to','relation.type',{max:80}),certainty:certainty(r.certainty,'relation')}});
 const confidence=input.confidence===undefined?0.5:input.confidence;if(typeof confidence!=='number'||!Number.isFinite(confidence)||confidence<0||confidence>1)throw new TypeError('Extraction confidence invalid');
 return {summary:text(input.summary||'Structured memory capture','summary',{max:1000}),entities:normalizedEntities,facts:normalizedFacts,relations:normalizedRelations,clarification:typeof input.clarification==='string'?input.clarification.slice(0,500):'',confidence};
}
function normalizeName(v){return String(v||'').normalize('NFKC').toLocaleLowerCase().replace(/[’']/g,"'").replace(/[^\p{L}\p{N}]+/gu,' ').trim()}
function ngramDice(a,b,n=3){
 if(a.length<n||b.length<n)return 0;
 const left=new Set(),right=new Set();
 for(let i=0;i<=a.length-n;i++)left.add(a.slice(i,i+n));
 for(let i=0;i<=b.length-n;i++)right.add(b.slice(i,i+n));
 let overlap=0;for(const gram of left)if(right.has(gram))overlap++;
 return left.size+right.size?2*overlap/(left.size+right.size):0;
}
function tokenDice(a,b){
 const left=new Set(a.split(' ').filter(Boolean)),right=new Set(b.split(' ').filter(Boolean));
 let overlap=0;for(const token of left)if(right.has(token))overlap++;
 return left.size+right.size?2*overlap/(left.size+right.size):0;
}
function nameSimilarity(first,second){
 const a=normalizeName(first),b=normalizeName(second);
 if(!a||!b)return 0;
 if(a===b)return 1;
 if(Math.min(a.length,b.length)<8)return 0;
 return Math.max(ngramDice(a,b,3),tokenDice(a,b));
}
function mergeAliases(existing,candidate){const output=[],seen=new Set();for(const alias of [...(Array.isArray(existing)?existing:[]),...(Array.isArray(candidate)?candidate:[])]){if(typeof alias!=='string'||!alias.trim())continue;const key=normalizeName(alias);if(!key||seen.has(key))continue;seen.add(key);output.push(alias.trim())}return output}
function resolveEntities(extraction,state,{threshold=0.92}={}){
 if(typeof threshold!=='number'||!Number.isFinite(threshold)||threshold<=0||threshold>1)throw new TypeError('Entity similarity threshold must be between 0 and 1');
 const all=Array.isArray(state?.entities)?state.entities:[];
 return extraction.entities.map(candidate=>{
  if(candidate.existingId){
   const exact=all.find(e=>e.id===candidate.existingId);
   if(!exact)throw new Error('Unknown existing entity ID');
   if(exact.type!==candidate.type)throw new Error('Existing entity type mismatch');
   return {...candidate,aliases:mergeAliases(exact.attributes?.aliases,candidate.aliases),resolvedId:exact.id,match:'explicit'};
  }
  const names=[candidate.name,...candidate.aliases].map(normalizeName).filter(Boolean);
  const matches=all.filter(e=>e.type===candidate.type&&(names.includes(normalizeName(e.name))||(Array.isArray(e.attributes?.aliases)&&e.attributes.aliases.some(a=>names.includes(normalizeName(a))))));
  const unique=[...new Map(matches.map(e=>[e.id,e])).values()];
  if(unique.length===1)return {...candidate,aliases:mergeAliases(unique[0].attributes?.aliases,candidate.aliases),resolvedId:unique[0].id,match:'exact'};
  if(unique.length>1)return {...candidate,resolvedId:null,match:'ambiguous',candidateIds:unique.map(e=>e.id)};
  const near=all.filter(e=>e.type===candidate.type).map(entity=>{
   const existingNames=[entity.name,...(Array.isArray(entity.attributes?.aliases)?entity.attributes.aliases:[])].filter(x=>typeof x==='string');
   const similarity=Math.max(0,...names.flatMap(name=>existingNames.map(existing=>nameSimilarity(name,existing))));
   return {entity,similarity};
  }).filter(item=>item.similarity>=threshold).sort((a,b)=>b.similarity-a.similarity||String(a.entity.id).localeCompare(String(b.entity.id)));
  if(near.length)return {...candidate,resolvedId:null,match:'ambiguous',candidateIds:near.map(x=>x.entity.id),candidateMatches:near.map(x=>({id:x.entity.id,similarity:Number(x.similarity.toFixed(3))}))};
  return {...candidate,resolvedId:null,match:'new'};
 });
}
function buildOperations(extraction,resolutions,{idFactory}={}){let seq=0;const make=idFactory||(()=> 'memory-entity-'+(++seq));const map=new Map(),operations=[];for(const r of resolutions){const id=r.resolvedId||make();map.set(r.key,id);if(!r.resolvedId)operations.push({operation:'entity.create',target:id,data:{name:r.name,type:r.type}});if(r.aliases?.length)operations.push({operation:'attribute.set',target:id,data:{name:'aliases',value:r.aliases}})}for(const f of extraction.facts)operations.push({operation:'attribute.set',target:map.get(f.subject),data:{name:f.name,value:f.value,certainty:f.certainty,validAt:f.validAt}});for(const r of extraction.relations)operations.push({operation:'relation.create',target:null,data:{sourceId:map.get(r.source),targetId:map.get(r.target),type:r.type,attributes:{certainty:r.certainty}}});operations.push({operation:'event.note',target:null,data:{description:extraction.summary}});return {operations,entityIds:Object.fromEntries(map),requiresConfirmation:extraction.relations.length>0||extraction.facts.some(f=>typeof f.value==='number')}}
function createCommand(extraction,resolutions,{captureId,turnId=null}={}){if(!captureId||typeof captureId!=='string'||captureId.length>120)throw new TypeError('captureId is required for idempotency');const built=buildOperations(extraction,resolutions,{idFactory:(()=>{let n=0;return()=>captureId+':entity:'+ ++n})()});return {contractVersion:'collector.command.v1',intent:'structured_memory.capture',idempotencyKey:'collector-memory-capture:'+captureId,certainty:extraction.confidence>=.8?'certain':'uncertain',requiresConfirmation:built.requiresConfirmation,payload:{captureId,turnId,summary:extraction.summary,entityIds:built.entityIds},operations:built.operations}}
root.CollectorStructuredMemory={validateExtraction,resolveEntities,buildOperations,createCommand,normalizeName,nameSimilarity};
})(typeof window!=='undefined'?window:globalThis);
