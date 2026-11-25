'use strict';
const E=window.CollectorEngine, KEY='collector_mvp_v2', OLD_KEY='collector_mvp_v1';
const storageAdapter=window.CollectorStorageAdapter.createAutoStorageAdapter({capacitor:window.Capacitor,sqlite:window.Capacitor?.Plugins?.CapacitorSQLite,legacyStorage:window.localStorage});
window.CollectorStorage=storageAdapter;
const titles={dashboard:['Think','Analize, grafice, configurare și administrarea datelor.'],entities:['Entități','Entități universale, atribute temporale și cronologie.'],relations:['Relații & locații','Relații de prim rang, localizare temporală și ierarhie.'],inventory:['Populații & solduri','Cantități anonime și solduri derivate din evenimente.'],finance:['Financiar','Tranzacții pe evenimente și indicatori derivați.'],attributes:['Atribute','Definiții configurabile cu tip, rol, natură, proprietar și reguli.'],events:['Evenimente','Jurnalul de evenimente append-only.'],history:['Istoric','Cronologie completă și filtrabilă.'],assistant:['Work','Înregistrare rapidă, alarme și introducere vocală, cu confirmare înainte de salvare.'],audit:['Audit & date','Replay, export, import și limitele implementării.']};
let integrityBlocked=false, integrityBlockReason=null, integrityRawBackup=null, integrityCanRebuild=false;
let db=E.emptyState(), currentEntityId=null, aiCorePort=null, pendingCoreCommand=null, localDataErasing=false;
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function id(){return E.uid()}
function commandIntentKey(){return `collector-intent:${E.uid()}`}
async function loadDb(){
 let raw=null,rawText=null,parseError=null,sourceKey=KEY;
 try{rawText=await storageAdapter.readRaw(KEY);if(rawText!==null)raw=JSON.parse(rawText)}catch(error){parseError=error}
 if(raw===null&&parseError===null){sourceKey=OLD_KEY;try{rawText=await storageAdapter.readRaw(OLD_KEY);if(rawText!==null)raw=JSON.parse(rawText)}catch(error){parseError=error}}
 const preserveAndBlock=(source,error,warnings=[],canRebuild=false)=>{integrityBlocked=true;integrityCanRebuild=canRebuild;integrityBlockReason=String(error?.message||error||'Integritatea datelor nu a putut fi confirmată.');integrityRawBackup=source;const preserved=E.normDb(source);preserved.meta={...preserved.meta,replayWarnings:warnings,integrityError:integrityBlockReason};return preserved};
 if(parseError)return preserveAndBlock({storageKey:sourceKey,rawStorageValue:rawText},'Datele locale nu sunt JSON valid: '+parseError.message);
 if(raw===null){const empty=E.emptyState();if(!await persistRaw(empty))return preserveAndBlock(empty,'Stocarea locală nu a putut inițializa baza de date.');return empty}
 if(typeof raw!=='object'||Array.isArray(raw))return preserveAndBlock({rawPayload:raw},'Structura datelor locale nu este un obiect valid.');
 if(raw.schemaVersion!==undefined&&(!Number.isInteger(raw.schemaVersion)||raw.schemaVersion>7))return preserveAndBlock(raw,'Versiunea schemei este invalidă sau mai nouă decât versiunea suportată. Datele originale au fost păstrate.');
 if(raw.schemaVersion!==undefined&&raw.schemaVersion!==6&&raw.schemaVersion!==7)return preserveAndBlock(raw,'Nu există o migrare verificată pentru schema '+raw.schemaVersion+'. Datele originale au fost păstrate în modul numai citire.');
 if(raw.schemaVersion===7){try{const validated=E.validateImport(raw);if(!await persistRaw(validated))throw Error('Nu am putut salva starea verificată în localStorage.');return validated}catch(error){const replayed=E.replay(Array.isArray(raw.events)?raw.events:[],[]),warnings=replayed.meta.replayWarnings||[],projectionMatch=String(error?.message||'').match(/^Import blocat: proiecția „([^”]+)” nu corespunde jurnalului/),canRebuild=warnings.length===0&&!!projectionMatch&&projectionMatch[1]!=='attributes';return preserveAndBlock(raw,error,warnings,canRebuild)}}
 for(const key of ['entities','events','attributes','relations','stock','finance','eventAttributes'])if(raw[key]!==undefined&&!Array.isArray(raw[key]))return preserveAndBlock(raw,'Proiecția veche „'+key+'” nu este o listă validă; datele originale au fost păstrate.');
 const attrs=Array.isArray(raw.attributes)?raw.attributes:[],sourceEvents=Array.isArray(raw.events)?raw.events:[];
 if(sourceEvents.some(e=>!e||typeof e!=='object'||Array.isArray(e)||typeof e.id!=='string'||!e.id.trim()))return preserveAndBlock(raw,'Jurnalul vechi conține un eveniment fără ID valid.');
 let events=sourceEvents.map(e=>({...e,status:e.status||'committed'}));const known=new Set(events.map(e=>e.id));
 const legacyEntityTimes=Array.isArray(raw.entities)?raw.entities.map(e=>Date.parse(e?.createdAt)||0):[];let migrationClock=Math.max(Date.now(),...events.map(e=>Date.parse(e.timestamp)||0),...legacyEntityTimes)+1;const migrationTimestamp=()=>new Date(migrationClock++).toISOString();
 // Legacy attribute definitions become explicit journal events so the migrated v7 backup remains replay-verifiable.
 for(const definition of attrs){
  if(!definition||typeof definition!=='object'||typeof definition.name!=='string'||!definition.name.trim())return preserveAndBlock(raw,'O definiție de atribut veche este invalidă și nu poate fi migrată automat.');
  const ev={id:id(),type:'migration.attribute_definition_imported',timestamp:migrationTimestamp(),source:'migration',actor:'system',status:'committed',payload:{attribute:definition.name},operations:[{operation:'attribute.define',data:definition}]};
  events.push(ev);known.add(ev.id);
 }
 // Migrate legacy projections to append-only migration events where the old journal is incomplete.
 for(const ent of (Array.isArray(raw.entities)?raw.entities:[])){
  if(!ent||typeof ent!=='object'||Array.isArray(ent)||typeof ent.id!=='string'||!ent.id.trim())return preserveAndBlock(raw,'O proiecție veche de entitate este invalidă și nu poate fi migrată automat.');
  if(!events.some(ev=>ev.operations?.some(o=>(o.target===ent.id||o.entityId===ent.id||o.data?.entityId===ent.id)&&['create','entity.create'].includes(o.operation)))){
   const ev={id:id(),type:'migration.entity_imported',timestamp:migrationTimestamp(),source:'migration',actor:'system',status:'committed',payload:{entityId:ent.id,name:ent.name,type:ent.type},operations:[{target:ent.id,operation:'entity.create',data:{name:ent.name,type:ent.type}}]};
   if(!known.has(ev.id)){events.push(ev);known.add(ev.id)}
  }
 }
 let state=E.replay(events,[]);
 for(const ent of (Array.isArray(raw.entities)?raw.entities:[])){
  let projected=state.entities.find(x=>x.id===ent.id);
  if(!projected)return preserveAndBlock(raw,'O entitate veche nu poate fi reconstruită din jurnal.');
  if(projected.type!==String(ent.type||'generic'))return preserveAndBlock(raw,'Tipul unei entități vechi diferă de jurnal și nu poate fi migrat automat.');
  if(projected.name!==String(ent.name||'Fără nume')){
   const ev={id:id(),type:'migration.entity_renamed',timestamp:migrationTimestamp(),source:'migration',actor:'system',status:'committed',payload:{entityId:ent.id,name:ent.name},operations:[{target:ent.id,operation:'entity.rename',data:{name:ent.name}}]};
   events.push(ev);state=E.replay(events,[]);projected=state.entities.find(x=>x.id===ent.id);
  }
  for(const [name,value] of Object.entries(ent.attributes||{})){
   if(JSON.stringify(projected.attributes?.[name])!==JSON.stringify(value)){
    const ev={id:id(),type:'migration.attribute_imported',timestamp:migrationTimestamp(),source:'migration',actor:'system',status:'committed',payload:{entityId:ent.id,attribute:name,value},operations:[{target:ent.id,operation:'attribute.set',data:{name,value,certainty:'certain'}}]};
    events.push(ev);state=E.replay(events,[]);projected=state.entities.find(x=>x.id===ent.id);
   }
  }
 }
 state.events=events;state.schemaVersion=7;state.meta={...state.meta,...raw.meta,replayWarnings:state.meta.replayWarnings||[]};
 if((state.meta.replayWarnings||[]).length)return preserveAndBlock(raw,'Jurnalul vechi conține evenimente care nu pot fi reconstruite.',state.meta.replayWarnings);
 const comparable=rows=>rows.map(row=>{if(!row||typeof row!=='object')return row;const {id,...rest}=row;return rest});
 for(const key of ['relations','stock','finance','eventAttributes']){
  if(!Array.isArray(raw[key]))continue;
  const stored=['stock','finance','eventAttributes'].includes(key)?comparable(raw[key]):raw[key];
  const replayed=['stock','finance','eventAttributes'].includes(key)?comparable(state[key]||[]):(state[key]||[]);
  if(JSON.stringify(stored)!==JSON.stringify(replayed))return preserveAndBlock(raw,'Proiecția veche „'+key+'” nu corespunde jurnalului. Datele originale au fost păstrate; migrarea automată a fost oprită.');
 }
 let validated;try{validated=E.validateImport(state)}catch(error){return preserveAndBlock(raw,error,state.meta.replayWarnings||[])}
 if(!await persistRaw(validated))return preserveAndBlock(raw,'Migrarea nu a putut fi salvată în localStorage.');
 return validated;
}
async function persistRaw(x){if(localDataErasing)return false;try{await storageAdapter.writeRaw(KEY,JSON.stringify(x));return true}catch(err){console.error(err);return false}}
function ensureAICorePort(){if(aiCorePort)return aiCorePort;const Port=window.CollectorBrowserCorePort;if(!Port)throw Error('Core Port nu a fost încărcat.');aiCorePort=new Port({core:E,store:{getState:()=>db,persistState:async next=>!integrityBlocked&&!localDataErasing&&await persistRaw(next),publishState:async next=>{if(localDataErasing)throw Error('Datele locale sunt în curs de ștergere.');db=next;render()}}});return aiCorePort}
let mutationQueue=Promise.resolve();
function serializeMutation(action){
 if(localDataErasing)return Promise.reject(new Error('Datele locale sunt în curs de ștergere.'));
 const operation=mutationQueue.then(()=>{if(localDataErasing)throw new Error('Datele locale sunt în curs de ștergere.');return action()});
 mutationQueue=operation.catch(()=>undefined);
 return operation;
}
function commit(type,operations,payload={},extra={}){return serializeMutation(()=>commitNow(type,operations,payload,extra))}
async function commitNow(type,operations,payload={},extra={}){if(integrityBlocked){alert('Aplicația este în mod numai citire: '+integrityBlockReason+'. Exportă datele originale sau importă un backup valid înainte de a continua.');return false}const ev={id:id(),type,timestamp:E.now(),source:extra.source||'user',actor:'local-user',certainty:extra.certainty||'certain',intentKey:extra.intentKey||null,payload,operations};try{const sourceOfTruth=E.replay(db.events,[]);sourceOfTruth.meta={...db.meta,...sourceOfTruth.meta};const result=E.commit(sourceOfTruth,ev);if(result.duplicate){alert('Această intenție a fost deja procesată; nu am aplicat-o a doua oară.');return false}// Persist the candidate before publishing it; a failed write must not leak into later commands.
if(!await persistRaw(result.db))throw Error('Nu am putut salva datele pe dispozitiv. Exportă datele și eliberează spațiu.');db=result.db;render();return result.event}catch(err){alert('Operația a fost anulată integral: '+err.message);return false}}
function setMenuOpen(open){const sidebar=document.getElementById('appSidebar'),toggle=document.getElementById('menuToggle'),backdrop=document.getElementById('sidebarBackdrop');if(!sidebar||!toggle||!backdrop)return;const wasOpen=sidebar.classList.contains('open'),restoreFocus=!open&&wasOpen&&(sidebar.contains(document.activeElement)||document.activeElement===backdrop);sidebar.classList.toggle('open',open);backdrop.classList.toggle('visible',open);toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Închide meniul':'Deschide meniul');if(restoreFocus)toggle.focus()}
function setAppStatus(message){const status=document.getElementById('appStatus');if(status)status.textContent=message}
function showPage(p){if(!titles[p])return;document.querySelectorAll('.page').forEach(x=>x.classList.toggle('active',x.id===p));document.querySelectorAll('.nav').forEach(x=>{const active=x.dataset.page===p;x.classList.toggle('active',active);if(active)x.setAttribute('aria-current','page');else x.removeAttribute('aria-current')});document.getElementById('title').textContent=titles[p][0];document.getElementById('subtitle').textContent=titles[p][1];setMenuOpen(false);render()}
document.querySelectorAll('.nav').forEach(n=>n.onclick=()=>showPage(n.dataset.page));
document.getElementById('menuToggle')?.addEventListener('click',()=>setMenuOpen(!document.getElementById('appSidebar').classList.contains('open')));
document.getElementById('sidebarBackdrop')?.addEventListener('click',()=>setMenuOpen(false));
document.addEventListener('keydown',event=>{if(event.key==='Escape')setMenuOpen(false)});
let modalReturnFocus=null;function modalFocusable(){return [...document.querySelectorAll('#modal button:not([disabled]),#modal input:not([disabled]),#modal select:not([disabled]),#modal textarea:not([disabled]),#modal [href],#modal [tabindex]:not([tabindex="-1"])')].filter(el=>el.offsetParent!==null)}function openModal(html){const modal=document.getElementById('modal');modalReturnFocus=document.activeElement;document.getElementById('modalContent').innerHTML=html;const heading=document.querySelector('#modalContent h2');if(heading)heading.id='modalTitle';modal.classList.remove('hidden');const first=modalFocusable().find(el=>!el.classList.contains('close'))||modal.querySelector('.close');first?.focus()}function closeModal(){const modal=document.getElementById('modal');modal.classList.add('hidden');modalReturnFocus?.focus?.();modalReturnFocus=null}document.addEventListener('keydown',event=>{const modal=document.getElementById('modal');if(modal?.classList.contains('hidden'))return;if(event.key==='Escape'){event.preventDefault();closeModal();return}if(event.key==='Tab'){const items=modalFocusable();if(!items.length){event.preventDefault();modal.querySelector('.modal-box')?.focus();return}const first=items[0],last=items[items.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}});document.getElementById('modal')?.addEventListener('click',event=>{if(event.target.id==='modal')closeModal()});
function field(label,id,placeholder='',type='text'){return `<label for="${id}">${label}</label><input id="${id}" type="${type}" placeholder="${placeholder}"/>`}
function selectField(label,id,opts){return `<label for="${id}">${label}</label><select id="${id}">${opts.map(o=>`<option value="${esc(o[0])}">${esc(o[1])}</option>`).join('')}</select>`}
function optionsEntities(filter=()=>true,first='— selectează —'){return [['',first],...db.entities.filter(filter).map(e=>[e.id,`${e.name} (${e.type})`])]}
function addEntity(){openModal(`<h2>Entitate nouă</h2><div class="form">${field('Nume','newName','Ex. Monstera variegată')}${field('Tip configurabil','newType','Ex. plantă, individ, obiect, specimen')}<div class="form-actions"><button class="secondary" onclick="closeModal()">Anulează</button><button class="primary" onclick="saveEntity()">Creează</button></div></div>`)}
async function saveEntity(typeOverride=null){const name=document.getElementById('newName')?.value.trim(),type=typeOverride||document.getElementById('newType')?.value.trim()||'generic';if(!name)return alert('Completează numele.');const eid=id();if(await commit('entity.created',[{operation:'entity.create',target:eid,data:{name,type}}],{entityId:eid,name,type})){closeModal();showPage('entities')}}
function addLocation(){openModal(`<h2>Locație nouă</h2><div class="form">${field('Nume locație','locName','Ex. Sera 2 / Raft 4')}${selectField('Părinte (opțional)','locParent',optionsEntities(e=>e.type==='location','Fără părinte'))}<div class="form-actions"><button class="secondary" onclick="closeModal()">Anulează</button><button class="primary" onclick="saveLocation()">Creează locație</button></div></div>`)}
async function saveLocation(){const name=document.getElementById('locName').value.trim(),parent=document.getElementById('locParent').value;if(!name)return alert('Completează numele locației.');const lid=id(),ops=[{operation:'entity.create',target:lid,data:{name,type:'location'}}];if(parent)ops.push({operation:'relation.create',data:{sourceId:parent,targetId:lid,type:'contains'}});if(await commit('location.created',ops,{entityId:lid,name,parentId:parent||null,summary:parent?'Locație creată în ierarhia spațiilor':'Locație creată'})){closeModal();showPage('relations')}}
function relationHelp(type){const help={related_to:'Legătură generică. Nu implică proprietate, localizare sau ierarhie.',located_in:'Localizare curentă a unei entități într-o locație. O entitate poate avea o singură locație activă; mutările păstrează istoricul.',parent_of:'Sursa este părintele logic al destinației. Direcția este sursă → copil; nu se creează automat relația inversă.',contains:'Sursa conține destinația. Pentru locații, folosește aceasta pentru seră → raft sau cameră → dulap; locațiile nu se mută.',owns:'Sursa deține destinația. Nu presupune automat drepturi exclusive sau relația inversă.',custom:'Definește un nume explicit pentru relația specifică domeniului.'};return help[type]||''}
function refreshRelationForm(){const type=document.getElementById('relType').value,custom=document.getElementById('relCustom'),target=document.getElementById('relTarget'),source=document.getElementById('relSource');custom.disabled=type!=='custom';custom.required=type==='custom';custom.placeholder=type==='custom'?'Obligatoriu, ex. crescut_din':'Folosit doar pentru tipul Personalizat';document.getElementById('relHelp').textContent=relationHelp(type);const old=target.value;const opts=type==='located_in'?optionsEntities(e=>e.type==='location','Selectează locația'):optionsEntities();target.innerHTML=opts.map(o=>`<option value="${esc(o[0])}">${esc(o[1])}</option>`).join('');if(opts.some(o=>o[0]===old))target.value=old;if(type==='located_in'){source.querySelectorAll('option').forEach(o=>{const ent=db.entities.find(e=>e.id===o.value);o.disabled=!!ent&&ent.type==='location';});}else source.querySelectorAll('option').forEach(o=>o.disabled=false)}
function addRelation(){if(db.entities.length<2)return alert('Creează cel puțin două entități sau locații.');openModal(`<h2>Relație nouă</h2><div class="form">${selectField('Sursă','relSource',optionsEntities())}${selectField('Tip relație','relType',[['related_to','Asociat cu'],['located_in','Localizat în'],['parent_of','Părinte pentru'],['contains','Conține'],['owns','Deține'],['custom','Personalizat']])}${field('Nume tip personalizat','relCustom','Folosit doar pentru tipul Personalizat')}<div class="note" id="relHelp"></div>${selectField('Destinație','relTarget',optionsEntities())}<div class="note">Direcția este întotdeauna sursă → destinație. Relațiile nu sunt inversate automat.</div><div class="form-actions"><button class="secondary" onclick="closeModal()">Anulează</button><button class="primary" onclick="saveRelation()">Salvează relația</button></div></div>`);document.getElementById('relType').addEventListener('change',refreshRelationForm);refreshRelationForm()}
async function saveRelation(){const sourceId=document.getElementById('relSource').value,targetId=document.getElementById('relTarget').value,type=document.getElementById('relType').value,customTypeName=document.getElementById('relCustom').value.trim();if(!sourceId||!targetId)return alert('Alege sursa și destinația.');if(type==='custom'&&!customTypeName)return alert('Numele tipului personalizat este obligatoriu.');const source=db.entities.find(e=>e.id===sourceId),target=db.entities.find(e=>e.id===targetId);if(type==='located_in'&&source?.type==='location')return alert('O locație nu se mută. Pentru ierarhia locațiilor folosește „Conține”, cu locația părinte ca sursă și locația copil ca destinație.');if(type==='located_in'&&target?.type!=='location')return alert('„Localizat în” trebuie să aibă o locație ca destinație.');const data={sourceId,targetId,type,...(type==='custom'?{customTypeName}:{})};if(await commit('relation.created',[{operation:'relation.create',data}],{sourceId,targetId,relationType:type,customTypeName:type==='custom'?customTypeName:null})){closeModal();showPage('relations')}}
function addAttribute(){attributeForm(null)}function attributeForm(entityId){const suggestions=[['description','Descriere'],['identification','Identificare'],['state','Stare'],['measurement','Măsurare'],['financial','Financiar'],['other','Alt rol']];openModal(`<h2>${entityId?'Atribut pentru entitate':'Definiție atribut'}</h2><div class="form">${field('Nume','attrName','Ex. pH')}${selectField('Tip de date','attrType',[['text','Text'],['number','Număr'],['boolean','Adevărat/fals'],['date','Dată'],['json','Structură JSON']])}${selectField('Rol','attrRole',suggestions)}${selectField('Natură','attrNature',[['static','Static'],['dynamic','Dinamic'],['calculated','Calculat']])}${selectField('Proprietar','attrOwner',[['entity','Entitate'],['location','Locație'],['relation','Relație'],['event','Eveniment']])}${field('Limită recomandată minimă (opțional)','attrMin','Ex. 5.5','number')}${field('Limită recomandată maximă (opțional)','attrMax','Ex. 6.5','number')}<label><input type="checkbox" id="attrRequired"> Obligatoriu</label><label><input type="checkbox" id="attrIdentifying"> Relevant pentru identificare</label><label><input type="checkbox" id="attrHistory" checked> Păstrează istoric</label>${entityId?field('Valoare inițială','attrValue','Valoare')+`<label><input type="checkbox" id="attrCertain" checked> Valoare sigură</label>`:''}<div class="note" id="attrSuggestion">Limitele min/max sunt orientative: valorile din afara intervalului vor genera avertisment, dar vor putea fi înregistrate. Nu bloca măsurătorile reale.</div><div class="form-actions"><button class="secondary" onclick="closeModal()">Anulează</button><button class="primary" onclick="saveAttribute('${entityId||''}')">Salvează</button></div></div>`);document.getElementById('attrName').addEventListener('input',suggestAttributeForm)}
function suggestAttributeForm(){const n=document.getElementById('attrName').value.trim().toLowerCase(),tip=['ph','ec','tds','temperatură','temperatura','umiditate','înălțime','inaltime'].includes(n),ident=['cod','serie','număr de serie','numar de serie','identificator'].includes(n);if(tip){document.getElementById('attrType').value='number';document.getElementById('attrRole').value='measurement';document.getElementById('attrNature').value='dynamic';document.getElementById('attrHistory').checked=true}if(ident){document.getElementById('attrRole').value='identification';document.getElementById('attrIdentifying').checked=true}document.getElementById('attrSuggestion').textContent=tip?'Sugestie: măsurare numerică dinamică, cu istoric. Verifică înainte de salvare.':ident?'Sugestie: posibil identificator stabil. Confirmă unicitatea și semnificația.':'Sugestie generică; definește explicit semnificația temporală și rolul.'}
async function saveAttribute(entityId){const name=document.getElementById('attrName').value.trim();if(!name)return alert('Numele atributului este obligatoriu.');const minRaw=document.getElementById('attrMin').value,maxRaw=document.getElementById('attrMax').value,min=minRaw===''?null:Number(minRaw),max=maxRaw===''?null:Number(maxRaw);if(min!==null&&!Number.isFinite(min)||max!==null&&!Number.isFinite(max))return alert('Limitele trebuie să fie numere valide.');if(min!==null&&max!==null&&min>max)return alert('Limita minimă nu poate fi mai mare decât limita maximă.');const def={id:id(),name,type:document.getElementById('attrType').value,role:document.getElementById('attrRole').value,nature:document.getElementById('attrNature').value,ownerType:document.getElementById('attrOwner').value,required:document.getElementById('attrRequired').checked,identifying:document.getElementById('attrIdentifying').checked,historyEnabled:document.getElementById('attrHistory').checked,validation:{min,max}};const ops=[{operation:'attribute.define',data:def}];if(entityId){const targetEntity=db.entities.find(e=>e.id===entityId);if(def.ownerType==='relation'||def.ownerType==='event')return alert('Atributul are proprietar '+def.ownerType+'. Atașează-l unei relații sau unui eveniment, nu unei entități.');if(def.ownerType==='location'&&targetEntity?.type!=='location')return alert('Atributul este definit pentru locații. Selectează o entitate de tip locație.');const raw=document.getElementById('attrValue').value;if(raw.trim()!==''||def.required){let value;try{value=parseTyped(raw,def.type);if(!confirmAttributeWarnings(def,value))return}catch(err){return alert(err.message)}ops.push({operation:'attribute.set',target:entityId,data:{name,value,certainty:document.getElementById('attrCertain').checked?'certain':'uncertain'}})}}if(await commit('attribute.configured',ops,{attribute:name,entityId:entityId||null,definition:def})){closeModal();if(entityId)showPage('entities');else showPage('attributes')}}
function parseTyped(raw,type){if(type==='number'){if(raw.trim()==='')throw Error('Valoarea numerică este obligatorie.');const n=Number(raw);if(!Number.isFinite(n))throw Error('Introdu un număr valid.');return n}if(type==='boolean'){if(['true','da','1'].includes(raw.toLowerCase()))return true;if(['false','nu','0'].includes(raw.toLowerCase()))return false;throw Error('Folosește da/nu sau true/false.')}if(type==='json'){try{return JSON.parse(raw)}catch{throw Error('JSON invalid.')}}return raw}
function validateAttribute(def,value){if(def.required&&(value===null||value===''))throw Error(`„${def.name}” este obligatoriu.`);const warnings=[];if(def.type==='number'&&value!==''&&value!==null&&Number.isFinite(Number(value))){if(def.validation?.min!==null&&def.validation?.min!==undefined&&Number(value)<def.validation.min)warnings.push(`sub limita recomandată ${def.validation.min}`);if(def.validation?.max!==null&&def.validation?.max!==undefined&&Number(value)>def.validation.max)warnings.push(`peste limita recomandată ${def.validation.max}`)}return warnings}
function confirmAttributeWarnings(def,value){const warnings=validateAttribute(def,value);return !warnings.length||confirm(`Atenție: valoarea ${def.name} = ${value} este ${warnings.join(' și ')}. Valoarea reală poate fi înregistrată. Continui?`)}
function editAttribute(entityId,name){const e=db.entities.find(x=>x.id===entityId);if(!e)return;const def=db.attributes.find(a=>a.name.toLowerCase()===name.toLowerCase())||{type:typeof e.attributes[name]==='number'?'number':'text',name};openModal(`<h2>Valoare atribut: ${esc(name)}</h2><div class="form">${field('Valoare curentă / nouă','editAttrValue','Valoare')}${selectField('Certitudine','editAttrCertainty',[['certain','Sigură'],['uncertain','Incertă']])}<div class="note">Valoarea anterioară rămâne în jurnal. Corecțiile sunt evenimente noi.</div><div class="form-actions"><button class="secondary" onclick="closeModal()">Anulează</button><button class="primary" onclick="saveEditedAttribute('${entityId}','${encodeURIComponent(name)}')">Înregistrează valoarea</button></div></div>`);document.getElementById('editAttrValue').value=String(e.attributes[name]??'')}
async function saveEditedAttribute(entityId,encoded){const name=decodeURIComponent(encoded),def=db.attributes.find(a=>a.name.toLowerCase()===name.toLowerCase())||{type:'text',name};let value;try{value=parseTyped(document.getElementById('editAttrValue').value,def.type);if(!confirmAttributeWarnings(def,value))return}catch(err){return alert(err.message)}const certainty=document.getElementById('editAttrCertainty').value;if(await commit('attribute.value_changed',[{operation:'attribute.set',target:entityId,data:{name,value,certainty,forceHistory:true}}],{entityId,attribute:name,value,certainty},{certainty})){closeModal();showPage('entities')}}
function addPopulation(){openModal(`<h2>Grup / populație</h2><div class="form">${field('Nume grup','popName','Ex. Fancy anonimi')}${field('Tip / linie','popType','Ex. Fancy Tiger')}${field('Cantitate inițială','popQty','5','number')}${selectField('Certitudine','popCertainty',[['certain','Sigură'],['uncertain','Incertă']])}${selectField('Locație inițială','popLoc',optionsEntities(e=>e.type==='location','Fără locație'))}<div class="note">Nu se creează indivizi individuali pentru cantitatea anonimă.</div><div class="form-actions"><button class="secondary" onclick="closeModal()">Anulează</button><button class="primary" onclick="savePopulation()">Creează populație</button></div></div>`)}
async function savePopulation(){const name=document.getElementById('popName').value.trim(),type=document.getElementById('popType').value.trim()||'population',qty=Number(document.getElementById('popQty').value),locationId=document.getElementById('popLoc').value,certainty=document.getElementById('popCertainty').value;if(!name||!Number.isFinite(qty)||qty<=0)return alert('Completează numele și o cantitate pozitivă.');const pid=id(),ops=[{operation:'entity.create',target:pid,data:{name,type:'population',populationType:type}}];if(locationId)ops.push({operation:'relation.create',data:{sourceId:pid,targetId:locationId,type:'located_in'}});ops.push({operation:'stock.change',data:{populationId:pid,locationId:locationId||null,quantity:qty,action:'add',disposition:'active',certainty}});if(await commit('population.created',ops,{entityId:pid,name,populationType:type,quantity:qty,locationId:locationId||null,summary:`Populație creată: ${name}, cantitate inițială ${qty}${locationId?' în '+(db.entities.find(e=>e.id===locationId)?.name||'locație'):''}`},{certainty})){closeModal();showPage('inventory')}}
function addStockAction(){const pops=db.entities.filter(e=>e.type==='population'||e.type==='group'||e.attributes?.populationType);if(!pops.length)return alert('Creează mai întâi o populație/grup.');openModal(`<h2>Mișcare de stoc</h2><div class="form">${selectField('Populație / grup','stockPop',pops.map(e=>[e.id,e.name]))}${selectField('Acțiune','stockAction',[['add','Adaugă cantitate'],['move_out','Mută între locații'],['sell','Vinde'],['dispose','Scade / pierdere']])}${selectField('Locație sursă','stockLoc',optionsEntities(e=>e.type==='location','Fără locație'))}${selectField('Destinație (pentru mutare)','stockDest',optionsEntities(e=>e.type==='location','Selectează destinația'))}${field('Cantitate','stockQty','1','number')}${selectField('Certitudine','stockCertainty',[['certain','Sigură'],['uncertain','Incertă']])}<div class="note">Operația verifică soldul disponibil. Dacă nu există cantitate suficientă, întreaga operație este anulată.</div><div class="form-actions"><button class="secondary" onclick="closeModal()">Anulează</button><button class="primary" onclick="saveStockAction()">Previzualizează</button></div></div>`)}
async function saveStockAction(){const populationId=document.getElementById('stockPop').value,action=document.getElementById('stockAction').value,locationId=document.getElementById('stockLoc').value||null,destinationId=document.getElementById('stockDest').value||null,quantity=Number(document.getElementById('stockQty').value),certainty=document.getElementById('stockCertainty').value;if(!Number.isFinite(quantity)||quantity<=0)return alert('Cantitatea trebuie să fie pozitivă.');if(action==='move_out'&&!destinationId)return alert('Alege destinația mutării.');const ops=[{operation:'stock.change',data:{populationId,action,locationId,destinationId,quantity,certainty}}];if(action==='sell'){const amount=prompt('Preț total al vânzării în RON? (lasă gol dacă nu dorești să înregistrezi suma)','');if(amount!==null&&amount.trim()!==''){const n=Number(amount);if(!Number.isFinite(n)||n<0)return alert('Suma nu este validă.');ops.push({operation:'finance.record',data:{entityId:populationId,kind:'sale',amount:n,currency:'RON',description:`Vânzare ${quantity} unități`,quantity}})}}const balance=E.balances(db).filter(x=>x.populationId===populationId&&x.locationId===locationId&&x.disposition==='active').reduce((a,x)=>a+x.quantity,0);const preview=action==='add'?`Se adaugă ${quantity}.`:action==='move_out'?`Se mută ${quantity}; sold estimat la sursă după mutare: ${balance-quantity}.`:`Se scad ${quantity}; sold estimat după operație: ${balance-quantity}.`;if(!confirm(`${preview}\n\nConfirmi operația?`))return;if(await commit('stock.'+action,ops,{populationId,action,locationId,destinationId,quantity,certainty},{certainty})){closeModal();showPage('inventory')}}
function addFinance(){openModal(`<h2>Tranzacție financiară</h2><div class="form">${selectField('Tip','finKind',[['cost','Cost / achiziție'],['sale','Vânzare / venit'],['fee','Taxă'],['other','Altă tranzacție']])}${field('Sumă','finAmount','0.00','number')}${selectField('Monedă','finCurrency',[['RON','RON'],['EUR','EUR'],['USD','USD']])}${selectField('Entitate asociată (opțional)','finEntity',optionsEntities())}${field('Descriere','finDescription','Ex. Achiziție / taxă / vânzare')}${field('Cantitate asociată (opțional)','finQuantity','1','number')}<div class="note">Tranzacția se atașează evenimentului. Costul/venitul derivat nu se editează manual.</div><div class="form-actions"><button class="secondary" onclick="closeModal()">Anulează</button><button class="primary" onclick="saveFinance()">Înregistrează</button></div></div>`)}
async function saveFinance(){const amount=Number(document.getElementById('finAmount').value),kind=document.getElementById('finKind').value,currency=document.getElementById('finCurrency').value,entityId=document.getElementById('finEntity').value||null,description=document.getElementById('finDescription').value.trim(),quantity=Number(document.getElementById('finQuantity').value||1);if(!Number.isFinite(amount)||amount<0)return alert('Suma trebuie să fie pozitivă sau zero.');if(await commit('finance.transaction',[{operation:'finance.record',data:{amount,kind,currency,entityId,description,quantity}}],{amount,kind,currency,entityId,description,quantity})){closeModal();showPage('finance')}}
function addEventNote(){openModal(`<h2>Eveniment / observație</h2><div class="form">${field('Tip eveniment','noteType','Ex. observație, tratament, fertilizare')}${selectField('Element asociat (opțional)','noteEntity',optionsEntities())}<label>Detalii</label><textarea id="noteText" placeholder="Ce s-a întâmplat? Include detalii observate."></textarea>${selectField('Certitudine','noteCertainty',[['certain','Sigură'],['uncertain','Incertă']])}<div class="form-actions"><button class="secondary" onclick="closeModal()">Anulează</button><button class="primary" onclick="saveEventNote()">Salvează eveniment</button></div></div>`)}
async function saveEventNote(){const type=document.getElementById('noteType').value.trim()||'observation',entityId=document.getElementById('noteEntity').value||null,description=document.getElementById('noteText').value.trim(),certainty=document.getElementById('noteCertainty').value;if(!description)return alert('Adaugă detalii despre eveniment.');if(await commit('event.'+type,[{operation:'event.note',data:{entityId,description}}],{entityId,description,summary:description,certainty},{certainty})){closeModal();showPage('events')}}
async function closeRelation(rid){if(!confirm('Închizi această relație? Evenimentul original rămâne în istoric.'))return;await commit('relation.closed',[{operation:'relation.close',data:{relationId:rid}}],{relationId:rid});showPage('relations')}
function moveEntity(entityId){const locations=db.entities.filter(e=>e.type==='location');if(!locations.length)return alert('Creează mai întâi o locație.');openModal(`<h2>Mută entitatea</h2><div class="form">${selectField('Noua locație','moveTarget',locations.map(e=>[e.id,e.name]))}<div class="form-actions"><button class="secondary" onclick="closeModal()">Anulează</button><button class="primary" onclick="saveMove('${entityId}')">Mută</button></div></div>`)}
async function saveMove(entityId){const targetId=document.getElementById('moveTarget').value;if(!targetId)return alert('Alege locația.');if(await commit('entity.moved',[{operation:'relation.move',data:{sourceId:entityId,targetId}}],{entityId,targetId})){closeModal();showPage('relations')}}
function entityRelationLabel(r){return r.type==='custom'?(r.customTypeName||'Personalizat'):({'related_to':'asociat cu','located_in':'localizat în','parent_of':'părinte pentru','contains':'conține','owns':'deține'}[r.type]||r.type)}
function entityRelationsHtml(entityId){const rels=db.relations.filter(r=>!r.endedAt&&(r.sourceId===entityId||r.targetId===entityId));if(!rels.length)return '<div class="empty">Nicio relație activă pentru această entitate.</div>';return '<div class="list">'+rels.map(r=>{const source=db.entities.find(e=>e.id===r.sourceId),target=db.entities.find(e=>e.id===r.targetId);return `<div class="row"><div><b>${esc(source?.name||r.sourceId)} → ${esc(target?.name||r.targetId)}</b><div class="muted">${esc(entityRelationLabel(r))} · din ${esc(new Date(r.startedAt).toLocaleString('ro-RO'))}</div></div></div>`}).join('')+'</div>'}
function renderEntities(){const box=document.getElementById('entityList');if(currentEntityId&&db.entities.some(e=>e.id===currentEntityId)){const e=db.entities.find(x=>x.id===currentEntityId);box.innerHTML=`<div class="entity-detail"><div class="detail-head"><div><button class="secondary" onclick="currentEntityId=null;render()">← Înapoi</button><h2 id="entityDetailTitle" tabindex="-1">${esc(e.name)}</h2><div class="muted">${esc(e.type)} · ID intern ${esc(e.id)}</div><div class="muted">Locație curentă: ${esc(E.activeLocation(db,e.id)?.name||'nespecificată')}</div></div><div class="row-actions"><button class="secondary" onclick="renameEntity('${e.id}')">Redenumește</button><button class="secondary" onclick="attributeForm('${e.id}')">+ Atribut</button><button class="secondary" onclick="moveEntity('${e.id}')">Mută</button></div></div><h3>Relații active</h3>${entityRelationsHtml(e.id)}<h3>Atribute curente</h3>${Object.entries(e.attributes||{}).map(([name,value])=>`<div class="row"><div><b>${esc(name)}</b><div class="value">${esc(typeof value==='object'?JSON.stringify(value):value)}</div><div class="muted">${(e.attributeHistory?.[name]||[]).length} valori istorice</div></div><button class="secondary" onclick="editAttribute('${e.id}','${encodeURIComponent(name)}')">Înregistrează valoare</button></div>`).join('')||'<div class="empty">Nu există atribute.</div>'}<h3>Cronologie</h3><div class="list">${entityEvents(e.id).map(eventRow).join('')||'<div class="empty">Fără evenimente.</div>'}</div><h3>Evoluție numerică</h3>${entityChart(e)}</div>`;return}const search=(document.getElementById('entitySearch')?.value||'').trim().toLocaleLowerCase('ro-RO');const filtered=db.entities.filter(e=>!search||[e.name,e.type,E.activeLocation(db,e.id)?.name||'',Object.keys(e.attributes||{}).join(' ')].join(' ').toLocaleLowerCase('ro-RO').includes(search));const count=document.getElementById('entitySearchCount');if(count)count.textContent=search?filtered.length+' / '+db.entities.length+' rezultate':'';box.innerHTML=filtered.map(e=>`<div class="row"><div><b>${esc(e.name)}</b><div class="muted">${esc(e.type)} · ${Object.keys(e.attributes||{}).length} atribute · ${esc(E.activeLocation(db,e.id)?.name||'fără locație')}</div><div class="muted">${db.relations.filter(r=>!r.endedAt&&(r.sourceId===e.id||r.targetId===e.id)).length} relații active</div></div><div class="row-actions"><button class="secondary" onclick="openEntity('${e.id}')">Deschide</button><button class="secondary" onclick="moveEntity('${e.id}')">Mută</button></div></div>`).join('')||`<div class="empty">${search?'Nu există entități care corespund căutării.':'Nicio entitate încă.'}</div>`}
function renameEntity(entityId){const entity=db.entities.find(e=>e.id===entityId);if(!entity)return;openModal('<h2>Redenumește entitatea</h2><div class="form">'+field('Nume nou','renameEntityName','Numele entității')+'</div><div class="note">Redenumirea este înregistrată în jurnal; numele anterior rămâne în istoricul entității.</div><div class="form-actions"><button class="secondary" onclick="closeModal()">Anulează</button><button class="primary" onclick="saveEntityRename(\''+entityId+'\')">Salvează numele</button></div>');document.getElementById('renameEntityName').value=entity.name;document.getElementById('renameEntityName').select()}async function saveEntityRename(entityId){const name=document.getElementById('renameEntityName')?.value.trim();if(!name)return alert('Numele nu poate fi gol.');const entity=db.entities.find(e=>e.id===entityId);if(!entity)return alert('Entitatea nu mai există.');if(name===entity.name)return closeModal();if(await commit('entity.renamed',[{operation:'entity.rename',target:entityId,data:{name}}],{entityId,name,previousName:entity.name,summary:'Entitate redenumită'})){closeModal();render();document.getElementById('entityDetailTitle')?.focus()}}function openEntity(eid){currentEntityId=eid;showPage('entities');document.getElementById('entityDetailTitle')?.focus()}
function isEventVisible(ev){return ev.status==='committed'&&!ev.hiddenFromHistory&&!db.events.some(x=>x.payload?.correctsEventId===ev.id&&x.id!==ev.id)}
function visibleEvents(){return db.events.filter(isEventVisible)}
function entityEvents(eid){return visibleEvents().filter(ev=>(ev.payload?.entityId===eid||ev.payload?.sourceId===eid||ev.payload?.targetId===eid||ev.operations?.some(op=>op.target===eid||op.data?.entityId===eid||op.data?.sourceId===eid||op.data?.targetId===eid))).sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp))}
function entityChart(e){const defs=db.attributes.filter(a=>a.type==='number'&&(a.nature==='dynamic'||a.historyEnabled)&&Object.hasOwn(e.attributes||{},a.name));if(!defs.length)return '<div class="note">Definește un atribut numeric dinamic (de exemplu pH) pentru a activa graficul.</div>';const points=[];for(const d of defs){for(const h of e.attributeHistory?.[d.name]||[]){if(Number.isFinite(Number(h.value)))points.push({name:d.name,value:Number(h.value),at:h.at,certainty:h.certainty||'certain'})}}if(!points.length)return '<div class="empty">Nu există valori numerice istorice.</div>';const selected=defs[0].name,pts=points.filter(p=>p.name===selected).sort((a,b)=>new Date(a.at)-new Date(b.at));return `<label>Atribut pentru grafic <select id="entityChartSelect" onchange="drawEntityChart('${e.id}')">${defs.map(d=>`<option value="${esc(d.name)}">${esc(d.name)}</option>`).join('')}</select></label><div id="entityChartBox" class="chart-box"></div>`}
function drawEntityChart(entityId){const box=document.getElementById('entityChartBox'),sel=document.getElementById('entityChartSelect');if(!box||!sel)return;const e=db.entities.find(x=>x.id===entityId),name=sel.value,pts=(e.attributeHistory?.[name]||[]).filter(h=>Number.isFinite(Number(h.value))).sort((a,b)=>new Date(a.at)-new Date(b.at));if(!pts.length){box.innerHTML='<div class="empty">Fără valori numerice.</div>';return}const W=760,H=250,L=55,R=20,T=20,B=40,vals=pts.map(p=>Number(p.value)),min=Math.min(...vals),max=Math.max(...vals),rng=max-min||1,t0=Date.parse(pts[0].at),t1=Date.parse(pts[pts.length-1].at),x=p=>L+(t1===t0?(W-L-R)/2:(Date.parse(p.at)-t0)/(t1-t0)*(W-L-R)),y=v=>T+(max-v)/rng*(H-T-B);let grid='';for(let i=0;i<5;i++){const v=min+(max-min)*i/4,yy=y(v);grid+=`<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#e5e7eb"/><text x="${L-7}" y="${yy+4}" text-anchor="end" font-size="11" fill="#667085">${Number(v.toFixed(3))}</text>`}const path=pts.map((p,i)=>`${i?'L':'M'} ${x(p)} ${y(Number(p.value))}`).join(' '),dots=pts.map(p=>`<circle cx="${x(p)}" cy="${y(Number(p.value))}" r="5" fill="${p.certainty==='uncertain'?'white':'#20242b'}" stroke="#20242b" stroke-width="2"><title>${esc(new Date(p.at).toLocaleString('ro-RO'))}: ${esc(p.value)} (${esc(p.certainty||'certain')})</title></circle>`).join('');const evs=entityEvents(entityId).filter(ev=>!ev.type.startsWith('attribute.')&&Date.parse(ev.timestamp)>=t0&&Date.parse(ev.timestamp)<=t1);const markers=evs.map(ev=>{const xx=L+(t1===t0?(W-L-R)/2:(Date.parse(ev.timestamp)-t0)/(t1-t0)*(W-L-R));return `<line x1="${xx}" y1="${T}" x2="${xx}" y2="${H-B}" stroke="#8a9098" stroke-dasharray="4 4"><title>${esc(ev.type)} · ${esc(new Date(ev.timestamp).toLocaleString('ro-RO'))}</title></line>`}).join('');box.innerHTML=`<div class="chart-meta">${pts.length} valori pentru ${esc(name)}. Cercurile goale sunt valori incerte; liniile punctate sunt evenimente discrete, nu dovezi de cauzalitate.</div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafic ${esc(name)}">${grid}${markers}<path d="${path}" fill="none" stroke="#20242b" stroke-width="2.5"/>${dots}</svg>`}
function renderRelations(){const rels=db.relations.filter(r=>!r.endedAt);document.getElementById('relationList').innerHTML=rels.map(r=>{const source=db.entities.find(e=>e.id===r.sourceId),target=db.entities.find(e=>e.id===r.targetId);return `<div class="row"><div><b><button class="link-button" onclick="openEntity('${r.sourceId}')">${esc(source?.name||r.sourceId)}</button> → <button class="link-button" onclick="openEntity('${r.targetId}')">${esc(target?.name||r.targetId)}</button></b><div class="muted">${esc(r.type==='custom'?(r.customTypeName||'Personalizat'):({'related_to':'Asociat cu','located_in':'Localizat în','parent_of':'Părinte pentru','contains':'Conține','owns':'Deține'}[r.type]||r.type))} · din ${new Date(r.startedAt).toLocaleString('ro-RO')}</div></div><div class="row-actions"><button class="secondary" onclick="addRelationAttribute('${r.id}')">Atribut</button><button class="secondary" onclick="closeRelation('${r.id}')">Închide relația</button></div></div>`}).join('')||'<div class="empty">Nicio relație activă.</div>';const locs=db.entities.filter(e=>e.type==='location');document.getElementById('locationList').innerHTML=locs.map(l=>`<div class="row"><div><b><button class="link-button" onclick="openEntity('${l.id}')">${esc(l.name)}</button></b><div class="muted">${esc(E.locationPath(db,l.id).join(' → '))}</div></div><span class="badge">locație</span></div>`).join('')||'<div class="empty">Nu există locații. Creează una pentru a reprezenta localizarea ca relație.</div>'}function renderInventory(){const bals=E.balances(db);document.getElementById('stockList').innerHTML=bals.map(b=>{const pop=db.entities.find(e=>e.id===b.populationId),loc=db.entities.find(e=>e.id===b.locationId);return `<div class="row"><div><b><button class="link-button" onclick="openEntity('${b.populationId}')">${esc(pop?.name||b.populationId)}</button></b><div class="muted">Locație: ${loc?`<button class="link-button" onclick="openEntity('${b.locationId}')">${esc(loc.name)}</button>`:'nespecificată'} · dispoziție: ${esc(b.disposition)}</div></div><strong>${b.quantity}</strong></div>`}).join('')||'<div class="empty">Nu există mișcări de stoc.</div>'}function renderFinance(){const totals=E.totalFinance(db),box=document.getElementById('financeSummary');box.innerHTML=Object.entries(totals).map(([k,v])=>{const [currency,kind]=k.split('|');return `<div class="card"><span>${esc(kind)} · ${esc(currency)}</span><strong>${v.toLocaleString('ro-RO',{maximumFractionDigits:2})}</strong></div>`}).join('')||'<div class="empty">Nu există tranzacții financiare.</div>';document.getElementById('financeList').innerHTML=db.finance.slice().sort((a,b)=>new Date(b.at)-new Date(a.at)).map(f=>`<div class="row"><div><b>${esc(f.kind)} · ${f.amount.toLocaleString('ro-RO')} ${esc(f.currency)}</b><div class="muted">${esc(f.description)} · ${f.entityId?`<button class="link-button" onclick="openEntity('${f.entityId}')">${esc(db.entities.find(e=>e.id===f.entityId)?.name||'fără entitate')}</button>`:esc('fără entitate')} · ${new Date(f.at).toLocaleString('ro-RO')}</div></div><span class="badge">eveniment ${esc(f.eventId.slice(0,8))}</span></div>`).join('')||''}
function renderAttributes(){document.getElementById('attributeList').innerHTML=db.attributes.map(a=>`<div class="row"><div><b>${esc(a.name)}</b><div class="muted">${esc(a.type)} · rol ${esc(a.role)} · natură ${esc(a.nature)} · proprietar ${esc(a.ownerType||'entity')} · ${a.identifying?'identificator':'neidentificator'} · ${a.historyEnabled?'istoric activ':'istoric oprit'}${a.required?' · obligatoriu':''}</div><div class="muted">Limite recomandate: ${a.validation?`min ${a.validation.min??'—'}, max ${a.validation.max??'—'}`:'nespecificate'}</div></div><span class="badge">configurabil</span></div>`).join('')||'<div class="empty">Nicio definiție de atribut.</div>'}
function eventRow(ev){const p=ev.payload||{},ops=ev.operations||[];let detail=p.summary||p.description||p.attribute&&`${p.attribute}: ${p.previous??'—'} → ${p.value??'—'}`||p.name||p.note||'';if(!detail)detail=ops.map(o=>o.operation).join(', ');const corrected=db.events.some(x=>x.payload?.correctsEventId===ev.id);const attrName=p.attribute||ops.find(o=>o.operation==='attribute.set'||o.operation==='set_attribute')?.data?.name;const target=p.entityId||ops.find(o=>o.operation==='attribute.set'||o.operation==='set_attribute')?.target;const correctionButton=(ev.type==='event.correction'&&p.correctsEventId)?`<button class="secondary" onclick="correctAnyEvent('${p.correctsEventId}')">Modifică din nou</button>`:(ev.type==='event.correction'||ev.type==='attribute.value_corrected')?'<span class="muted">Corecție aplicată</span>':(corrected?'<span class="muted">Corectat</span>':(attrName&&target?`<button class="secondary" onclick="correctAttributeEvent('${ev.id}')">Corectează</button>`:`<button class="secondary" onclick="correctAnyEvent('${ev.id}')">Corectează</button>`));const eventAttrButton=db.attributes.some(a=>a.ownerType==='event')?`<button class="secondary" onclick="addEventAttribute('${ev.id}')">Atribut</button>`:'';return `<div class="row"><div><b>${esc(ev.type)}${corrected?' · corectat ulterior':''}</b><div>${esc(detail)}</div><div class="muted">${new Date(ev.timestamp).toLocaleString('ro-RO')} · ${esc(ev.source||'local')} · ${esc(ev.actor||'utilizator')} · ${esc(ev.id.slice(0,8))}</div></div><div class="row-actions"><span class="badge">${esc(ev.certainty||'certain')}</span>${eventAttrButton}${correctionButton}</div></div>`}
async function correctAttributeEvent(eventId){const original=db.events.find(ev=>ev.id===eventId);if(!original)return;const p=original.payload||{},op=(original.operations||[]).find(o=>o.operation==='attribute.set'||o.operation==='set_attribute'),d=op?.data||{},name=p.attribute||d.name||d.attribute,target=p.entityId||op?.target;if(!name||!target)return alert('Nu pot identifica atributul din evenimentul original.');const entity=db.entities.find(e=>e.id===target),def=db.attributes.find(a=>a.name.toLowerCase()===String(name).toLowerCase())||{type:'text'};const old=p.value??d.value??entity?.attributes?.[name]??'';const raw=prompt(`Valoarea corectă pentru „${name}”:`,String(old));if(raw===null)return;let value;try{value=parseTyped(raw,def.type);if(!confirmAttributeWarnings(def,value))return}catch(err){return alert(err.message)}const note=prompt('Motivul corecției (opțional):','Corecție de valoare');if(note===null)return;if(await commit('attribute.value_corrected',[{operation:'attribute.correct',target,data:{name,value,certainty:'certain',correctsEventId:eventId}},{operation:'event.invalidate',data:{correctsEventId:eventId}}],{entityId:target,attribute:name,previous:old,value,correctsEventId:eventId,correctionNote:note,summary:`Corecție ${name}: ${String(old)} → ${String(value)}`})){render()}}
function addRelationAttribute(relationId){const rel=db.relations.find(r=>r.id===relationId&&!r.endedAt);if(!rel)return alert('Relația nu mai este activă.');const defs=db.attributes.filter(a=>a.ownerType==='relation');if(!defs.length)return alert('Definește mai întâi un atribut cu proprietar „Relație”.');openModal(`<h2>Atribut pe relație</h2><div class="form">${selectField('Atribut','relAttrName',defs.map(d=>[d.name,`${d.name} (${d.type})`]))}${field('Valoare','relAttrValue','Valoare')}${selectField('Certitudine','relAttrCert',[['certain','Sigură'],['uncertain','Incertă']])}<div class="form-actions"><button class="secondary" onclick="closeModal()">Anulează</button><button class="primary" onclick="saveRelationAttribute('${relationId}')">Salvează</button></div></div>`)}
async function saveRelationAttribute(relationId){const name=document.getElementById('relAttrName').value,def=db.attributes.find(a=>a.name===name);let value;try{value=parseTyped(document.getElementById('relAttrValue').value,def.type);if(!confirmAttributeWarnings(def,value))return}catch(err){return alert(err.message)}if(await commit('relation.attribute_changed',[{operation:'relation.attribute.set',data:{relationId,name,value,certainty:document.getElementById('relAttrCert').value}}],{relationId,attribute:name,value})){closeModal();showPage('relations')}}
function addEventAttribute(eventId){const defs=db.attributes.filter(a=>a.ownerType==='event');if(!defs.length)return alert('Definește mai întâi un atribut cu proprietar „Eveniment”.');openModal(`<h2>Atribut pe eveniment</h2><div class="form">${selectField('Atribut','eventAttrName',defs.map(d=>[d.name,`${d.name} (${d.type})`]))}${field('Valoare','eventAttrValue','Valoare')}${selectField('Certitudine','eventAttrCert',[['certain','Sigură'],['uncertain','Incertă']])}<div class="form-actions"><button class="secondary" onclick="closeModal()">Anulează</button><button class="primary" onclick="saveEventAttribute('${eventId}')">Salvează</button></div></div>`)}
async function saveEventAttribute(eventId){const name=document.getElementById('eventAttrName').value,def=db.attributes.find(a=>a.name===name);let value;try{value=parseTyped(document.getElementById('eventAttrValue').value,def.type);if(!confirmAttributeWarnings(def,value))return}catch(err){return alert(err.message)}if(await commit('event.attribute_changed',[{operation:'event.attribute.set',data:{eventId,name,value,certainty:document.getElementById('eventAttrCert').value}}],{targetEventId:eventId,attribute:name,value})){closeModal();showPage('events')}}
async function correctAnyEvent(eventId){
 const original=db.events.find(e=>e.id===eventId);if(!original)return;
 const ops=[],changes=[];let correctedQuantity=null,stockOp=null,effectiveQty=null;
 const originalOps=original.operations||[];
 const stockOps=originalOps.filter(o=>o.operation==='stock.change');
 const simpleInitial=stockOps.length===1&&(stockOps[0].data?.action||'add')==='add';
 if(simpleInitial){
  stockOp=stockOps[0];const d=stockOp.data||{},oldQty=Number(d.quantity||0),populationId=d.populationId||d.entityId;
  const priorCorrection=db.events.filter(e=>e.type==='event.correction'&&e.payload?.correctsEventId===eventId&&Number.isFinite(Number(e.payload?.correctedQuantity))).sort((a,b)=>new Date(a.timestamp)-new Date(b.timestamp)).at(-1);
  const effectiveQty=priorCorrection?Number(priorCorrection.payload.correctedQuantity):oldQty;
  const popName=db.entities.find(e=>e.id===populationId)?.name||'necunoscută';
  const raw=prompt(`Corectarea cantității inițiale pentru „${popName}”.\nCantitatea corectă în prezent: ${effectiveQty}.\nIntrodu cantitatea CORECTĂ (0 dacă înregistrarea a fost greșită).`,String(effectiveQty));
  if(raw===null)return;correctedQuantity=Number(raw);
  if(!raw.trim()||!Number.isFinite(correctedQuantity)||correctedQuantity<0)return alert('Introdu o cantitate validă, egală cu zero sau mai mare.');
 }
 const note=prompt('Motivul corecției:','Corectare înregistrare');if(note===null||!note.trim())return;
 for(const op of originalOps){const d=op.data||{};
  if(op.operation==='stock.change'){
   const loc=d.locationId||null,qty=Number(d.quantity||0),pid=d.populationId||d.entityId,action=d.action||'add';
   if(action==='add'){
    if(simpleInitial){const delta=E.correctionDelta(qty,effectiveQty,correctedQuantity);if(Math.abs(delta)>1e-9)changes.push({populationId:pid,locationId:loc,disposition:d.disposition||'active',quantity:delta});}
    else changes.push({populationId:pid,locationId:loc,disposition:d.disposition||'active',quantity:-qty});
   }else if(action==='move_out'){changes.push({populationId:pid,locationId:loc,disposition:'active',quantity:qty});changes.push({populationId:pid,locationId:d.destinationId||null,disposition:'active',quantity:-qty});}
   else if(action==='sell'||action==='dispose'){changes.push({populationId:pid,locationId:loc,disposition:'active',quantity:qty});changes.push({populationId:pid,locationId:loc,disposition:action==='sell'?'sold':(d.disposition==='active'?'disposed':d.disposition),quantity:-qty});}
   else return alert(`Corectarea automată nu este definită pentru operația de stoc „${action}”. Nu am modificat nimic.`);
  }else if(op.operation==='finance.record'){
   if(Number(d.amount)!==0)ops.push({operation:'finance.adjust',data:{entityId:d.entityId,kind:d.kind,amount:-Number(d.amount),currency:d.currency,description:'Corecție: '+(d.description||''),quantity:d.quantity,correctsEventId:eventId}});
  }else if(op.operation==='relation.create'){
   ops.push({operation:'relation.create.correct',data:{correctsEventId:eventId}});
  }else if(op.operation==='relation.move'){
   ops.push({operation:'relation.move.correct',data:{correctsEventId:eventId}});
  }else if(op.operation==='relation.close'){
   ops.push({operation:'relation.close.correct',data:{relationId:d.relationId,correctsEventId:eventId}});
  }else if(op.operation==='relation.attribute.set'){
   ops.push({operation:'relation.attribute.correct',data:{relationId:d.relationId,name:d.name,correctsEventId:eventId}});
  }else if(op.operation==='attribute.set'||op.operation==='set_attribute'){
   const attributeName=String(d.name||d.attribute||'').trim(),attributeTarget=op.target||op.entityId||d.entityId;
   if(!attributeName||!attributeTarget)return alert('Corectarea atributului nu poate identifica entitatea și atributul. Nu am modificat nimic.');
   const sameAttributeWrites=originalOps.filter(other=>['attribute.set','set_attribute'].includes(other.operation)&&(other.target||other.entityId||other.data?.entityId)===attributeTarget&&String(other.data?.name||other.data?.attribute||'').trim().toLowerCase()===attributeName.toLowerCase());
   if(sameAttributeWrites.length>1)return alert(`Evenimentul modifică de mai multe ori atributul „${attributeName}” pentru aceeași entitate. Corectarea automată este ambiguă; nu am modificat nimic.`);
   const def=db.attributes.find(a=>a.name.toLowerCase()===attributeName.toLowerCase())||{type:'text'};
   const rawValue=prompt(`Valoarea corectă pentru atributul „${attributeName}”:`,String(d.value??''));
   if(rawValue===null)return;
   let correctedValue;try{correctedValue=parseTyped(rawValue,def.type);if(!confirmAttributeWarnings(def,correctedValue))return}catch(err){return alert(err.message)}
   ops.push({operation:'attribute.correct',target:attributeTarget,data:{name:attributeName,value:correctedValue,certainty:'certain',correctsEventId:eventId}});
  }else if(op.operation==='entity.rename'){
   ops.push({operation:'entity.rename.correct',target:op.target||d.entityId, data:{correctsEventId:eventId}});
  }else if(op.operation==='event.attribute.set'){
   ops.push({operation:'event.attribute.correct',data:{eventId:d.eventId,correctsEventId:eventId}});
  }else if(op.operation==='event.note'){
   // Notes are append-only observations; they have no derived business effect to reverse.
  }else{
   return alert(`Nu există încă o regulă sigură de corectare pentru „${op.operation}”. Nu am aplicat nicio modificare.`);
  }
 }
 if(changes.length)ops.unshift({operation:'stock.adjust',data:{changes,correctsEventId:eventId}});
 if(!ops.length)return alert('Evenimentul nu are efecte care pot fi corectate automat.');
 ops.push({operation:'event.invalidate',data:{correctsEventId:eventId}});ops.push({operation:'event.note',data:{description:'Corecție pentru '+eventId+': '+note}});
 const payload={correctsEventId:eventId,correctionNote:note,summary:simpleInitial?`Corecție cantitate: ${Number(stockOp.data.quantity)} → ${correctedQuantity}`:'Corecție pentru eveniment '+eventId.slice(0,8)};
 if(simpleInitial)payload.correctedQuantity=correctedQuantity;
 if(await commit('event.correction',ops,payload))render();
}
function renderHistory(){const entityFilter=document.getElementById('historyEntityFilter'),typeFilter=document.getElementById('historyTypeFilter'),prev=entityFilter.value,prevType=typeFilter.value;entityFilter.innerHTML='<option value="">Toate elementele</option>'+db.entities.map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join('');entityFilter.value=prev;typeFilter.innerHTML='<option value="">Toate tipurile</option>'+[...new Set(visibleEvents().map(e=>e.type))].sort().map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('');typeFilter.value=prevType;const eid=entityFilter.value,typ=typeFilter.value;const events=visibleEvents().filter(ev=>(!typ||ev.type===typ)&&(!eid||ev.payload?.entityId===eid||ev.payload?.sourceId===eid||ev.payload?.targetId===eid||ev.operations?.some(o=>o.target===eid||o.data?.entityId===eid||o.data?.sourceId===eid||o.data?.targetId===eid))).sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp));document.getElementById('historyList').innerHTML=events.map(eventRow).join('')||'<div class="empty">Niciun eveniment pentru filtrele selectate.</div>'}
function renderAudit(){const warnings=db.meta?.replayWarnings||[];const integrityNotice=integrityBlocked?'<p class="status-warn"><b>MOD NUMAI CITIRE</b> · '+esc(integrityBlockReason)+'. Exportul original rămâne disponibil; poți reconstrui doar dacă jurnalul este valid sau poți importa un backup verificat.</p>':'';document.getElementById('auditSummary').innerHTML=`Jurnal: <b>${db.events.length}</b> evenimente · Entități: <b>${db.entities.length}</b> · Relații: <b>${db.relations.length}</b> · Erori la replay: <b>${warnings.length}</b> · Context conversațional: <b>${E.contextIsActive(db)?'activ':'expirat'}</b>.${integrityNotice}`;document.getElementById('auditList').innerHTML=[...warnings.map(w=>`<div class="row"><div><b class="status-warn">Eroare replay</b><div>${esc(w.eventId)} · ${esc(w.error)}</div></div></div>`),...visibleEvents().slice(-10).reverse().map(eventRow)].join('')||'<div class="empty">Nu există evenimente.</div>'}
function render(){document.getElementById('entityCount').textContent=db.entities.length;document.getElementById('eventCount').textContent=db.events.length;document.getElementById('relationCount').textContent=db.relations.filter(r=>!r.endedAt).length;document.getElementById('stockCount').textContent=E.balances(db).filter(x=>x.disposition==='active').reduce((sum,x)=>sum+Number(x.quantity||0),0);renderEntities();renderRelations();renderInventory();renderFinance();renderAttributes();document.getElementById('eventList').innerHTML=visibleEvents().slice().sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp)).map(eventRow).join('')||'<div class="empty">Niciun eveniment.</div>';document.getElementById('recentEvents').innerHTML=visibleEvents().slice().sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp)).slice(0,5).map(eventRow).join('')||'<div class="empty">Niciun eveniment.</div>';renderHistory();renderAudit();applyPageFilters();if(currentEntityId&&document.getElementById('entityChartBox'))drawEntityChart(currentEntityId)}
document.getElementById('quickEvent').onclick=()=>showPage('assistant');document.getElementById('historyEntityFilter').onchange=renderHistory;document.getElementById('historyTypeFilter').onchange=renderHistory;

