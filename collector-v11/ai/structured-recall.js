'use strict';
const {normalizeName}=require('./structured-memory');
const MAX_RESULTS=100;
function tokenize(query){return normalizeName(query).split(' ').filter(term=>term.length>=2)}
function normalizeLimit(value){
 const requested=value===undefined||value===null?30:Number(value);
 if(!Number.isFinite(requested))throw new TypeError('Recall limit must be a finite number');
 return Math.min(MAX_RESULTS,Math.max(1,Math.floor(requested)));
}
function parseTimeBound(value,label){
 if(value===undefined||value===null||value==='')return null;
 if(typeof value!=='string'||!value.trim())throw new TypeError(label+' must be a valid date string');
 const parsed=Date.parse(value);
 if(!Number.isFinite(parsed))throw new TypeError(label+' must be a valid date string');
 return parsed;
}
function eventEntityRefs(event){
 const payload=event?.payload||{},entityIds=payload.entityIds&&typeof payload.entityIds==='object'&&!Array.isArray(payload.entityIds)?Object.values(payload.entityIds):[];
 const linked=Array.isArray(payload.linkedEntityIds)?payload.linkedEntityIds:[];
 const operations=Array.isArray(event?.operations)?event.operations:[];
 return new Set([payload.entityId,...entityIds,...linked,...operations.flatMap(operation=>[operation?.target,operation?.data?.entityId,operation?.data?.sourceId,operation?.data?.targetId,operation?.data?.populationId])].filter(value=>typeof value==='string'&&value.length>0));
}
function searchStructuredMemory(state,query,{limit=30,from=null,to=null}={}){
 if(!state||typeof state!=='object')throw new TypeError('State required');
 const terms=tokenize(query);if(!terms.length)return {entities:[],relations:[],events:[],attributes:[],eventAttributes:[],evidence:[]};
 const boundedLimit=normalizeLimit(limit),fromTime=parseTimeBound(from,'from'),toTime=parseTimeBound(to,'to');
 if(fromTime!==null&&toTime!==null&&fromTime>toTime)throw new RangeError('from must be earlier than or equal to to');
 const entities=Array.isArray(state.entities)?state.entities:[],relations=Array.isArray(state.relations)?state.relations:[],events=Array.isArray(state.events)?state.events:[],eventAttributes=Array.isArray(state.eventAttributes)?state.eventAttributes:[];
 const matched=entities.filter(entity=>{
  const attributes=entity.attributes&&typeof entity.attributes==='object'?entity.attributes:{};
  const aliases=Array.isArray(attributes.aliases)?attributes.aliases:[];
  const values=Object.entries(attributes).filter(([name])=>name!=='aliases').flatMap(([,value])=>Array.isArray(value)?value:[value]);
  const hay=normalizeName([entity.name,entity.type,...values,...aliases].join(' '));
  return terms.some(term=>hay.includes(term));
 });
 const matchedIds=new Set(matched.map(entity=>entity.id));
 const relevantRelations=relations.filter(relation=>matchedIds.has(relation.sourceId)||matchedIds.has(relation.targetId));
 const entityById=new Map(entities.map(entity=>[entity.id,entity]));
 const relationEvidence=relevantRelations.map(relation=>({...relation,sourceName:entityById.get(relation.sourceId)?.name||relation.sourceId,targetName:entityById.get(relation.targetId)?.name||relation.targetId}));
 const eventAttributeMatches=eventAttributes.filter(attribute=>terms.some(term=>normalizeName([attribute.name,attribute.value].join(' ')).includes(term)));
 const eventAttributeIds=new Set(eventAttributeMatches.map(attribute=>attribute.eventId));
 const filteredEvents=events.filter(event=>{
  const timestamp=Date.parse(event.timestamp||'');
  if(fromTime!==null&&(!Number.isFinite(timestamp)||timestamp<fromTime))return false;
  if(toTime!==null&&(!Number.isFinite(timestamp)||timestamp>toTime))return false;
  const refs=eventEntityRefs(event);
  const text=normalizeName(JSON.stringify({payload:event.payload,operations:event.operations}));
  return [...matchedIds].some(id=>refs.has(id))||eventAttributeIds.has(event.id)||terms.some(term=>text.includes(term));
 }).slice(-boundedLimit);
 const attributeRows=matched.flatMap(entity=>Object.entries(entity.attributes||{}).filter(([name])=>name!=='aliases').map(([name,value])=>({entityId:entity.id,entityName:entity.name,name,value,history:entity.attributeHistory?.[name]||[]})));
 const matchedEventIds=new Set(filteredEvents.map(event=>event.id));
 const selectedEventAttributes=eventAttributes.filter(attribute=>matchedEventIds.has(attribute.eventId));
 const evidence=[
  ...matched.slice(0,boundedLimit).map(entity=>({kind:'entity',id:entity.id,sourceId:entity.id,label:entity.name,type:entity.type})),
  ...relationEvidence.slice(0,boundedLimit).map(relation=>({kind:'relation',id:relation.id,sourceId:relation.id,source:relation.sourceName,type:relation.type,target:relation.targetName,at:relation.startedAt||relation.createdAt||null})),
  ...filteredEvents.map(event=>({kind:'event',id:event.id,sourceId:event.id,at:event.timestamp,summary:event.payload?.summary||event.payload?.description||event.operations?.find(operation=>operation.operation==='event.note')?.data?.description||event.type,certainty:event.certainty,status:event.status})),
  ...attributeRows.slice(0,boundedLimit).map(attribute=>({kind:'attribute',sourceId:'attribute:'+attribute.entityId+':'+attribute.name,entityId:attribute.entityId,entityName:attribute.entityName,name:attribute.name,value:attribute.value})),
  ...selectedEventAttributes.slice(0,boundedLimit).map(attribute=>({kind:'event_attribute',sourceId:'event-attribute:'+attribute.eventId+':'+attribute.name,eventId:attribute.eventId,name:attribute.name,value:attribute.value}))
 ];
 return {entities:matched.slice(0,boundedLimit),relations:relationEvidence.slice(0,boundedLimit),events:filteredEvents,attributes:attributeRows.slice(0,boundedLimit),eventAttributes:selectedEventAttributes.slice(0,boundedLimit),evidence:evidence.slice(0,boundedLimit)};
}
module.exports={searchStructuredMemory,tokenize,normalizeLimit,parseTimeBound,MAX_RESULTS};