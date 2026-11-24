(function(root){
 'use strict';
 let plugin=null,filesystem=null,capacitor=null,active=null;
 const safeName=id=>String(id).replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,100)||'audio';
 function configure(options={}){
  capacitor=options.capacitor||root.Capacitor;
  plugin=options.plugin||capacitor?.Plugins?.CapacitorAudioRecorder||null;
  filesystem=options.filesystem||capacitor?.Plugins?.Filesystem||null;
  return isAvailable();
 }
 function isAvailable(){return typeof capacitor?.isNativePlatform==='function'&&capacitor.isNativePlatform()&&!!plugin&&!!filesystem}
 async function ensureDirectory(){await filesystem.mkdir({path:'collector-audio',directory:'DATA',recursive:true})}
 async function start({id}={}){
  if(!isAvailable())throw new Error('Recorderul audio nativ nu este disponibil.');
  if(active)throw new Error('Există deja o înregistrare audio activă.');
  if(!id)throw new Error('Lipsește identificatorul înregistrării.');
  let permission=await plugin.checkPermissions();
  if(permission?.recordAudio!=='granted')permission=await plugin.requestPermissions();
  if(permission?.recordAudio!=='granted')throw new Error('Permisiunea pentru microfon nu a fost acordată.');
  await ensureDirectory();
  const filePath='collector-audio/'+safeName(id)+'.aac';
  await plugin.startRecording({format:'aac',bitRate:16000,sampleRate:44100,resetToPlaybackOnStop:true});
  active={id,filePath,startedAt:Date.now()};
  return {...active};
 }
 async function pause(){if(!active)throw new Error('Nu există o înregistrare activă.');await plugin.pauseRecording()}
 async function resume(){if(!active)throw new Error('Nu există o înregistrare activă.');await plugin.resumeRecording()}
 async function stop(){
  if(!active)throw new Error('Nu există o înregistrare activă.');
  const session=active;let result;
  try{result=await plugin.stopRecording()}
  catch(error){
   const recoveredUri=error?.data?.uri;
   if(!recoveredUri){active=null;throw error}
   result={uri:recoveredUri,duration:error?.data?.duration||Date.now()-session.startedAt,recovered:true};
  }
  active=null;
  if(!result?.uri)throw new Error('Recorderul nu a returnat un fișier audio.');
  await filesystem.copy({from:result.uri,to:session.filePath,toDirectory:'DATA'});
  const location=await filesystem.getUri({path:session.filePath,directory:'DATA'});
  try{await filesystem.deleteFile({path:result.uri})}catch{}
  let size=0;try{const stat=await filesystem.stat({path:session.filePath,directory:'DATA'});size=Number(stat?.size)||0}catch{}
  return {id:session.id,filePath:session.filePath,uri:location.uri,durationMs:Number(result.duration)||Date.now()-session.startedAt,size,mimeType:'audio/aac',mergeFailed:!!result.mergeFailed,recovered:!!result.recovered,warning:result.mergeFailed?'Înregistrarea a fost întreruptă; s-a păstrat segmentul principal.':result.recovered?'Fișierul parțial a fost recuperat după o eroare.':null,segments:Array.isArray(result.segments)?result.segments:[]};
 }
 async function cancel(){
  if(!active)return false;
  const session=active;await plugin.cancelRecording();active=null;
  try{await filesystem.deleteFile({path:session.filePath,directory:'DATA'})}catch{}
  return true;
 }
 async function removeFile(record){if(!record?.filePath)return false;await filesystem.deleteFile({path:record.filePath,directory:'DATA'});return true}
 function toPlayableUrl(uri){if(!uri)return '';return typeof capacitor?.convertFileSrc==='function'?capacitor.convertFileSrc(uri):uri}
 const api=Object.freeze({configure,isAvailable,start,pause,resume,stop,cancel,removeFile,toPlayableUrl});
 root.CollectorNativeAudioRecorder=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
