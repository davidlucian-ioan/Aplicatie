'use strict';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeContext(input) {
  const source = isRecord(input) ? input : {};
  const entities = Array.isArray(source.entities) ? source.entities.slice(0, 150) : [];
  const attributes = Array.isArray(source.attributes) ? source.attributes.slice(0, 100) : [];
  return {
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
}

module.exports = { safeContext };