function applyPageFilters(){document.querySelectorAll('[data-filter-target]').forEach(input=>{const target=document.getElementById(input.dataset.filterTarget);if(!target)return;const q=(input.value||'').trim().toLocaleLowerCase('ro-RO');const rows=[...target.children].filter(el=>el.classList.contains('row'));let shown=0;rows.forEach(row=>{const match=!q||row.textContent.toLocaleLowerCase('ro-RO').includes(q);row.hidden=!match;if(match)shown++});target.querySelectorAll('.empty').forEach(el=>el.hidden=Boolean(q&&rows.length));let noMatch=target.querySelector('[data-filter-empty]');if(q&&rows.length&&!shown){if(!noMatch){noMatch=document.createElement('div');noMatch.className='empty filter-empty';noMatch.dataset.filterEmpty='true';noMatch.setAttribute('role','status');target.appendChild(noMatch)}noMatch.textContent='Nu exista rezultate pentru: '+input.value.trim()}else if(noMatch)noMatch.remove()})}
document.addEventListener('input',ev=>{if(ev.target.matches('[data-filter-target]'))applyPageFilters()});
function exportData(){const blob=new Blob([JSON.stringify({exportedAt:E.now(),app:'Collector MVP v6',db:integrityRawBackup||db},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='collector-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();URL.revokeObjectURL(a.href)}
document.getElementById('importFile').addEventListener('change',async ev=>{const file=ev.target.files?.[0];if(!file)return;try{const raw=JSON.parse(await file.text()),candidate=raw.db||raw;const validated=E.validateImport(candidate);if(!confirm('Jurnal valid, fără erori, iar proiecțiile corespund istoricului. Importul va înlocui datele locale curente. Ai exportat o copie de siguranță?'))return;if(!persistRaw(validated))throw Error('Nu s-au putut salva datele importate. Datele locale au rămas neschimbate.');db=validated;integrityBlocked=false;integrityCanRebuild=false;integrityBlockReason=null;integrityRawBackup=null;currentEntityId=null;render();alert('Import reușit: jurnalul și proiecțiile au fost validate.')}catch(err){alert('Import eșuat: '+err.message)}finally{ev.target.value=''}});
function verifyReplay(){const rebuilt=E.replay(db.events,[]);const report={events:db.events.length,entitiesCurrent:db.entities.length,entitiesReplay:rebuilt.entities.length,relationsCurrent:db.relations.length,relationsReplay:rebuilt.relations.length,stockCurrent:db.stock.length,stockReplay:rebuilt.stock.length,financialCurrent:db.finance.length,financialReplay:rebuilt.finance.length,warnings:rebuilt.meta.replayWarnings||[]};openModal(`<h2>Verificare replay</h2><pre>${esc(JSON.stringify(report,null,2))}</pre><p>Replay-ul reconstruiește proiecțiile pornind din jurnalul de evenimente.</p><div class="form-actions"><button class="secondary" onclick="closeModal()">Închide</button><button class="primary" onclick="rebuildFromJournal()">Reconstruiește proiecțiile</button></div>`)}
async function rebuildFromJournal(){if(integrityBlocked&&!integrityCanRebuild){alert('Reconstruirea a fost blocată: datele originale nu pot fi înlocuite în siguranță prin replay. Exportă copia păstrată sau importă un backup valid.');return false}const rebuilt=E.replay(db.events,[]);const warnings=rebuilt.meta.replayWarnings||[];if(warnings.length){alert('Reconstruirea a fost blocată: jurnalul conține '+warnings.length+' evenimente invalide. Datele existente au fost păstrate. Exportă datele și repară jurnalul sau importă un backup valid.');return false}rebuilt.meta={...db.meta,...rebuilt.meta};delete rebuilt.meta.integrityError;if(!await persistRaw(rebuilt)){alert('Reconstruirea nu a fost salvată. Starea activă și datele existente au rămas neschimbate.');return false}db=rebuilt;integrityBlocked=false;integrityCanRebuild=false;integrityBlockReason=null;integrityRawBackup=null;currentEntityId=null;closeModal();render();alert('Proiecțiile au fost reconstruite și salvate cu succes din jurnal.');return true}
function parseCommand(text){
 const s=String(text??'').normalize('NFC').trim();
 if(!s)return {error:'Scrie o comandă.'};
 let m;
 // Acceptă atât forma scurtă, cât și formularea completă afișată în exemplele UI.
 if((m=s.match(/^(?:observație|observatie|notează|noteaza|înregistrează observație|inregistreaza observatie)\s*:?\s*(.+)$/iu)))return {type:'note',description:m[1].trim()};
 if((m=s.match(/^(?:setează|seteaza|înregistrează|inregistreaza)\s+(?:atributul\s+)?(.+?)\s+pentru\s+(.+?)\s*(?:=|este|la)\s*(.+)$/iu))){return {type:'attribute',attribute:m[1].trim(),entityName:m[2].trim(),value:m[3].trim()}}
 if((m=s.match(/^(?:înregistrează observație|inregistreaza observatie):?\s*(.+?)\s+are\s+(.+?)\s+([0-9]+(?:[.,][0-9]+)?)$/iu)))return {type:'attribute',entityName:m[1].trim(),attribute:m[2].trim(),value:m[3].replace(',','.')};
 if((m=s.match(/^(?:am vândut|am vandut|vinde)\s+(\d+)\s+(.+?)(?:\s+din\s+(.+))?$/iu)))return {type:'sale',quantity:Number(m[1]),populationName:m[2].trim(),locationName:m[3]?.trim()||null};
 return {error:'Nu pot interpreta această comandă fără să ghicesc. Folosește „Observație: ...” sau „Înregistrează [atribut] pentru [entitate] = [valoare]”.'};
}
async function runCommand(){
 const text=document.getElementById('commandInput').value,parsed=parseCommand(text),box=document.getElementById('commandResult');
 if(parsed.error){box.textContent=parsed.error;return}
 let operations=[],payload={},summary='';
 if(parsed.type==='note'){
  operations=[{operation:'event.note',data:{description:parsed.description}}];payload={description:parsed.description,summary:parsed.description};summary=`Observație: „${parsed.description}”`;
 } else if(parsed.type==='attribute'){
  const matches=db.entities.filter(x=>x.name.toLowerCase()===parsed.entityName.toLowerCase());
  if(matches.length!==1){box.textContent=matches.length?'Există mai multe entități cu acest nume; selectează explicit entitatea.':`Nu găsesc entitatea „${parsed.entityName}”.`;return}
  const def=db.attributes.find(a=>a.name.toLowerCase()===parsed.attribute.toLowerCase());
  if(!def){box.textContent=`Atributul „${parsed.attribute}” nu este definit. Nu voi modifica schema în tăcere.`;return}
  let value;try{value=parseTyped(parsed.value,def.type);if(!confirmAttributeWarnings(def,value))return}catch(err){box.textContent=err.message;return}
  operations=[{operation:'attribute.set',target:matches[0].id,data:{name:def.name,value,certainty:'certain',forceHistory:true}}];payload={entityId:matches[0].id,attribute:def.name,value};summary=`${matches[0].name} · ${def.name} = ${JSON.stringify(value)}`;
 } else if(parsed.type==='sale'){
  const populations=db.entities.filter(x=>x.name.toLowerCase()===parsed.populationName.toLowerCase()&&(x.type==='population'||x.type==='group'));
  if(populations.length!==1){box.textContent=populations.length?'Există mai multe populații cu acest nume. Selectează una explicit.':'Nu am găsit o singură populație cu acel nume.';return}
  const locations=parsed.locationName?db.entities.filter(x=>x.type==='location'&&x.name.toLowerCase()===parsed.locationName.toLowerCase()):[];
  if(parsed.locationName&&locations.length!==1){box.textContent='Nu am găsit o singură locație cu acel nume.';return}
  const locationId=locations[0]?.id||null;
  operations=[{operation:'stock.change',data:{populationId:populations[0].id,action:'sell',locationId,quantity:parsed.quantity,disposition:'sold'}}];payload={populationId:populations[0].id,quantity:parsed.quantity,locationId};summary=`Vânzare ${parsed.quantity} × ${populations[0].name}${locations[0]?' din '+locations[0].name:''}`;
 }
 const command={contractVersion:'collector.command.v1',turnId:E.uid(),intent:parsed.type,idempotencyKey:commandIntentKey(),source:'text',certainty:'certain',payload,operations};
 try{
  const result=await ensureAICorePort().preview(command);
  if(result.status!=='preview_ok'){box.textContent=result.status==='duplicate'?'Această comandă a fost deja procesată.':'Preview respins: '+result.status;return}
  pendingCoreCommand=command;
  box.innerHTML=`<b>Preview Core Port</b><p>${esc(summary)}</p><p>Modificări estimate — entități: ${result.projectionChanges.entities}, relații: ${result.projectionChanges.relations}, stoc: ${result.projectionChanges.stock}, financiar: ${result.projectionChanges.finance}.</p><p class="note">Nicio modificare nu a fost salvată încă. Confirmarea de mai jos execută atomic comanda și salvează în localStorage.</p><button class="primary" id="confirmCoreCommand">Confirmă și salvează</button> <button class="secondary" id="cancelCoreCommand">Anulează</button>`;
  document.getElementById('confirmCoreCommand').onclick=confirmCoreCommand;
  document.getElementById('cancelCoreCommand').onclick=()=>{pendingCoreCommand=null;box.textContent='Comandă anulată. Nu s-au modificat date.'};
 }catch(err){box.textContent='Preview eșuat: '+err.message}
}
async function confirmCoreCommand(){
 const box=document.getElementById('commandResult');if(!pendingCoreCommand)return;
 const command=pendingCoreCommand;pendingCoreCommand=null;
 try{
  const result=await serializeMutation(()=>ensureAICorePort().execute(command,{confirmed:true}));
  if(result.status==='committed'||result.status==='duplicate'){
   box.innerHTML=`<b class="status-ok">${result.status==='committed'?'Salvat cu succes':'Comandă deja procesată'}</b><p>Event ID: ${esc(result.eventId||'—')}</p>`;
  } else box.textContent=`Execuție nefinalizată (${result.status}): ${(result.errors||[]).join(' ')}`;
 }catch(err){box.textContent='Execuția a eșuat: '+err.message}
}
async function runAICommand(){
 const box=document.getElementById('commandResult'),text=document.getElementById('commandInput').value.trim();
 if(!text){box.textContent='Scrie sau dictează mai întâi ce dorești să înregistrezi.';return}
 const button=document.getElementById('parseWithAI');
 if(button){button.disabled=true;button.textContent='AI procesează…'}
 box.textContent='Trimit textul către OpenAI pentru interpretare. Nicio modificare nu este salvată în această etapă.';
 try{
  if(!window.CollectorOpenAIProvider)throw Error('Modulul OpenAI nu este încărcat. Pornește Collector prin serverul local.');
  const context={
   entities:db.entities.slice(0,150).map(e=>({id:e.id,name:e.name,type:e.type})),
   attributes:db.attributes.slice(0,100).map(a=>({id:a.id,name:a.name,type:a.type,required:Boolean(a.required),identifying:Boolean(a.identifying),temporal:Boolean(a.temporal),min:a.min??null,max:a.max??null}))
  };
  const response=await CollectorOpenAIProvider.interpret(text,context);
  void refreshAIProviderStatus();
  const ai=response.interpretation||{};
  if(ai.intent==='answer'){box.textContent=ai.answer||'Nu am un răspuns disponibil.';return}
  if(ai.intent==='clarify'||(ai.intent==='propose'&&Array.isArray(ai.ambiguities)&&ai.ambiguities.length)){box.textContent=ai.question||ai.clarificationQuestion||'Am nevoie de o clarificare.';return}
  if(ai.intent==='refuse'){box.textContent=ai.answer||'Nu pot procesa această solicitare.';return}
  if(ai.intent!=='propose'||!ai.command||!Array.isArray(ai.command.operations)||!ai.command.operations.length)throw Error('OpenAI nu a returnat o comandă validă pentru Collector.');
  const command={
   ...ai.command,
   turnId:E.uid(),
   idempotencyKey:commandIntentKey(),
   source:'ai-openai'
  };
  const preview=await ensureAICorePort().preview(command);
  if(preview.status!=='preview_ok'){
   box.textContent=preview.status==='duplicate'?'Această intenție a fost deja înregistrată.':'Core a respins preview-ul: '+preview.status;
   return;
  }
  pendingCoreCommand=command;
  const opSummary=command.operations.map(op=>op.operation).join(', ');
  box.innerHTML='<b>Propunere AI · '+esc(response.model||'OpenAI')+'</b><p>'+esc(ai.answer||'Am interpretat cererea și am pregătit operația: '+opSummary+'.')+'</p><p>Încredere interpretare: '+Math.round(ai.confidence*100)+'%.</p><p>Impact estimat — entități: '+preview.projectionChanges.entities+', relații: '+preview.projectionChanges.relations+', stoc: '+preview.projectionChanges.stock+', financiar: '+preview.projectionChanges.finance+'.</p><p class="note">OpenAI doar propune. Core a validat preview-ul. Datele nu au fost modificate. Verifică propunerea și confirmă explicit pentru salvare.</p><button class="primary" id="confirmCoreCommand">Confirmă și salvează</button> <button class="secondary" id="cancelCoreCommand">Anulează</button>';
  document.getElementById('confirmCoreCommand').onclick=confirmCoreCommand;
  document.getElementById('cancelCoreCommand').onclick=()=>{pendingCoreCommand=null;box.textContent='Propunere anulată. Nu s-au modificat date.'};
 }catch(error){box.textContent='Interpretarea AI nu a putut fi finalizată: '+error.message}
 finally{if(button){button.disabled=false;button.textContent='Interpretează cu AI'}}
}
async function refreshSubscriptionStatus(){
 const status=document.getElementById('subscriptionStatus'),list=document.getElementById('subscriptionPackages');
 const restoreButton=document.getElementById('restorePurchases'),refreshButton=document.getElementById('refreshSubscription');
 if(!status||!list)return;
 list.replaceChildren();
 if(!window.CollectorSubscriptions){status.textContent='Modulul de abonamente nu este încărcat.';return}
 try{
  const user=await window.CollectorAuth?.getUser?.();
  if(!user?.id){status.textContent='Activează contul cloud pentru a verifica abonamentul.';return}
  if(user.is_anonymous||!user.email_confirmed_at){
   status.textContent=user.is_anonymous?'Înainte de achiziție, asociază contul curent cu email și parolă în secțiunea Recuperare cont cloud. Astfel poți recupera abonamentul pe alt telefon.':
    'Confirmă adresa de email din mesajul trimis de Supabase înainte de a cumpăra Collector Pro.';
   if(restoreButton)restoreButton.disabled=true;if(refreshButton)refreshButton.disabled=true;return;
  }
  const state=await window.CollectorSubscriptions.initialize(user.id);
  if(!state.available){
   status.textContent=state.reason==='native_only'?'Achizițiile sunt disponibile în aplicația Android/iOS.': 'Sistemul de achiziții nu este încă configurat pentru această versiune.';
   if(restoreButton)restoreButton.disabled=true;if(refreshButton)refreshButton.disabled=true;return;
  }
  if(restoreButton)restoreButton.disabled=false;if(refreshButton)refreshButton.disabled=false;
  if(state.isPro){
   status.textContent='Collector Pro activ'+(state.expiresAt?' · expiră '+new Date(state.expiresAt).toLocaleDateString('ro-RO'):'')+'.';
   if(state.managementUrl){const manage=document.createElement('a');manage.href=state.managementUrl;manage.target='_blank';manage.rel='noopener noreferrer';manage.textContent='Gestionează abonamentul în magazin';list.append(manage)}
  }
  else{
   status.textContent='Plan Free · datele și funcțiile locale rămân disponibile. Alege Collector Pro pentru AI și servicii cloud.';
   const packages=await window.CollectorSubscriptions.offerings();
   if(!packages.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='Nu există oferte active în RevenueCat. Configurează offering-ul curent și produsele din dashboard.';list.append(empty)}
   for(const item of packages){
    const button=document.createElement('button');button.type='button';button.className='secondary';
    button.textContent=(item.title||'Collector Pro')+(item.priceString?' · '+item.priceString:'');
    button.addEventListener('click',()=>purchaseCollectorPackage(item.identifier,button));list.append(button);
   }
  }
 }catch(error){status.textContent='Nu am putut verifica abonamentul: '+error.message;if(restoreButton)restoreButton.disabled=true}
}
async function purchaseCollectorPackage(identifier,button){
 const status=document.getElementById('subscriptionStatus');
 if(button)button.disabled=true;if(status)status.textContent='Se procesează achiziția prin magazin…';
 try{
  const result=await window.CollectorSubscriptions.purchase(identifier);
  if(status)status.textContent=result.isPro?'Collector Pro a fost activat.':'Achiziția a fost procesată; verific drepturile pe server.';
  await refreshSubscriptionStatus();await refreshAIProviderStatus();
 }catch(error){if(status)status.textContent='Achiziția nu a fost finalizată: '+error.message}
 finally{if(button)button.disabled=false}
}
async function restoreCollectorPurchases(){
 const status=document.getElementById('subscriptionStatus'),button=document.getElementById('restorePurchases');
 if(button)button.disabled=true;if(status)status.textContent='Se restaurează achizițiile din magazin…';
 try{
  const result=await window.CollectorSubscriptions.restore();
  if(status)status.textContent=result.isPro?'Abonamentul Collector Pro a fost restaurat.':'Nu am găsit un abonament Pro activ pentru contul magazinului.';
  await refreshSubscriptionStatus();await refreshAIProviderStatus();
 }catch(error){if(status)status.textContent='Restaurarea nu a reușit: '+error.message}
 finally{if(button)button.disabled=false}
}
document.getElementById('restorePurchases')?.addEventListener('click',restoreCollectorPurchases);
document.getElementById('refreshSubscription')?.addEventListener('click',refreshSubscriptionStatus);
document.getElementById('cloudAccountLinkForm')?.addEventListener('submit',async event=>{
 event.preventDefault();const status=document.getElementById('cloudIdentityStatus');
 const email=document.getElementById('cloudAccountEmail').value,password=document.getElementById('cloudAccountPassword').value;
 status.textContent='Asociez emailul contului cloud curent…';
 try{const account=await window.CollectorAuth.linkEmailPassword(email,password);document.getElementById('cloudAccountPassword').value='';
  status.textContent='Contul curent este asociat cu '+account.email+'. Verifică emailul dacă Supabase solicită confirmare.';
  await refreshSubscriptionStatus();await refreshAIProviderStatus();
 }catch(error){status.textContent='Nu am putut asocia contul: '+error.message}
});
document.getElementById('cloudAccountLoginForm')?.addEventListener('submit',async event=>{
 event.preventDefault();const status=document.getElementById('cloudIdentityStatus');
 const email=document.getElementById('cloudLoginEmail').value,password=document.getElementById('cloudLoginPassword').value;
 status.textContent='Autentificare în contul Collector…';
 try{const account=await window.CollectorAuth.signInWithPassword(email,password);document.getElementById('cloudLoginPassword').value='';
  await refreshSubscriptionStatus();await refreshAIProviderStatus();
  status.textContent='Autentificat în contul '+account.email+'. Datele locale existente rămân pe dispozitiv; sincronizarea cloud se implementează separat.';
 }catch(error){status.textContent='Autentificarea a eșuat: '+error.message}
});
document.getElementById('parseWithAI')?.addEventListener('click',runAICommand);
document.getElementById('deleteCloudAccount')?.addEventListener('click',deleteCloudAccount);
document.getElementById('enableCloudAccount')?.addEventListener('click',enableCloudAccount);
async function deleteCloudAccount(){
 const button=document.getElementById('deleteCloudAccount'),status=document.getElementById('cloudAccountStatus');
 if(!window.CollectorAuth?.isConfigured?.()||!window.CollectorAuth?.deleteAccount)return;
 if(!confirm('Ștergi definitiv contul cloud Collector? Datele locale rămân pe telefon. Ștergerea contului NU anulează abonamentul din Google Play/App Store. Anulează mai întâi abonamentul din magazin; după ștergere nu vei mai putea recupera accesul Pro cu acest cont. Continui?'))return;
 if(button)button.disabled=true;if(status)status.textContent='Se șterge contul cloud…';
 try{await window.CollectorAuth.deleteAccount();await window.CollectorSubscriptions?.logOut?.();if(status)status.textContent='Contul cloud a fost șters. Datele locale au rămas pe acest telefon.';const enableButton=document.getElementById('enableCloudAccount');if(enableButton)enableButton.hidden=false}
 catch(error){if(status)status.textContent='Nu am putut șterge contul cloud: '+error.message;if(button)button.disabled=false}
}
async function enableCloudAccount(){
 const button=document.getElementById('enableCloudAccount'),status=document.getElementById('cloudAccountStatus');
 if(button)button.disabled=true;if(status)status.textContent='Se activează serviciile cloud…';
 try{
  const result=await window.CollectorAuth?.enableCloud?.();
  if(!result?.configured)throw new Error(result?.error||'Configurarea cloud nu este completă.');
  if(status)status.textContent='Sesiunea cloud a fost reactivată.';
  await refreshSubscriptionStatus();await refreshAIProviderStatus();
 }catch(error){if(status)status.textContent='Nu am putut activa serviciile cloud: '+error.message}
 finally{if(button)button.disabled=false}
}
async function refreshAIProviderStatus(){
 const status=document.getElementById('aiProviderStatus');if(!status||!window.CollectorOpenAIProvider)return;
 const button=document.getElementById('parseWithAI'),deleteButton=document.getElementById('deleteCloudAccount'),enableButton=document.getElementById('enableCloudAccount');
 try{const info=await CollectorOpenAIProvider.status();status.textContent=info.unavailable?'AI cloud nu este configurat pentru această versiune. Funcțiile locale rămân active.':info.unauthenticated?'Autentificarea cloud nu este configurată. AI rămâne dezactivat.':info.configured?'Collector Pro activ · AI disponibil · '+info.model:info.entitlement==='free'?'Plan Free · AI cloud este inclus în Collector Pro.':'AI cloud indisponibil: verifică backend-ul, abonamentul și configurarea providerului.';const usageLabel=document.getElementById('subscriptionUsage');if(usageLabel){const usage=info.aiUsage;usageLabel.textContent=usage?'Buget AI lunar: '+usage.usedUsd.toFixed(3)+' / '+usage.budgetUsd.toFixed(2)+' USD utilizat · '+usage.remainingUsd.toFixed(3)+' USD rămas.':''}status.dataset.ready=String(info.configured);if(button)button.disabled=!info.configured;if(deleteButton)deleteButton.disabled=!(info.accountDeletionEnabled&&window.CollectorAuth?.isConfigured?.());if(enableButton)enableButton.hidden=!window.CollectorAuth?.isOptedOut?.()}
 catch{status.textContent='Server AI indisponibil. Funcțiile locale rămân active.';status.dataset.ready='false';if(button)button.disabled=true;if(deleteButton)deleteButton.disabled=true;if(enableButton)enableButton.hidden=!window.CollectorAuth?.isOptedOut?.()}
}
document.getElementById('parseCommand').onclick=runCommand;
let activeRecognition=null;
let voiceSessionRecognition=null;
let voiceSessionActive=false;
let voiceSessionTranscript='';
function setVoiceUi(listening){const local=document.getElementById('voiceButton');if(local){local.textContent=listening?'■ Oprește dictarea':'🎙 Dictează comandă';local.setAttribute('aria-label',listening?'Oprește dictarea':'Începe dictarea');local.setAttribute('aria-pressed',String(listening))}}
function setVoiceSessionUi(listening){const session=document.getElementById('voiceSessionButton');if(session){session.textContent=listening?'■ Oprește transcrierea':'🎙 Transcriere live';session.setAttribute('aria-label',listening?'Oprește transcrierea live':'Începe transcrierea live');session.setAttribute('aria-pressed',String(listening))}}
function stopVoiceSession(){if(!voiceSessionActive)return;voiceSessionActive=false;setVoiceSessionUi(false);setAppStatus('Oprire sesiune. Pregătesc preview-ul observației; nimic nu este salvat automat.');try{voiceSessionRecognition?.stop()}catch(error){setAppStatus('Sesiunea s-a oprit: '+error.message)}}
function startVoiceSession(){if(voiceSessionActive){stopVoiceSession();return}const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){const message='Sesiunea vocală nu este disponibilă în acest browser. Poți introduce observația în câmpul text.';setAppStatus(message);document.getElementById('commandResult').textContent=message;document.getElementById('commandInput').focus();return}if(activeRecognition){try{activeRecognition.stop()}catch{}activeRecognition=null;setVoiceUi(false)}voiceSessionTranscript='';pendingCoreCommand=null;const rec=new SR();voiceSessionRecognition=rec;voiceSessionActive=true;rec.lang='ro-RO';rec.interimResults=true;rec.maxAlternatives=1;rec.continuous=true;rec.onstart=()=>{setVoiceSessionUi(true);setAppStatus('Sesiune vocală activă. Poți dicta mai multe fraze; oprește sesiunea când ai terminat. Nu se salvează nimic fără confirmarea Core.')} ;rec.onresult=e=>{let interim='';for(let i=e.resultIndex||0;i<(e.results||[]).length;i++){const result=e.results[i],phrase=String(result[0]?.transcript||'').trim();if(!phrase)continue;if(result.isFinal)voiceSessionTranscript+=(voiceSessionTranscript?' ':'')+phrase;else interim+=(interim?' ':'')+phrase}const preview=voiceSessionTranscript+(interim?(voiceSessionTranscript?' ':'')+interim:'');document.getElementById('commandInput').value=preview;setAppStatus('Sesiune vocală: '+(voiceSessionTranscript.trim()?'text capturat, continuă sau oprește pentru preview.':'ascult.'))};rec.onerror=e=>{voiceSessionActive=false;setVoiceSessionUi(false);const message='Sesiunea vocală s-a întrerupt: '+e.error+'. Textul capturat până acum este păstrat pentru verificare.';setAppStatus(message)};rec.onend=()=>{const transcript=voiceSessionTranscript.trim();voiceSessionActive=false;voiceSessionRecognition=null;setVoiceSessionUi(false);if(transcript){document.getElementById('commandInput').value='Observație: '+transcript;setAppStatus('Sesiunea s-a încheiat. Verifică preview-ul observației înainte de salvare.');runCommand()}else setAppStatus('Sesiunea vocală s-a încheiat fără text recunoscut. Nu s-au modificat datele.')};try{rec.start()}catch(error){voiceSessionActive=false;voiceSessionRecognition=null;setVoiceSessionUi(false);setAppStatus('Nu am putut porni sesiunea vocală: '+error.message)}}
function startVoiceCapture(){if(activeRecognition){activeRecognition.stop();return}const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){const message='Dictarea vocală nu este disponibilă în acest browser. Poți scrie comanda sau folosi dictarea sistemului de operare.';setAppStatus(message);document.getElementById('commandResult').textContent=message;document.getElementById('commandInput').focus();return}const rec=new SR();activeRecognition=rec;rec.lang='ro-RO';rec.interimResults=false;rec.maxAlternatives=1;rec.continuous=false;rec.onstart=()=>{setVoiceUi(true);setAppStatus('Ascult o comandă. Nu se salvează nimic fără confirmarea Core.')} ;rec.onresult=e=>{const transcript=Array.from(e.results||[]).map(result=>result[0]?.transcript||'').join(' ').trim();if(!transcript)return;document.getElementById('commandInput').value=transcript;setAppStatus('Am recepționat dictarea. Pregătesc verificarea și preview-ul.');runCommand()};rec.onerror=e=>{activeRecognition=null;setVoiceUi(false);const message='Dictarea nu a reușit: '+e.error+'. Poți încerca din nou sau poți introduce textul.';setAppStatus(message);document.getElementById('commandResult').textContent=message};rec.onend=()=>{activeRecognition=null;setVoiceUi(false);setAppStatus('Dictarea s-a încheiat. Verifică preview-ul înainte de salvare.')};try{rec.start()}catch(error){activeRecognition=null;setVoiceUi(false);setAppStatus('Nu am putut porni microfonul: '+error.message)}}
document.getElementById('voiceButton').onclick=startVoiceCapture;
document.getElementById('voiceSessionButton').onclick=startVoiceSession;
let audioStorageReady=true,audioRecorder=null,audioStream=null,audioStartPending=false,audioChunks=[],audioStartedAt=0,audioPausedMs=0,audioPauseStartedAt=0,audioTimer=null,audioObjectUrl=null,audioPlaybackRecordId=null,nativeAudioSession=null,audioSessionId=null,audioChunkSaveQueue=Promise.resolve(),audioChunkPersistError=null;
let audioWakeLock=null;
async function acquireAudioWakeLock(){if(!('wakeLock'in navigator)||document.visibilityState!=='visible')return false;if(audioWakeLock&&!audioWakeLock.released)return true;try{const lock=await navigator.wakeLock.request('screen');audioWakeLock=lock;lock.addEventListener('release',()=>{if(audioWakeLock===lock)audioWakeLock=null});return true}catch(error){audioWakeLock=null;return false}}
async function releaseAudioWakeLock(){const lock=audioWakeLock;audioWakeLock=null;if(lock&&!lock.released){try{await lock.release()}catch(error){console.warn('Nu am putut elibera Screen Wake Lock:',error)}}}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&audioRecorder?.state==='recording')acquireAudioWakeLock();else if(document.visibilityState==='hidden'&&audioRecorder?.state==='recording'&&!audioRecorder.native)setAppStatus('Collector a trecut în fundal. Fragmentele deja capturate sunt salvate periodic; sistemul de operare poate totuși suspenda microfonul sau browserul.')});
function formatAudioDuration(ms){const total=Math.max(0,Math.floor(ms/1000)),hours=Math.floor(total/3600),minutes=Math.floor(total%3600/60),seconds=total%60;return hours>0?String(hours).padStart(2,'0')+':'+String(minutes).padStart(2,'0')+':'+String(seconds).padStart(2,'0'):String(minutes).padStart(2,'0')+':'+String(seconds).padStart(2,'0')}
function audioElapsed(){if(audioPauseStartedAt)return audioPausedMs;if(audioRecorder?.state==='recording')return Math.max(0,Date.now()-audioStartedAt-audioPausedMs);return audioPausedMs}
function setAudioUi(state,message){const start=document.getElementById('audioRecordStart'),pause=document.getElementById('audioRecordPause'),resume=document.getElementById('audioRecordResume'),stop=document.getElementById('audioRecordStop'),global=document.getElementById('globalVoice'),status=document.getElementById('audioRecorderStatus');if(start)start.disabled=state!=='idle';if(pause)pause.disabled=state!=='recording';if(resume)resume.disabled=state!=='paused';if(stop)stop.disabled=!['recording','paused'].includes(state);if(global){const active=['recording','paused'].includes(state);global.disabled=['starting','saving'].includes(state);global.textContent=active?'■ Oprește înregistrarea':'🎙 Înregistrează';global.setAttribute('aria-label',active?'Oprește înregistrarea audio':'Începe înregistrarea audio');global.setAttribute('aria-pressed',String(active));global.classList.toggle('is-listening',state==='recording')}if(status&&message)status.textContent=message}
function updateAudioTimer(){const timer=document.getElementById('audioRecorderTimer');if(timer)timer.textContent=formatAudioDuration(audioElapsed())}
function clearAudioPlayback(){const player=document.getElementById('audioPlayback');if(player){player.pause();player.removeAttribute('src');player.load();player.hidden=true}if(audioObjectUrl){URL.revokeObjectURL(audioObjectUrl);audioObjectUrl=null}audioPlaybackRecordId=null}
function setAudioPlayback(recordId,source,ownedObjectUrl=null){const player=document.getElementById('audioPlayback');if(!player)throw new Error('Playerul audio nu este disponibil.');clearAudioPlayback();audioObjectUrl=ownedObjectUrl;player.src=source;player.hidden=false;audioPlaybackRecordId=recordId;return player}
function stopAudioTracks(){if(audioStream){for(const track of audioStream.getTracks())track.stop();audioStream=null}}
async function startNativeAudioRecording(){
 if(audioStartPending||audioRecorder&&['recording','paused'].includes(audioRecorder.state))return;
 try{
  audioStartPending=true;setAudioUi('starting','Solicit permisiunea pentru microfon…');
  const id='audio-'+(crypto.randomUUID?.()||Date.now()+'-'+Math.random().toString(16).slice(2));
  nativeAudioSession=await window.CollectorNativeAudioRecorder.start({id});
  audioRecorder={state:'recording',native:true};audioStartedAt=Date.now();audioPausedMs=0;audioPauseStartedAt=0;audioStartPending=false;
  const wakeLockAcquired=await acquireAudioWakeLock();
  setAudioUi('recording','Înregistrare audio nativă activă. '+(wakeLockAcquired?'Ecranul este menținut activ. ':'Păstrează aplicația în prim-plan pentru sesiuni lungi. ')+'Poți pune pauză sau opri înregistrarea.');
  audioTimer=setInterval(updateAudioTimer,250);updateAudioTimer();
 }catch(error){audioStartPending=false;nativeAudioSession=null;audioRecorder=null;await releaseAudioWakeLock();setAudioUi('idle','Nu am putut porni înregistrarea nativă: '+error.message)}
}
async function recoverInterruptedAudio(){
 const button=document.getElementById('audioRecoverPending');if(button)button.disabled=true;
 try{
  await window.CollectorNativeAudioRecorder?.initialize();
  const pending=await window.CollectorNativeAudioRecorder?.getPending();
  setAudioUi('saving','Încerc recuperarea înregistrării întrerupte…');
  if(pending){
   const result=await window.CollectorNativeAudioRecorder.stop();
   const record=await CollectorAudioStore.saveNative({...result,createdAt:new Date(Number(pending.startedAt)||Date.now()).toISOString(),durationMs:Number(result.durationMs)||Date.now()-Number(pending.startedAt)});
   await window.CollectorNativeAudioRecorder.complete(record.id);
   nativeAudioSession=null;audioRecorder=null;
   const player=setAudioPlayback(record.id,window.CollectorNativeAudioRecorder.toPlayableUrl(record.uri));
   setAudioUi('idle','Înregistrarea întreruptă a fost recuperată și salvată. '+formatAudioDuration(record.durationMs)+' · '+Math.round(record.size/1024)+' KB. '+(record.warning||'Verifică redarea.'));
  }else{
   const sessions=await CollectorAudioStore.listInterruptedSessions();
   const session=sessions[0];if(!session)throw new Error('Nu există o înregistrare întreruptă de recuperat.');
   const record=await CollectorAudioStore.recoverSession(session.id);
   audioSessionId=null;
   const objectUrl=URL.createObjectURL(record.blob);
   const player=setAudioPlayback(record.id,objectUrl,objectUrl);
   setAudioUi('idle','Înregistrarea întreruptă a fost recuperată din '+(session.chunkCount||session.chunks?.length||0)+' fragmente. '+formatAudioDuration(record.durationMs)+' · '+Math.round(record.size/1024)+' KB. Verifică redarea.');
  }
  const remainingWeb=await CollectorAudioStore.listInterruptedSessions(),remainingNative=await window.CollectorNativeAudioRecorder?.getPending();
  if(button)button.hidden=!remainingNative&&!remainingWeb.length;
  await renderAudioRecordings();
 }catch(error){setAudioUi('idle','Recuperarea nu a reușit; datele parțiale au fost păstrate pentru o nouă încercare: '+error.message);if(button)button.hidden=false}
 finally{if(button)button.disabled=false}
}
async function startAudioRecording(){
 if(audioStartPending||audioRecorder&&['recording','paused'].includes(audioRecorder.state))return;
 if(!audioStorageReady){setAudioUi('idle','Stocarea audio nu este disponibilă. Nicio înregistrare nu a fost pornită.');return}
 if(window.CollectorNativeAudioRecorder?.isAvailable())return startNativeAudioRecording();
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){setAudioUi('idle','Înregistrarea audio nu este disponibilă în acest browser. Încearcă un browser cu MediaRecorder și permisiune pentru microfon.');return}
 if(!window.CollectorAudioStore){setAudioUi('idle','Stocarea audio locală nu este disponibilă. Nicio înregistrare nu a fost pornită.');return}
 try{
  audioStartPending=true;setAudioUi('starting','Solicit accesul la microfon…');
  audioStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
  const mimeCandidates=['audio/webm;codecs=opus','audio/webm','audio/mp4'],mimeType=mimeCandidates.find(type=>MediaRecorder.isTypeSupported?.(type));
  audioRecorder=new MediaRecorder(audioStream,mimeType?{mimeType}:undefined);audioStartPending=false;audioChunks=[];audioStartedAt=Date.now();audioPausedMs=0;audioPauseStartedAt=0;
  audioSessionId='audio-'+(crypto.randomUUID?.()||Date.now()+'-'+Math.random().toString(16).slice(2));audioChunkSaveQueue=Promise.resolve();audioChunkPersistError=null;
  await CollectorAudioStore.beginSession({id:audioSessionId,createdAt:new Date(audioStartedAt).toISOString(),mimeType:audioRecorder.mimeType||mimeType||'audio/webm'});
  audioRecorder.ondataavailable=event=>{if(event.data&&event.data.size>0){audioChunks.push(event.data);const sessionId=audioSessionId,elapsed=Math.max(0,Date.now()-audioStartedAt-audioPausedMs);audioChunkSaveQueue=audioChunkSaveQueue.then(()=>CollectorAudioStore.appendSessionChunk(sessionId,event.data,elapsed)).catch(error=>{audioChunkPersistError=error;setAppStatus('Backup-ul periodic al înregistrării nu a reușit: '+error.message)})}};
  audioRecorder.onerror=event=>{releaseAudioWakeLock();stopAudioTracks();clearInterval(audioTimer);audioTimer=null;audioRecorder=null;const recoverButton=document.getElementById('audioRecoverPending');if(recoverButton)recoverButton.hidden=false;setAudioUi('idle','Eroare la înregistrarea audio: '+(event.error?.message||'eroare necunoscută')+'. Fragmentele deja salvate pot fi recuperate.')};
  audioRecorder.onstop=async()=>{
   clearInterval(audioTimer);audioTimer=null;await releaseAudioWakeLock();stopAudioTracks();
   if(audioPauseStartedAt){audioPausedMs+=Date.now()-audioPauseStartedAt;audioPauseStartedAt=0}
   await audioChunkSaveQueue;
   const durationMs=Math.max(0,Date.now()-audioStartedAt-audioPausedMs),type=audioRecorder?.mimeType||audioChunks[0]?.type||'audio/webm',blob=new Blob(audioChunks,{type});audioRecorder=null;
   if(!blob.size){
    const recoverable=await CollectorAudioStore.listInterruptedSessions(),recoverButton=document.getElementById('audioRecoverPending');
    if(recoverButton)recoverButton.hidden=!recoverable.length;
    if(!recoverable.length&&audioSessionId){await CollectorAudioStore.removeSession(audioSessionId);audioSessionId=null}
    setAudioUi('idle',recoverable.length?'Nu s-a finalizat fișierul complet, dar există fragmente recuperabile. Apasă „Recuperează”.':'Înregistrarea s-a încheiat, dar browserul nu a furnizat date audio.');
    return;
   }
   try{
    const record={id:audioSessionId||('audio-'+(crypto.randomUUID?.()||Date.now()+'-'+Math.random().toString(16).slice(2))),createdAt:new Date(audioStartedAt).toISOString(),durationMs,mimeType:type,size:blob.size,blob};
    await CollectorAudioStore.save(record);
    let checkpointCleanupWarning='';
    try{await CollectorAudioStore.removeSession(record.id)}catch(cleanupError){checkpointCleanupWarning=' Checkpointul temporar nu a putut fi curățat: '+cleanupError.message;const recoverButton=document.getElementById('audioRecoverPending');if(recoverButton)recoverButton.hidden=false}
    audioSessionId=null;
    const objectUrl=URL.createObjectURL(blob);
    const player=setAudioPlayback(record.id,objectUrl,objectUrl);
    setAudioUi('idle','Înregistrare salvată local. '+formatAudioDuration(durationMs)+' · '+Math.round(blob.size/1024)+' KB. '+(audioChunkPersistError?'Unele checkpoint-uri periodice au eșuat, dar fișierul final a fost salvat. ':'')+checkpointCleanupWarning+' Nu a fost adăugat niciun eveniment în jurnal.');
    await renderAudioRecordings();
   }catch(error){setAudioUi('idle','Nu am putut salva înregistrarea locală: '+error.message)}
  };
  audioRecorder.start(1000);
  const wakeLockAcquired=await acquireAudioWakeLock();
  setAudioUi('recording','Înregistrare audio activă. '+(wakeLockAcquired?'Ecranul este menținut activ. ':'Blocarea stingerii ecranului nu este disponibilă; păstrează aplicația în prim-plan. ')+'Fragmentele sunt salvate periodic local pentru recuperare; apasă pauză sau oprește când ai terminat.');
  audioTimer=setInterval(updateAudioTimer,250);updateAudioTimer();
 }catch(error){audioStartPending=false;stopAudioTracks();audioRecorder=null;if(audioSessionId){try{await CollectorAudioStore.removeSession(audioSessionId)}catch(cleanupError){}audioSessionId=null}setAudioUi('idle',error.name==='NotAllowedError'?'Accesul la microfon a fost refuzat. Permite accesul din setările aplicației.':'Nu am putut porni înregistrarea: '+error.message)}
}
async function pauseAudioRecording(){
 if(nativeAudioSession){
  if(audioRecorder?.state!=='recording')return;
  try{await window.CollectorNativeAudioRecorder.pause();audioPauseStartedAt=Date.now();audioRecorder.state='paused';await releaseAudioWakeLock();setAudioUi('paused','Înregistrare nativă pusă pe pauză. Apasă reia sau oprește.')}
  catch(error){setAudioUi('recording','Nu am putut pune în pauză: '+error.message)}
  return;
 }
 if(audioRecorder?.state!=='recording')return;
 try{audioRecorder.pause();audioPauseStartedAt=Date.now();await releaseAudioWakeLock();setAudioUi('paused','Înregistrare pusă pe pauză. Ecranul poate reveni la stingerea automată. Apasă reia sau oprește.')}
 catch(error){setAudioUi('recording','Nu am putut pune în pauză: '+error.message)}
}
async function resumeAudioRecording(){
 if(nativeAudioSession){
  if(audioRecorder?.state!=='paused')return;
  try{await window.CollectorNativeAudioRecorder.resume();if(audioPauseStartedAt){audioPausedMs+=Date.now()-audioPauseStartedAt;audioPauseStartedAt=0}audioRecorder.state='recording';const wakeLockAcquired=await acquireAudioWakeLock();setAudioUi('recording','Înregistrare nativă reluată. '+(wakeLockAcquired?'Ecranul este menținut activ. ':'Păstrează aplicația în prim-plan.'))}
  catch(error){setAudioUi('paused','Nu am putut relua înregistrarea: '+error.message)}
  return;
 }
 if(audioRecorder?.state!=='paused')return;
 try{audioRecorder.resume();if(audioPauseStartedAt){audioPausedMs+=Date.now()-audioPauseStartedAt;audioPauseStartedAt=0}const wakeLockAcquired=await acquireAudioWakeLock();setAudioUi('recording','Înregistrare reluată. '+(wakeLockAcquired?'Ecranul este menținut activ. ':'Blocarea stingerii ecranului nu este disponibilă. ')+'Microfonul este activ.')}
 catch(error){setAudioUi('paused','Nu am putut relua înregistrarea: '+error.message)}
}
async function stopAudioRecording(){
 if(!audioRecorder||!['recording','paused'].includes(audioRecorder.state))return;
 if(nativeAudioSession){
  setAudioUi('saving','Oprire și salvare înregistrare nativă…');await releaseAudioWakeLock();clearInterval(audioTimer);audioTimer=null;
  const elapsed=audioElapsed();
  try{
   const result=await window.CollectorNativeAudioRecorder.stop();
   const record=await CollectorAudioStore.saveNative({...result,createdAt:new Date(Number(nativeAudioSession.startedAt)||Date.now()).toISOString(),durationMs:Number(result.durationMs)||elapsed});
   await window.CollectorNativeAudioRecorder.complete(record.id);
   audioRecorder=null;nativeAudioSession=null;
   const player=setAudioPlayback(record.id,window.CollectorNativeAudioRecorder.toPlayableUrl(record.uri));
   setAudioUi('idle','Înregistrare nativă salvată pe telefon. '+formatAudioDuration(record.durationMs)+' · '+Math.round(record.size/1024)+' KB. '+(record.warning||'Nu a fost adăugat niciun eveniment în jurnal.'));
   await renderAudioRecordings();
  }catch(error){audioRecorder=null;nativeAudioSession=null;const recoverButton=document.getElementById('audioRecoverPending');if(recoverButton)recoverButton.hidden=false;setAudioUi('idle','Nu am putut salva înregistrarea nativă. Checkpointul a fost păstrat pentru recuperare: '+error.message)}
  return;
 }
 setAudioUi('saving','Oprire și salvare locală…');await releaseAudioWakeLock();
 try{audioRecorder.stop()}catch(error){stopAudioTracks();audioRecorder=null;const recoverable=await CollectorAudioStore.listInterruptedSessions().catch(()=>[]),recoverButton=document.getElementById('audioRecoverPending');if(recoverButton)recoverButton.hidden=!recoverable.length;setAudioUi('idle','Nu am putut opri înregistrarea: '+error.message+(recoverable.length?' Fragmentele capturate pot fi recuperate.':''))}
}
async function playAudioRecording(recordId){
 try{
  const record=await CollectorAudioStore.get(recordId);
  if(record?.uri){
   const player=setAudioPlayback(record.id,window.CollectorNativeAudioRecorder?.toPlayableUrl(record.uri)||window.Capacitor?.convertFileSrc?.(record.uri)||record.uri);await player.play();return;
  }
  if(!record?.blob)throw Error('Fișierul audio nu mai există.');
  const objectUrl=URL.createObjectURL(record.blob);
  const player=setAudioPlayback(record.id,objectUrl,objectUrl);await player.play();
 }catch(error){setAudioUi('idle','Nu pot reda înregistrarea: '+error.message)}
}
async function deleteAudioRecording(recordId){
 if(!confirm('Ștergi definitiv această înregistrare audio locală?'))return;
 try{if(audioPlaybackRecordId===recordId)clearAudioPlayback();await CollectorAudioStore.remove(recordId);await renderAudioRecordings();setAudioUi('idle','Înregistrarea audio a fost ștearsă din stocarea locală.')}
 catch(error){setAudioUi('idle','Nu am putut șterge înregistrarea: '+error.message)}
}
async function renderAudioRecordings(){
 const list=document.getElementById('audioRecordingList');if(!list||!window.CollectorAudioStore)return;
 try{
  const records=await CollectorAudioStore.list();list.replaceChildren();
  if(!records.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='Nu există înregistrări audio locale.';list.append(empty);return}
  for(const record of records){
   const row=document.createElement('div');row.className='audio-recording-row';
   const info=document.createElement('div'),name=document.createElement('b'),meta=document.createElement('small');
   name.textContent=record.title||new Date(record.createdAt).toLocaleString('ro-RO');meta.textContent=new Date(record.createdAt).toLocaleString('ro-RO')+' · '+formatAudioDuration(record.durationMs)+' · '+Math.round(record.size/1024)+' KB'+(record.warning?' · '+record.warning:'');info.append(name,meta);
   const actions=document.createElement('div');actions.className='row-actions';
   const play=document.createElement('button');play.className='secondary';play.type='button';play.textContent='Redă';play.setAttribute('aria-label','Redă înregistrarea din '+name.textContent);play.addEventListener('click',()=>playAudioRecording(record.id));
   const rename=document.createElement('button');rename.className='secondary';rename.type='button';rename.textContent='Redenumește';rename.setAttribute('aria-label','Redenumește înregistrarea '+name.textContent);rename.addEventListener('click',async()=>{const next=prompt('Titlu pentru această înregistrare:',record.title||name.textContent);if(next===null)return;try{await CollectorAudioStore.rename(record.id,next);await renderAudioRecordings()}catch(error){setAudioUi('idle','Nu am putut redenumi înregistrarea: '+error.message)}});const remove=document.createElement('button');remove.className='secondary';remove.type='button';remove.textContent='Șterge';remove.setAttribute('aria-label','Șterge înregistrarea din '+name.textContent);remove.addEventListener('click',()=>deleteAudioRecording(record.id));
   actions.append(play,rename,remove);row.append(info,actions);list.append(row);
  }
 }catch(error){list.textContent='Nu pot citi înregistrările locale: '+error.message}
}
document.getElementById('audioRecordStart').addEventListener('click',startAudioRecording);
document.getElementById('audioRecordPause').addEventListener('click',pauseAudioRecording);
document.getElementById('audioRecordResume').addEventListener('click',resumeAudioRecording);
document.getElementById('audioRecordStop').addEventListener('click',stopAudioRecording);
document.getElementById('audioRecoverPending')?.addEventListener('click',recoverInterruptedAudio);
document.getElementById('globalVoice').onclick=()=>{showPage('assistant');if(audioRecorder&&(audioRecorder.state==='recording'||audioRecorder.state==='paused'))stopAudioRecording();else startAudioRecording()};
// Work draft: isolated autosave through the selected StorageAdapter. It never writes to the event journal.
const WORK_DRAFT_KEY='collector_work_command_draft_v1';
function initializeWorkDraft(){
 const input=document.getElementById('commandInput'),status=document.getElementById('workDraftStatus'),clear=document.getElementById('clearWorkDraft');
 if(!input)return;
 let writeVersion=0,draftWriteQueue=Promise.resolve();
 const enqueueDraftWrite=(value,version)=>{
  draftWriteQueue=draftWriteQueue.catch(()=>undefined).then(()=>storageAdapter[(value.trim()?'writeRaw':'removeRaw')](WORK_DRAFT_KEY,...(value.trim()?[value]:[]))).then(()=>{
   if(version===writeVersion)status.textContent=value.trim()?'Draft salvat local automat.':'Draft gol.';
  }).catch(error=>{if(version===writeVersion)status.textContent='Nu am putut salva draftul local: '+error.message});
  return draftWriteQueue;
 };
 (async()=>{
  const version=writeVersion;
  try{const saved=await storageAdapter.readRaw(WORK_DRAFT_KEY);if(version===writeVersion&&saved&&input.value===''){input.value=saved;status.textContent='Draft recuperat automat de pe acest dispozitiv.'}}
  catch(error){if(version===writeVersion)status.textContent='Salvarea draftului local nu este disponibilă.'}
 })();
 input.addEventListener('input',()=>{
  const version=++writeVersion,value=input.value;
  void enqueueDraftWrite(value,version);
 });
 clear?.addEventListener('click',async()=>{
  const version=++writeVersion;
  if(!input.value.trim()){
   try{await enqueueDraftWrite('',version);status.textContent='Draft gol.'}catch(error){status.textContent='Draftul gol nu a putut fi șters din stocare.'}
   return;
  }
  if(!confirm('Ștergi textul draftului? Nu a fost salvat ca eveniment.'))return;
  input.value='';
  try{await enqueueDraftWrite('',version);status.textContent='Draft șters. Niciun eveniment nu a fost modificat.'}
  catch(error){status.textContent='Textul a fost golit, dar draftul nu a putut fi șters din stocare.'}
  input.focus();
 });
 document.querySelectorAll('[data-command-template]').forEach(button=>button.addEventListener('click',()=>{
  const template=button.dataset.commandTemplate||'',start=input.selectionStart??input.value.length,end=input.selectionEnd??input.value.length;
  input.setRangeText(template,start,end,'end');input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();
 }));
}

