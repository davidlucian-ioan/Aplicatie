'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const E = require('./engine.js');

const fixturesDir = path.join(__dirname, 'fixtures', 'migrations');
const fixtures = [
  { file: 'schema-v0-legacy.json', expectedName: 'Legacy item', expectedAttribute: null },
  { file: 'schema-v6-legacy.json', expectedName: 'Legacy plant renamed', expectedAttribute: 6.1 },
  { file: 'schema-v7-current.json', expectedName: 'Current item', expectedAttribute: null }
];

for (const fixture of fixtures) {
  test(`migration fixture ${fixture.file} upgrades safely to schema v7`, () => {
    const raw = JSON.parse(fs.readFileSync(path.join(fixturesDir, fixture.file), 'utf8'));
    const migrated = E.validateImport(raw);

    assert.equal(migrated.schemaVersion, 7);
    assert.equal(migrated.entities.length, 1);
    assert.equal(migrated.entities[0].name, fixture.expectedName);
    assert.deepEqual(migrated.meta.replayWarnings || [], []);

    if (fixture.expectedAttribute !== null) {
      assert.equal(migrated.entities[0].attributes.pH, fixture.expectedAttribute);
      assert.equal(migrated.attributes.find(attribute => attribute.name === 'pH').validation.max, 6.5);
    }

    // Export/import is a second migration boundary: it must remain lossless.
    const roundTrip = E.validateImport(JSON.parse(JSON.stringify(migrated)));
    assert.deepEqual(roundTrip.entities, migrated.entities);
    assert.deepEqual(roundTrip.attributes, migrated.attributes);
    assert.deepEqual(roundTrip.relations, migrated.relations);
    assert.deepEqual(roundTrip.stock, migrated.stock);
    assert.deepEqual(roundTrip.finance, migrated.finance);
    assert.deepEqual(roundTrip.eventAttributes, migrated.eventAttributes);
    assert.deepEqual(roundTrip.events, migrated.events);
  });
}

test('schema-v6 migration preserves append order even when timestamps run backwards', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'schema-v6-legacy.json'), 'utf8'));
  assert.deepEqual(raw.events.map(event => event.id), [
    'fixture-v6-create',
    'fixture-v6-rename',
    'fixture-v6-ph-set'
  ]);
  assert.ok(Date.parse(raw.events[1].timestamp) < Date.parse(raw.events[0].timestamp));

  const migrated = E.validateImport(raw);
  const replayed = E.replay(migrated.events, migrated.attributes);
  assert.equal(replayed.entities[0].name, 'Legacy plant renamed');
  assert.equal(replayed.entities[0].attributes.pH, 6.1);
  assert.deepEqual(replayed.meta.replayWarnings || [], []);
});

test('schema-v7 current fixture replays to the same semantic projections', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'schema-v7-current.json'), 'utf8'));
  const imported = E.validateImport(raw);
  const replayed = E.replay(imported.events, imported.attributes);

  assert.deepEqual(replayed.entities, imported.entities);
  assert.deepEqual(replayed.attributes, imported.attributes);
  assert.deepEqual(replayed.relations, imported.relations);
  assert.deepEqual(replayed.stock, imported.stock);
  assert.deepEqual(replayed.finance, imported.finance);
  assert.deepEqual(replayed.eventAttributes, imported.eventAttributes);
});
