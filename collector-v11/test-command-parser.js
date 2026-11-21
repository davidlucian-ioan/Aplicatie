const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync(__dirname + '/app.js', 'utf8');
const start = source.indexOf('function parseCommand(text){');
const end = source.indexOf('\nasync function runCommand()', start);
assert.ok(start >= 0 && end > start, 'parseCommand function must exist');
const parseCommand = new Function(source.slice(start, end) + '; return parseCommand;')();

test('acceptă observație cu diacritice', () => {
  assert.deepEqual(parseCommand('Observație: test Collector v0.4'), {type:'note', description:'test Collector v0.4'});
});
test('acceptă observație fără diacritice', () => {
  assert.deepEqual(parseCommand('Observatie: test Collector v0.4'), {type:'note', description:'test Collector v0.4'});
});
test('acceptă formularea completă din exemplul UI', () => {
  assert.deepEqual(parseCommand('Înregistrează observație: B3 are pH 6.4'), {type:'note', description:'B3 are pH 6.4'});
});
test('respinge text gol', () => {
  assert.equal(parseCommand('   ').error, 'Scrie o comandă.');
});