async function clearAllLocalData(){
 const button=document.getElementById('clearLocalData'),status=document.getElementById('localDataClearStatus'),main=document.getElementById('mainContent');
 if(localDataErasing)return false;
 if(audioStartPending||audioRecorder||nativeAudioSession){
  const message='Oprește și salvează mai întâi înregistrarea audio activă. Datele locale nu au fost șterse.';
  if(status)status.textContent=message;setAppStatus(message);return false;
 }
 if(!confirm('Ștergi definitiv de pe acest dispozitiv istoricul Collector, drafturile, înregistrările audio, fragmentele recuperabile și alarmele locale? Recomandăm să exporți mai întâi o copie de siguranță.'))return false;
 if(!confirm('Confirmare finală: operația este ireversibilă. Contul cloud, sesiunea de autentificare și abonamentul din magazin NU vor fi șterse sau anulate. Continui?'))return false;
 localDataErasing=true;if(button)button.disabled=true;
 const wasInert=!!main?.inert;if(main)main.inert=true;
 if(status)status.textContent='Șterg datele locale și verific fiecare stocare…';
 setAppStatus('Ștergere locală în curs. Nu închide aplicația.');
 try{
  await mutationQueue.catch(()=>undefined);
  await storageAdapter.flush();
  if(voiceSessionActive){voiceSessionTranscript='';voiceSessionActive=false;try{voiceSessionRecognition?.abort()}catch{}voiceSessionRecognition=null;setVoiceSessionUi(false)}
  if(activeRecognition){const recognition=activeRecognition;activeRecognition=null;try{recognition.abort()}catch{}setVoiceUi(false)}
  await audioChunkSaveQueue.catch(()=>undefined);
  await window.CollectorNativeAudioRecorder?.discardPending?.();
  if(!window.CollectorAudioStore?.clearAll)throw new Error('Ștergerea stocării audio nu este disponibilă.');
  const audioResult=await window.CollectorAudioStore.clearAll();
  const reminderCount=await window.CollectorReminders?.clearAll?.();
  if(typeof storageAdapter.clearCollectorData!=='function')throw new Error('StorageAdapter nu oferă ștergerea datelor Collector.');
  await storageAdapter.clearCollectorData();
  if(audioObjectUrl){URL.revokeObjectURL(audioObjectUrl);audioObjectUrl=null}
  const player=document.getElementById('audioPlayback');if(player){player.pause();player.removeAttribute('src');player.load();player.hidden=true}
  const commandInput=document.getElementById('commandInput');if(commandInput)commandInput.value='';
  document.getElementById('cloudAccountLinkForm')?.reset();document.getElementById('cloudAccountLoginForm')?.reset();
  const importInput=document.getElementById('importFile');if(importInput)importInput.value='';
  db=E.emptyState();currentEntityId=null;pendingCoreCommand=null;integrityBlocked=false;integrityBlockReason=null;integrityRawBackup=null;integrityCanRebuild=false;
  render();await window.CollectorReminders?.render?.();await renderAudioRecordings();
  const message='Datele locale au fost șterse: '+(audioResult?.recordings||0)+' înregistrări indexate și '+(Number(reminderCount)||0)+' alarme. Contul cloud, autentificarea și abonamentul nu au fost modificate.';
  if(status)status.textContent=message;setAppStatus(message);return true;
 }catch(error){
  const message='Ștergerea locală nu s-a putut finaliza complet: '+String(error?.message||error)+'. Operația poate fi reluată pentru a curăța datele rămase.';
  if(status)status.textContent=message;setAppStatus(message);return false;
 }finally{
  localDataErasing=false;if(main)main.inert=wasInert;if(button)button.disabled=false;
 }
}
document.getElementById('clearLocalData')?.addEventListener('click',clearAllLocalData);

