'use strict';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const RECALL_KINDS=new Set(['entity','relation','event','attribute','event_attribute']);
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
