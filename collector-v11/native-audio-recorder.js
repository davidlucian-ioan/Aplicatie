(function(root){
 'use strict';
 let plugin=null,filesystem=null,capacitor=null,storage=null,active=null;
 const PENDING_KEY='collector_audio_pending_session_v1';
 const safeName=id=>String(id).replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,100)||'audio';
 function configure(options={}){
  capacitor=options.capacitor||root.Capacitor;
  plugin=options.plugin||capacitor?.Plugins?.CapacitorAudioRecorder||null;
  filesystem=options.filesystem||capacitor?.Plugins?.Filesystem||null;
  storage=options.storage||root.CollectorStorage||null;
  return isAvailable();
 }
 function isAvailable(){return typeof capacitor?.isNativePlatform==='function'&&capacitor.isNativePlatform()&&!!plugin&&!!filesystem}
 async function ensureDirectory(){await filesystem.mkdir({path:'collector-audio',directory:'DATA',recursive:true})}
 async function persistPending(session){if(!storage)throw new Error('Stocarea sesiunii audio nu este disponibilă.');await storage.writeRaw(PENDING_KEY,JSON.stringify(session))}
 async function clearPending(){if(!storage)throw new Error('Stocarea sesiunii audio nu este disponibilă.');await storage.removeRaw(PENDING_KEY)}
 async function getPending(){if(!storage)return null;const raw=await storage.readRaw(PENDING_KEY);if(raw===null)return null;const pending=JSON.parse(raw);if(!pending||typeof pending.id!=='string'||typeof pending.filePath!=='string'||!Number.isFinite(Number(pending.startedAt)))throw new Error('Checkpointul audio este invalid și a fost păstrat.');return pending}
 async function initialize(){if(!isAvailable())return false;if(!storage)return false;const pending=await getPending();if(pending)active={...pending,interrupted:true};return true}
 async function start({id}={}){
  if(!isAvailable())throw new Error('Recorderul audio nativ nu este disponibil.');
  if(active)throw new Error('Există deja o înregistrare activă sau întreruptă.');
  if(!id)throw new Error('Lipsește identificatorul înregistrării.');
  let permission=await plugin.checkPermissions();
  if(permission?.recordAudio!=='granted')permission=await plugin.requestPermissions();
  if(permission?.recordAudio!=='granted')throw new Error('Permisiunea pentru microfon nu a fost acordată.');
  await ensureDirectory();
  const session={id,filePath:'collector-audio/'+safeName(id)+'.aac',startedAt:Date.now(),format:'aac'};
  await persistPending(session);
  try{await plugin.startRecording({format:'aac',bitRate:16000,sampleRate:44100,resetToPlaybackOnStop:true});active=session;return {...active}}
  catch(error){try{await clearPending()}catch{}throw error}
 }
 async function pause(){if(!active)throw new Error('Nu există o înregistrare activă.');await plugin.pauseRecording()}
 async function resume(){if(!active)throw new Error('Nu există o înregistrare activă.');await plugin.resumeRecording()}
 async function stop(){
  if(!active)throw new Error('Nu există o înregistrare activă sau recuperabilă.');
  const session=active;let result,alreadySaved=false,size=0,location=null;
  try{const existing=await filesystem.stat({path:session.filePath,directory:'DATA'});if(Number(existing?.size)>0){alreadySaved=true;size=Number(existing.size);location=await filesystem.getUri({path:session.filePath,directory:'DATA'});result={uri:location.uri,duration:Date.now()-session.startedAt,recovered:true}}}catch{}
  if(!alreadySaved){
   try{result=await plugin.stopRecording()}
   catch(error){
    const recoveredUri=error?.data?.uri;
    if(!recoveredUri)throw error;
    result={uri:recoveredUri,duration:error?.data?.duration||Date.now()-session.startedAt,recovered:true};
   }
   if(!result?.uri)throw new Error('Recorderul nu a returnat un fișier audio. Checkpointul a fost păstrat pentru o nouă încercare.');
   const sourceUri=result.uri;
   await filesystem.copy({from:sourceUri,to:session.filePath,toDirectory:'DATA'});
   location=await filesystem.getUri({path:session.filePath,directory:'DATA'});
   result={...result,uri:location.uri};
   for(const segment of new Set([sourceUri,...(Array.isArray(result.segments)?result.segments:[])])){try{await filesystem.deleteFile({path:segment})}catch{}}
   try{const stat=await filesystem.stat({path:session.filePath,directory:'DATA'});size=Number(stat?.size)||0}catch{}
  }
  active=null;
  return {id:session.id,filePath:session.filePath,uri:location.uri,durationMs:Number(result.duration)||Date.now()-session.startedAt,size,mimeType:'audio/aac',mergeFailed:!!result.mergeFailed,recovered:!!result.recovered||!!session.interrupted,warning:result.mergeFailed?'Înregistrarea a fost întreruptă; s-a păstrat segmentul principal.':(result.recovered||session.interrupted)?'Sesiunea întreruptă a fost recuperată; verifică redarea.':null,segments:Array.isArray(result.segments)?result.segments:[]};
 }
 async function complete(id){const pending=await getPending();if(!pending||id&&pending.id!==id)return false;await clearPending();return true}
 async function cancel(){if(!active)return false;const session=active;await plugin.cancelRecording();active=null;try{await filesystem.deleteFile({path:session.filePath,directory:'DATA'})}catch{}await clearPending();return true}
 async function removeFile(record){if(!record?.filePath)return false;await filesystem.deleteFile({path:record.filePath,directory:'DATA'});return true}
 function toPlayableUrl(uri){if(!uri)return '';return typeof capacitor?.convertFileSrc==='function'?capacitor.convertFileSrc(uri):uri}
 const api=Object.freeze({configure,isAvailable,initialize,getPending,complete,start,pause,resume,stop,cancel,removeFile,toPlayableUrl});
 root.CollectorNativeAudioRecorder=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
