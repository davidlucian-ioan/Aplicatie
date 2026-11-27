'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { OpenAITranscriptionProvider, AUDIO_FORMATS } = require('./provider-openai-transcription');

test('OpenAI transcription provider sends the selected binary using multipart form data', async () => {
  let request;
  const provider = new OpenAITranscriptionProvider({
    apiKey:'server-only-test-key',
    model:'test-transcription-model',
    fetchImpl:async (url, options) => {
      request={url,options};
      return {ok:true,status:200,json:async()=>({text:'Am notat trei plante.'})};
    }
  });
  const result=await provider.transcribe({audio:Buffer.from('fake-audio'),contentType:'audio/webm'});
  assert.equal(request.url,'https://api.openai.com/v1/audio/transcriptions');
  assert.equal(request.options.method,'POST');
  assert.equal(request.options.headers.Authorization,'Bearer server-only-test-key');
  assert.equal(request.options.body.get('model'),'test-transcription-model');
  assert.equal(request.options.body.get('response_format'),'json');
  const file=request.options.body.get('file');
  assert.equal(file.name,'recording.webm');
  assert.equal(file.type,'audio/webm');
  assert.deepEqual(result,{text:'Am notat trei plante.',model:'test-transcription-model'});
});

test('transcription provider recognizes only the explicit audio MIME allowlist', async () => {
  assert.deepEqual(Object.keys(AUDIO_FORMATS).sort(),[
    'audio/aac','audio/m4a','audio/mp3','audio/mp4','audio/mpeg','audio/ogg','audio/wav','audio/webm','audio/x-m4a','audio/x-wav'
  ]);
  const provider=new OpenAITranscriptionProvider({apiKey:'x',fetchImpl:async()=>{throw Error('must not call upstream')}});
  await assert.rejects(()=>provider.transcribe({audio:Buffer.from('x'),contentType:'text/plain'}),{status:415});
});

test('transcription provider rejects empty audio and absent server credentials', async () => {
  assert.throws(()=>new OpenAITranscriptionProvider({apiKey:''}),/OPENAI_API_KEY/);
  const provider=new OpenAITranscriptionProvider({apiKey:'x',fetchImpl:async()=>{throw Error('must not call upstream')}});
  await assert.rejects(()=>provider.transcribe({audio:Buffer.alloc(0),contentType:'audio/webm'}),{status:400});
});

test('transcription provider maps upstream errors to a safe response without exposing secrets', async () => {
  const provider=new OpenAITranscriptionProvider({
    apiKey:'do-not-leak',
    fetchImpl:async()=>({ok:false,status:429,json:async()=>({error:{message:'secret provider details'}})})
  });
  await assert.rejects(
    ()=>provider.transcribe({audio:Buffer.from('audio'),contentType:'audio/mp4'}),
    error=>error.status===429&&!error.message.includes('do-not-leak')&&!error.message.includes('secret provider details')
  );
});

test('transcription provider aborts an upstream request at its timeout', async () => {
  const provider=new OpenAITranscriptionProvider({
    apiKey:'x',timeoutMs:5,
    fetchImpl:async(_url,{signal})=>new Promise((resolve,reject)=>{
      if(signal.aborted){reject(new Error('aborted'));return}
      signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});
    })
  });
  await assert.rejects(()=>provider.transcribe({audio:Buffer.from('audio'),contentType:'audio/webm'}),/aborted/);
});
