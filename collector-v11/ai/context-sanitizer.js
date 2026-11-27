'use strict';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const RECALL_KINDS=new Set(['entity','linked_entity','relation','event','attribute','historical_attribute','historical_relation_attribute','event_attribute','task']);
function safeScalar(value,max=500){
  if(typeof value==='string')return value.slice(0,max);
  if(typeof value==='number'&&Number.isFinite(value))return value;
  if(typeof value==='boolean')return value;
  return null;
}
function safeRecallEvidence(input){
  if(!Array.isArray(input))return [];
  return input.slice(0,60).filter(isRecord).flatMap(row=>{
    if(!RECALL_KINDS.has(row.kind))return [];
    const sourceId=String(row.sourceId||row.id||'').trim().slice(0,240);
    if(!sourceId)return [];
    if(row.kind==='entity'||row.kind==='linked_entity')return [{kind:row.kind,sourceId,label:String(row.label||'').slice(0,160),type:String(row.type||'generic').slice(0,64),linkedBy:row.kind==='linked_entity'&&Array.isArray(row.linkedBy)?row.linkedBy.slice(0,20).map(id=>String(id).slice(0,180)):[]}];
    if(row.kind==='relation')return [{kind:'relation',sourceId,source:String(row.source||'').slice(0,160),type:String(row.type||'related_to').slice(0,80),target:String(row.target||'').slice(0,160),at:String(row.at||'').slice(0,40),startedAt:String(row.startedAt||'').slice(0,40),endedAt:String(row.endedAt||'').slice(0,40),certainty:String(row.certainty||'unknown').slice(0,16),temporalStatus:String(row.temporalStatus||'unknown').slice(0,16),attributes:record(row.attributes)?Object.fromEntries(Object.entries(row.attributes).slice(0,20).map(([key,value])=>[String(key).slice(0,80),safeScalar(value)])): {},history:record(row.history)?Object.fromEntries(Object.entries(row.history).slice(0,20).map(([key,rows])=>[String(key).slice(0,80),Array.isArray(rows)?rows.slice(-10).filter(record).map(item=>({at:String(item.at||'').slice(0,40),value:safeScalar(item.value),previous:safeScalar(item.previous),certainty:String(item.certainty||'unknown').slice(0,16),eventId:String(item.eventId||'').slice(0,128),correctedByEventId:String(item.correctedByEventId||'').slice(0,128)})):[]]))}];
    if(row.kind==='event')return [{kind:'event',sourceId,at:String(row.at||'').slice(0,40),summary:String(row.summary||'').slice(0,500),certainty:String(row.certainty||'uncertain').slice(0,16),status:String(row.status||'').slice(0,32)}];
    if(row.kind==='task')return [{kind:'task',sourceId,taskKind:String(row.taskKind||(row.reminderId?'reminder':'user')).slice(0,24),taskId:String(row.taskId||'').slice(0,180),reminderId:String(row.reminderId||'').slice(0,180),title:String(row.title||'').slice(0,160),status:String(row.status||'open').slice(0,32),dueAt:String(row.dueAt||'').slice(0,40),dueDate:String(row.dueDate||'').slice(0,10),dueTime:String(row.dueTime||'').slice(0,5),timezone:String(row.timezone||'').slice(0,80),priority:String(row.priority||'normal').slice(0,16),sourceRef:String(row.sourceRef||'').slice(0,200),scheduleState:String(row.scheduleState||'').slice(0,32),successorReminderId:String(row.successorReminderId||'').slice(0,180),successorTaskId:String(row.successorTaskId||'').slice(0,220),successorDueAt:String(row.successorDueAt||'').slice(0,40),dependencyIds:Array.isArray(row.dependencyIds)?row.dependencyIds.slice(0,20).map(id=>String(id).slice(0,220)):[],blockedBy:Array.isArray(row.blockedBy)?row.blockedBy.slice(0,20).filter(isRecord).map(item=>({taskId:String(item.taskId||'').slice(0,220),title:String(item.title||'').slice(0,160),status:String(item.status||'missing').slice(0,32)})):[]}];
    if(row.kind==='attribute')return [{kind:'attribute',sourceId,entityId:String(row.entityId||'').slice(0,128),entityName:String(row.entityName||'').slice(0,160),name:String(row.name||'').slice(0,120),value:safeScalar(row.value),certainty:String(row.certainty||'unknown').slice(0,16),validAt:String(row.validAt||'').slice(0,40),eventId:String(row.eventId||'').slice(0,128)}];
    if(row.kind==='historical_attribute')return [{kind:'historical_attribute',sourceId,entityId:String(row.entityId||'').slice(0,128),entityName:String(row.entityName||'').slice(0,160),name:String(row.name||'').slice(0,120),value:safeScalar(row.value),at:String(row.at||'').slice(0,40),validAt:String(row.validAt||'').slice(0,40),certainty:String(row.certainty||'unknown').slice(0,16),eventId:String(row.eventId||'').slice(0,128),correctedByEventId:String(row.correctedByEventId||'').slice(0,128)}];
    if(row.kind==='historical_relation_attribute')return [{kind:'historical_relation_attribute',sourceId,relationId:String(row.relationId||'').slice(0,128),relationType:String(row.relationType||'').slice(0,80),name:String(row.name||'').slice(0,120),value:safeScalar(row.value),at:String(row.at||'').slice(0,40),certainty:String(row.certainty||'unknown').slice(0,16),eventId:String(row.eventId||'').slice(0,128),correctedByEventId:String(row.correctedByEventId||'').slice(0,128)}];
    return [{kind:'event_attribute',sourceId,eventId:String(row.eventId||'').slice(0,128),name:String(row.name||'').slice(0,120),value:safeScalar(row.value)}];
  });
}
function safeContext(input) {
  const source = isRecord(input) ? input : {};
  const entities = Array.isArray(source.entities) ? source.entities.slice(0, 150) : [];
  const attributes = Array.isArray(source.attributes) ? source.attributes.slice(0, 100) : [];
  const safe = {
    entities: entities.filter(isRecord).map(entity => ({
      id: String(entity.id || '').slice(0, 128),
      name: String(entity.name || '').slice(0, 160),
      type: String(entity.type || 'generic').slice(0, 64)
    })),
    attributes: attributes.filter(isRecord).map(attribute => ({
      id: String(attribute.id || '').slice(0, 128),
      name: String(attribute.name || '').slice(0, 120),
      type: String(attribute.type || 'text').slice(0, 64),
      required: Boolean(attribute.required),
      identifying: Boolean(attribute.identifying),
      temporal: Boolean(attribute.temporal),
      min: typeof attribute.min === 'number' && Number.isFinite(attribute.min) ? attribute.min : null,
      max: typeof attribute.max === 'number' && Number.isFinite(attribute.max) ? attribute.max : null
    }))
  };
  if(Array.isArray(source.recallEvidence))safe.recallEvidence=safeRecallEvidence(source.recallEvidence);
  return safe;
}

module.exports = { safeContext, safeRecallEvidence };
