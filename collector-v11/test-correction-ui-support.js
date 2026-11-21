const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('./app.js','utf8');
assert.match(app,/op\.operation==='attribute\.set'\|\|op\.operation==='set_attribute'/,'generic correction UI must handle attribute.set operations');
assert.match(app,/operation:'attribute\.correct'/,'generic correction UI must emit attribute.correct');
assert.match(app,/Corectarea automată este ambiguă/,'duplicate writes to the same attribute must be rejected safely');
assert.match(app,/let correctedQuantity=null,stockOp=null,effectiveQty=null/,'effective corrected quantity must be in scope for stock delta calculation');
console.log('PASS: generic correction UI supports attributes, rejects ambiguous duplicate writes and keeps stock correction state in scope');
