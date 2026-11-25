'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { OpenAIProvider, INTERPRETATION_SCHEMA } = require('./ai/provider-openai');

function apiResponse(parsed) {
  return { status:'completed', output_text:JSON.stringify(parsed), usage:{input_tokens:123,output_tokens:45} };
}
const base = {
  intent:'propose', answer:'', semantic_summary:'Am notat pH 6.4.', memory_facts:[], reminder_suggestions:[], question:'', confidence:0.94,
  ambiguities:[], clarificationQuestion:'', command_intent:'event.note',
  certainty:'certain', requires_confirmation:false, payload_json:'{}',
  operations:[{operation:'event.note',target:null,data_json:'{"description":"pH 6.4"}'}]
};

test('providerul trimite Responses API cu Structured Outputs și store=false', async () => {
  let request;
  const provider = new OpenAIProvider({
    apiKey:'test-key',
    fetchImpl:async (url, options) => {
      request={url,options};
      return {ok:true,status:200,json:async()=>apiResponse(base)};
    }
  });
  const result=await provider.interpret({text:'Notează pH 6.4',context:{entities:[]}});
  const payload=JSON.parse(request.options.body);
  assert.equal(request.url,'https://api.openai.com/v1/responses');
  assert.equal(request.options.headers.Authorization,'Bearer test-key');
  assert.equal(payload.store,false);
  assert.equal(payload.text.format.type,'json_schema');
  assert.equal(payload.text.format.strict,true);
  assert.ok(payload.instructions.includes('stock.change'));
  assert.ok(payload.instructions.includes('relation.move'));
  assert.ok(payload.instructions.includes('semantic_summary'));
  assert.ok(payload.instructions.includes('reminder_suggestions'));
  assert.equal(result.command.contractVersion,'collector.command.v1');
  assert.equal(result.command.operations[0].data.description,'pH 6.4');
  assert.equal(result.semanticSummary,'Am notat pH 6.4.');
  assert.deepEqual(result.memoryFacts,[]);
  assert.deepEqual(result.reminderSuggestions,[]);
  assert.ok(result.command.idempotencyKey);
  assert.equal(result.usage.inputTokens,123);
  assert.equal(result.usage.outputTokens,45);
  assert.equal(Object.keys(result).includes('usage'),false);
});

test('providerul refuză output JSON malformat', async () => {
  const provider=new OpenAIProvider({apiKey:'x',fetchImpl:async()=>({ok:true,status:200,json:async()=>({status:'completed',output_text:'not-json'})})});
  await assert.rejects(()=>provider.interpret({text:'test'}),SyntaxError);
});

test('providerul propagă erorile HTTP fără să expună cheia', async () => {
  const provider=new OpenAIProvider({apiKey:'secret',fetchImpl:async()=>({ok:false,status:401,json:async()=>({error:{message:'Invalid API key'}})})});
  await assert.rejects(()=>provider.interpret({text:'test'}),/Invalid API key/);
});

test('schema este strictă și nu permite operații arbitrare',()=>{
  assert.equal(INTERPRETATION_SCHEMA.additionalProperties,false);
  assert.equal(INTERPRETATION_SCHEMA.properties.operations.items.additionalProperties,false);
  assert.ok(INTERPRETATION_SCHEMA.properties.operations.items.properties.operation.enum.includes('stock.change'));
  assert.equal(INTERPRETATION_SCHEMA.properties.reminder_suggestions.items.additionalProperties,false);
  assert.ok(INTERPRETATION_SCHEMA.required.includes('semantic_summary'));
});


test('providerul normalizează reminder intent și memory facts în output bounded',async()=>{
 const payload={...base,semantic_summary:'Vineri cumpără materiale.',memory_facts:['Proiectul necesită materiale'],reminder_suggestions:[{intent:'reminder',certainty:'certain',explicitIntent:true,negated:false,title:'Cumpără materiale',due_date:'2026-11-27',due_time:null,timezone:'Europe/Bucharest',source_context:'Pentru proiect',clarificationQuestion:''}]};
 const provider=new OpenAIProvider({apiKey:'x',fetchImpl:async()=>({ok:true,status:200,json:async()=>apiResponse(payload)})});
 const result=await provider.interpret({text:'Vineri trebuie să cumpăr materialele, să nu uit'});
 assert.equal(result.semanticSummary,payload.semantic_summary);
 assert.deepEqual(result.memoryFacts,payload.memory_facts);
 assert.equal(result.reminderSuggestions[0].intent,'reminder');
 assert.deepEqual(result.reminderSuggestions[0].due,{date:'2026-11-27',time:null});
 assert.equal(result.reminderSuggestions[0].timezone,'Europe/Bucharest');
});
