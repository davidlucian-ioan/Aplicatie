'use strict';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const RECALL_KINDS=new Set(['entity','relation','event','attribute','event_attribute','task']);
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
    if(row.kind==='entity')return [{kind:'entity',sourceId,label:String(row.label||'').slice(0,160),type:String(row.type||'generic').slice(0,64)}];
    if(row.kind==='relation')return [{kind:'relation',sourceId,source:String(row.source||'').slice(0,160),type:String(row.type||'related_to').slice(0,80),target:String(row.target||'').slice(0,160),at:String(row.at||'').slice(0,40)}];
    if(row.kind==='event')return [{kind:'event',sourceId,at:String(row.at||'').slice(0,40),summary:String(row.summary||'').slice(0,500),certainty:String(row.certainty||'uncertain').slice(0,16),status:String(row.status||'').slice(0,32)}];
    if(row.kind==='task')return [{kind:'task',sourceId,taskKind:String(row.taskKind||'user').slice(0,24),taskId:String(row.taskId||'').slice(0,180),reminderId:String(row.reminderId||'').slice(0,180),title:String(row.title||'').slice(0,160),status:String(row.status||'open').slice(0,32),dueAt:String(row.dueAt||'').slice(0,40),dueDate:String(row.dueDate||'').slice(0,10),dueTime:String(row.dueTime||'').slice(0,5),timezone:String(row.timezone||'').slice(0,80),priority:String(row.priority||'normal').slice(0,16),sourceRef:String(row.sourceRef||'').slice(0,200),scheduleState:String(row.scheduleState||'').slice(0,32),successorReminderId:String(row.successorReminderId||'').slice(0,180),successorTaskId:String(row.successorTaskId||'').slice(0,220),successorDueAt:String(row.successorDueAt||'').slice(0,40),dependencyIds:Array.isArray(row.dependencyIds)?row.dependencyIds.slice(0,20).map(id=>String(id).slice(0,220)):[],blockedBy:Array.isArray(row.blockedBy)?row.blockedBy.slice(0,20).filter(isRecord).map(item=>({taskId:String(item.taskId||'').slice(0,220),title:String(item.title||'').slice(0,160),status:String(item.status||'missing').slice(0,32)})):[]}];
    if(row.kind==='attribute')return [{kind:'attribute',sourceId,entityId:String(row.entityId||'').slice(0,128),entityName:String(row.entityName||'').slice(0,160),name:String(row.name||'').slice(0,120),value:safeScalar(row.value)}];
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
