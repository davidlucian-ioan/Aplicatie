(function(root){'use strict';
function normalizeName(value){return String(value||'').normalize('NFKC').toLocaleLowerCase().replace(/[’']/g,"'").replace(/[^\p{L}\p{N}]+/gu,' ').trim()}
function tokenize(query){return normalizeName(query).split(' ').filter(term=>term.length>=2)}
function entityRelevance(entity,terms,query){
 const attributes=entity.attributes&&typeof entity.attributes==='object'?entity.attributes:{},aliases=Array.isArray(attributes.aliases)?attributes.aliases:[];
 const values=Object.entries(attributes).filter(([name])=>name!=='aliases').flatMap(([,value])=>Array.isArray(value)?value:[value]);
 const name=normalizeName(entity.name||''),hay=normalizeName([entity.name,entity.type,...values,...aliases].join(' '));let score=0;
 for(const term of terms){if(name===term)score+=18;else if(name.startsWith(term))score+=10;else if(name.includes(term))score+=7;else if(hay.includes(term))score+=3;}
 const normalizedQuery=normalizeName(query);if(normalizedQuery&&name===normalizedQuery)score+=40;else if(normalizedQuery&&name.includes(normalizedQuery))score+=20;
 return score;
}
function evidenceRank(row){switch(row.kind){case'task':return 1000;case'entity':return 900+(Number(row.relevance)||0);case'relation':return 700+(Number(row.relevance)||0);case'event':return 600+(Number(row.relevance)||0);case'attribute':return 500+(Number(row.relevance)||0);case'historical_attribute':case'historical_relation_attribute':return 400+(Number(row.relevance)||0);case'event_attribute':return 300+(Number(row.relevance)||0);case'linked_entity':return 200+(Number(row.relevance)||0);default:return 0;}}
const MAX_RESULTS=100;
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
 const terms=tokenize(query);if(!terms.length)return {entities:[],tasks:[],relations:[],events:[],attributes:[],historicalAttributes:[],eventAttributes:[],evidence:[]};
 const boundedLimit=normalizeLimit(limit),fromTime=parseTimeBound(from,'from'),toTime=parseTimeBound(to,'to');
 if(fromTime!==null&&toTime!==null&&fromTime>toTime)throw new RangeError('from must be earlier than or equal to to');
 const entities=Array.isArray(state.entities)?state.entities:[],relations=Array.isArray(state.relations)?state.relations:[],events=Array.isArray(state.events)?state.events:[],eventAttributes=Array.isArray(state.eventAttributes)?state.eventAttributes:[];
 const matched=entities.map(entity=>({entity,relevance:entityRelevance(entity,terms,query)})).filter(row=>row.relevance>0).sort((a,b)=>b.relevance-a.relevance||String(a.entity.name||'').localeCompare(String(b.entity.name||''))).map(row=>row.entity);
 const relevanceByEntity=new Map(entities.map(entity=>[entity.id,entityRelevance(entity,terms,query)]));
 const directIds=new Set(matched.map(entity=>entity.id));
 const eventAttributeMatches=eventAttributes.filter(attribute=>terms.some(term=>normalizeName([attribute.name,attribute.value].join(' ')).includes(term)));
 const eventAttributeIds=new Set(eventAttributeMatches.map(attribute=>attribute.eventId));

 const matchingEvents=events.filter(event=>{
  const timestamp=Date.parse(event.timestamp||'');
  if(fromTime!==null&&(!Number.isFinite(timestamp)||timestamp<fromTime))return false;
  if(toTime!==null&&(!Number.isFinite(timestamp)||timestamp>toTime))return false;
  return eventAttributeIds.has(event.id)||terms.some(term=>normalizeName(JSON.stringify({payload:event.payload,operations:event.operations})).includes(term));
 });
 const eventSeedIds=new Set(matchingEvents.flatMap(event=>[...eventEntityRefs(event)]));
 const seedIds=new Set([...directIds,...eventSeedIds]);
 const relevantRelations=relations.filter(relation=>{
  if(!seedIds.has(relation.sourceId)&&!seedIds.has(relation.targetId))return false;
  const start=Date.parse(relation.startedAt||relation.createdAt||''),end=Date.parse(relation.endedAt||'');
  if(toTime!==null&&Number.isFinite(start)&&start>toTime)return false;
  if(fromTime!==null&&Number.isFinite(end)&&end<fromTime)return false;
  return true;
 });
 const relationIdsByEntity=new Map();for(const relation of relevantRelations){for(const endpoint of [relation.sourceId,relation.targetId]){if(!relationIdsByEntity.has(endpoint))relationIdsByEntity.set(endpoint,[]);relationIdsByEntity.get(endpoint).push(relation.id)}}
 const expandedIds=new Set([...seedIds,...relevantRelations.flatMap(relation=>[relation.sourceId,relation.targetId])]);
 const entityById=new Map(entities.map(entity=>[entity.id,entity]));
 const expandedEntities=entities.filter(entity=>expandedIds.has(entity.id));
 const relationEvidence=relevantRelations.map(relation=>({...relation,sourceName:entityById.get(relation.sourceId)?.name||relation.sourceId,targetName:entityById.get(relation.targetId)?.name||relation.targetId,sourceMatched:directIds.has(relation.sourceId),targetMatched:directIds.has(relation.targetId),certainty:relation.attributes?.certainty||relation.certainty||'unknown',history:relation.attributeHistory||{},temporalStatus:relation.endedAt?'ended':'active'}));
 const filteredEvents=events.filter(event=>{
  const timestamp=Date.parse(event.timestamp||'');
  if(fromTime!==null&&(!Number.isFinite(timestamp)||timestamp<fromTime))return false;
  if(toTime!==null&&(!Number.isFinite(timestamp)||timestamp>toTime))return false;
  const refs=eventEntityRefs(event),content=normalizeName(JSON.stringify({payload:event.payload,operations:event.operations}));
  return [...expandedIds].some(id=>refs.has(id))||eventAttributeIds.has(event.id)||terms.some(term=>content.includes(term));
 }).slice(-boundedLimit);
 const attributeRows=expandedEntities.flatMap(entity=>Object.entries(entity.attributes||{}).filter(([name])=>name!=='aliases').map(([name,value])=>{const history=entity.attributeHistory?.[name]||[],latest=Array.isArray(history)?history[history.length-1]:null;return {entityId:entity.id,entityName:entity.name,name,value,history,certainty:latest?.certainty||'unknown',validAt:latest?.validAt||null,eventId:latest?.eventId||null,matched:directIds.has(entity.id)}}));
 const historicalAttributeRows=expandedEntities.flatMap(entity=>Object.entries(entity.attributeHistory||{}).flatMap(([name,rows])=>(Array.isArray(rows)?rows:[]).map(row=>({entityId:entity.id,entityName:entity.name,name,value:row.value,at:row.at||null,validAt:row.validAt||null,certainty:row.certainty||'unknown',eventId:row.eventId||null,correctedByEventId:row.correctedByEventId||null,matched:directIds.has(entity.id)}))));
 const taskRows=matched.filter(entity=>entity.type==='task'&&['reminder','user'].includes(entity.attributes?.taskKind)).map(entity=>{
  const a=entity.attributes||{};
  const dependencies=(relations||[]).filter(relation=>relation.type==='depends_on'&&relation.sourceId===entity.id&&!relation.endedAt);
  const blockedBy=dependencies.map(relation=>entities.find(item=>item.id===relation.targetId)).filter(dependency=>!dependency||dependency.attributes?.status!=='completed').map(dependency=>({taskId:dependency?.id||null,title:dependency?.name||'Task lipsă',status:dependency?.attributes?.status||'missing'}));
  return {id:entity.id,entityId:entity.id,taskKind:a.taskKind,taskId:a.taskId||null,reminderId:a.reminderId||null,title:entity.name,status:a.status||'open',
   dueAt:a.dueAt||null,dueDate:a.dueDate||null,dueTime:a.dueTime||null,timezone:a.timezone||null,priority:a.priority||'normal',
   sourceId:a.sourceId||null,scheduleState:a.scheduleState||null,successorReminderId:a.successorReminderId||null,successorTaskId:a.successorTaskId||null,successorDueAt:a.successorDueAt||null,
   dependencyIds:dependencies.map(relation=>relation.targetId),blockedBy};
 });
 const visibleEntities=expandedEntities.filter(entity=>!(entity.type==='task'&&['reminder','user'].includes(entity.attributes?.taskKind)));
 const matchedEventIds=new Set(filteredEvents.map(event=>event.id)),selectedEventAttributes=eventAttributes.filter(attribute=>matchedEventIds.has(attribute.eventId));
 const evidence=[
  ...taskRows.slice(0,boundedLimit).map(task=>({kind:'task',id:task.id,sourceId:'task:'+task.id,taskKind:task.taskKind,taskId:task.taskId,reminderId:task.reminderId,title:task.title,status:task.status,dueAt:task.dueAt,dueDate:task.dueDate,dueTime:task.dueTime,timezone:task.timezone,priority:task.priority,sourceRef:task.sourceId,scheduleState:task.scheduleState,successorReminderId:task.successorReminderId,successorTaskId:task.successorTaskId,successorDueAt:task.successorDueAt,dependencyIds:task.dependencyIds,blockedBy:task.blockedBy})),
  ...visibleEntities.slice(0,boundedLimit).map(entity=>({kind:directIds.has(entity.id)?'entity':'linked_entity',id:entity.id,sourceId:'entity:'+entity.id,label:entity.name,type:entity.type,matched:directIds.has(entity.id),relevance:relevanceByEntity.get(entity.id)||0,linkedBy:relationIdsByEntity.get(entity.id)||[]})),
  ...relationEvidence.slice(0,boundedLimit).map(relation=>({kind:'relation',id:relation.id,sourceId:'relation:'+relation.id,source:relation.sourceName,type:relation.type,target:relation.targetName,at:relation.startedAt||relation.createdAt||null,startedAt:relation.startedAt||null,endedAt:relation.endedAt||null,certainty:relation.certainty,temporalStatus:relation.temporalStatus,attributes:relation.attributes||{},history:relation.history||{}})),
  ...filteredEvents.map(event=>({kind:'event',id:event.id,sourceId:'event:'+event.id,at:event.timestamp,summary:event.payload?.summary||event.payload?.description||event.operations?.find(operation=>operation.operation==='event.note')?.data?.description||event.type,certainty:event.certainty,status:event.status})),
  ...attributeRows.slice(0,boundedLimit).map(attribute=>({kind:'attribute',sourceId:'attribute:'+attribute.entityId+':'+attribute.name,entityId:attribute.entityId,entityName:attribute.entityName,name:attribute.name,value:attribute.value,certainty:attribute.certainty,validAt:attribute.validAt,eventId:attribute.eventId,matched:attribute.matched})),
  ...historicalAttributeRows.slice(0,boundedLimit).map(attribute=>({kind:'historical_attribute',sourceId:'attribute-history:'+attribute.entityId+':'+attribute.name+':'+(attribute.eventId||attribute.at||'unknown'),entityId:attribute.entityId,entityName:attribute.entityName,name:attribute.name,value:attribute.value,at:attribute.at,validAt:attribute.validAt,certainty:attribute.certainty,eventId:attribute.eventId,correctedByEventId:attribute.correctedByEventId,matched:attribute.matched})),
  ...selectedEventAttributes.slice(0,boundedLimit).map(attribute=>({kind:'event_attribute',sourceId:'event-attribute:'+attribute.eventId+':'+attribute.name,eventId:attribute.eventId,name:attribute.name,value:attribute.value}))
 ];
 evidence.sort((a,b)=>evidenceRank(b)-evidenceRank(a)||String(a.sourceId||'').localeCompare(String(b.sourceId||'')));
 return {entities:visibleEntities.slice(0,boundedLimit),tasks:taskRows.slice(0,boundedLimit),relations:relationEvidence.slice(0,boundedLimit),events:filteredEvents,attributes:attributeRows.slice(0,boundedLimit),historicalAttributes:historicalAttributeRows.slice(0,boundedLimit),eventAttributes:selectedEventAttributes.slice(0,boundedLimit),evidence:evidence.slice(0,boundedLimit)};
}
root.CollectorStructuredRecall={searchStructuredMemory,tokenize,normalizeLimit,parseTimeBound,MAX_RESULTS};
})(typeof window!=='undefined'?window:globalThis);