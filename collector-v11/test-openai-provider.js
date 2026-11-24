'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { OpenAIProvider, INTERPRETATION_SCHEMA } = require('./ai/provider-openai');

function apiResponse(parsed) {
  return { status:'completed', output_text:JSON.stringify(parsed) };
}
const base = {
  intent:'propose', answer:'', question:'', confidence:0.94,
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
  assert.equal(result.operations[0].data.description,'pH 6.4');
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
});
