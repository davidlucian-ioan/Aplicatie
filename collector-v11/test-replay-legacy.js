const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./engine.js');

test('replay tolerates duplicate migration imports and preserves malformed legacy events without warnings', () => {
  const entityId = 'location-b1';
  const events = [
    {
      id: 'created-b1', type: 'location.created', timestamp: '2026-10-24T10:00:00.000Z', status: 'committed',
      payload: { entityId, name: 'B1', type: 'location' },
      operations: [{ target: entityId, operation: 'entity.create', data: { name: 'B1', type: 'location' } }]
    },
    {
      id: 'duplicate-import-b1', type: 'migration.entity_imported', timestamp: '2026-10-24T10:00:00.000Z', status: 'committed',
      payload: { entityId, name: 'B1', type: 'location' },
      operations: [{ target: entityId, operation: 'entity.create', data: { name: 'B1', type: 'location' } }]
    },
    {
      id: 'legacy-unknown-attribute', type: 'legacy.change', timestamp: '2026-10-24T10:01:00.000Z', status: 'committed',
      operations: [{ target: entityId, operation: 'schimb atrib', data: { nota: 'blabla' } }]
    }
  ];
  const rebuilt = E.replay(events, []);
  assert.equal(rebuilt.entities.length, 1);
  assert.equal(rebuilt.entities[0].name, 'B1');
  assert.equal(rebuilt.events.length, 3);
  assert.deepEqual(rebuilt.meta.replayWarnings, []);
});