// Conversation context expires after 30 minutes; persistent entities and event history are unaffected.
// Do not persist stale in-memory snapshots on focus; context expiry is evaluated when commands are handled.
// Every committed change is persisted before publication; never write a stale in-memory snapshot on unload.
async function initializeCollectorApp(){
 const main=document.getElementById('mainContent');
 if(main)main.inert=true;
 try{
  await storageAdapter.initialize();
  db=await loadDb();
  try{
   await window.CollectorAudioStore?.initialize({capacitor:window.Capacitor,filesystem:window.Capacitor?.Plugins?.Filesystem,storage:storageAdapter});
   audioStorageReady=true;
   window.CollectorNativeAudioRecorder?.configure({capacitor:window.Capacitor,plugin:window.Capacitor?.Plugins?.CapacitorAudioRecorder,filesystem:window.Capacitor?.Plugins?.Filesystem,storage:storageAdapter});
   await window.CollectorNativeAudioRecorder?.initialize();
   const pendingAudio=await window.CollectorNativeAudioRecorder?.getPending();
   const pendingWebAudio=await window.CollectorAudioStore?.listInterruptedSessions?.()||[];
   const recoverButton=document.getElementById('audioRecoverPending');if(recoverButton)recoverButton.hidden=!pendingAudio&&!pendingWebAudio.length;
   if(pendingAudio||pendingWebAudio.length)setAudioUi('idle','Am detectat '+(pendingAudio?'o sesiune nativă întreruptă. ':'')+(pendingWebAudio.length?pendingWebAudio.length+' sesiune/sesiuni web cu fragmente recuperabile. ':'')+'Apasă „Recuperează” pentru a le salva.');
  }catch(audioError){
   audioStorageReady=false;
   setAppStatus('Stocarea audio nu a putut fi inițializată: '+String(audioError?.message||audioError));
  }
 }catch(error){
  integrityBlocked=true;
  integrityBlockReason='Inițializarea stocării a eșuat: '+String(error?.message||error);
  db=E.emptyState();
  setAppStatus(integrityBlockReason+' Datele nu au fost modificate.');
 }
 if(main)main.inert=false;
 render();
 initializeWorkDraft();
 document.getElementById('entitySearch')?.addEventListener('input',()=>renderEntities());
 if(!audioStorageReady)setAudioUi('idle','Stocarea audio nativă nu a putut fi inițializată. Funcțiile Core rămân disponibile, dar înregistrarea audio este dezactivată.');
 await window.CollectorReminders?.initialize();
 await renderAudioRecordings();
 void (async()=>{try{const auth=await window.CollectorAuth?.initialize(window.CollectorConfig||{});if(auth?.configured&&auth.userId)await refreshSubscriptionStatus()}catch(authError){setAppStatus('Autentificarea cloud nu a putut fi inițializată: '+String(authError?.message||authError))}await refreshAIProviderStatus()})();
}
initializeCollectorApp();
