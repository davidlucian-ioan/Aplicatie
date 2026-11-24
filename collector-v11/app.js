'use strict';
const E=window.CollectorEngine, KEY='collector_mvp_v2', OLD_KEY='collector_mvp_v1';
const titles={work:['WORK','Captură rapidă, înregistrare și remindere în timpul activității.'],dashboard:['THINK','Analize, grafice, date și operații.'],entities:['Entități','Entități universale, atribute temporale și cronologie.'],relations:['Relații & locații','Relații de prim rang, localizare temporală și ierarhie.'],inventory:['Populații & solduri','Cantități anonime și solduri derivate din evenimente.'],finance:['Financiar','Tranzacții pe evenimente și indicatori derivați.'],attributes:['Atribute','Definiții configurabile cu tip, rol, natură, proprietar și reguli.'],events:['Evenimente','Jurnalul de evenimente append-only.'],history:['Istoric','Cronologie completă și filtrabilă.'],assistant:['Introducere rapidă','Comenzi locale și dictare vocală, cu confirmare înainte de commit.'],audit:['Audit & date','Replay, export, import și limitele implementării.']};
let integrityBlocked=false, integrityBlockReason=null, integrityRawBackup=null, integrityCanRebuild=false;
let db=loadDb(), currentEntityId=null, aiCorePort=null, pendingCoreCommand=null;
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function id(){return E.uid()}
function commandIntentKey(){return `collector-intent:${E.uid()}`}
function loadDb(){
 let raw=null,rawText=null,parseError=null,sourceKey=KEY;
 try{rawText=localStorage.getItem(KEY);if(rawText!==null)raw=JSON.parse(rawText)}catch(error){parseError=error}
 if(raw===null&&parseError===null){sourceKey=OLD_KEY;try{rawText=localStorage.getItem(OLD_KEY);if(rawText!==null)raw=JSON.parse(rawText)}catch(error){parseError=error}}
 const preserveAndBlock=(source,error,warnings=[],canRebuild=false)=>{integrityBlocked=true;integrityCanRebuild=canRebuild;integrityBlockReason=String(error?.message||error||'Integritatea datelor nu a putut fi confirmată.');integrityRawBackup=source;const preserved=E.normDb(source);preserved.meta={...preserved.meta,replayWarnings:warnings,integrityError:integrityBlockReason};return preserved};
 if(parseError)return preserveAndBlock({storageKey:sourceKey,rawStorageValue:rawText},'Datele locale nu sunt JSON valid: '+parseError.message);
 if(raw===null){const empty=E.emptyState();persistRaw(empty);return empty}
 if(typeof raw!=='object'||Array.isArray(raw))return preserveAndBlock({rawPayload:raw},'Structura datelor locale nu este un obiect valid.');
 if(raw.schemaVersion!==undefined&&(!Number.isInteger(raw.schemaVersion)||raw.schemaVersion>7))return preserveAndBlock(raw,'Versiunea schemei este invalidă sau mai nouă decât versiunea suportată. Datele originale au fost păstrate.');
 if(raw.schemaVersion!==undefined&&raw.schemaVersion!==6&&raw.schemaVersion!==7)return preserveAndBlock(raw,'Nu există o migrare verificată pentru schema '+raw.schemaVersion+'. Datele originale au fost păstrate în modul numai citire.');
 if(raw.schemaVersion===7){try{const validated=E.validateImport(raw);if(!persistRaw(validated))throw Error('Nu am putut salva starea verificată în localStorage.');return validated}catch(error){const replayed=E.replay(Array.isArray(raw.events)?raw.events:[],[]),warnings=replayed.meta.replayWarnings||[],projectionMatch=String(error?.message||'').match(/^Import blocat: proiecția „([^”]+)” nu corespunde jurnalului/),canRebuild=warnings.length===0&&!!projectionMatch&&projectionMatch[1]!=='attributes';return preserveAndBlock(raw,error,warnings,canRebuild)}}
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
 if(!persistRaw(validated))return preserveAndBlock(raw,'Migrarea nu a putut fi salvată în localStorage.');
 return validated;
}
function persistRaw(x){try{localStorage.setItem(KEY,JSON.stringify(x));return true}catch(err){console.error(err);return false}}
function ensureAICorePort(){if(aiCorePort)return aiCorePort;const Port=window.CollectorBrowserCorePort;if(!Port)throw Error('Core Port nu a fost încărcat.');aiCorePort=new Port({core:E,store:{getState:()=>db,persistState:async next=>!integrityBlocked&&persistRaw(next),publishState:async next=>{db=next;render()}}});return aiCorePort}
function commit(type,operations,payload={},extra={}){if(integrityBlocked){alert('Aplicația este în mod numai citire: '+integrityBlockReason+'. Exportă datele originale sau importă un backup valid înainte de a continua.');return false}const ev={id:id(),type,timestamp:E.now(),source:extra.source||'user',actor:'local-user',certainty:extra.certainty||'certain',intentKey:extra.intentKey||null,payload,operations};try{const sourceOfTruth=E.replay(db.events,[]);sourceOfTruth.meta={...db.meta,...sourceOfTruth.meta};const result=E.commit(sourceOfTruth,ev);if(result.duplicate){alert('Această intenție a fost deja procesată; nu am aplicat-o a doua oară.');return false}// Persist the candidate before publishing it; a failed write must not leak into later commands.
if(!persistRaw(result.db))throw Error('Nu am putut salva datele în browser. Exportă datele și eliberează spațiu.');db=result.db;render();return result.event}catch(err){alert('Operația a fost anulată integral: '+err.message);return false}}
function setMenuOpen(open){const sidebar=document.getElementById('appSidebar'),toggle=document.getElementById('menuToggle'),backdrop=document.getElementById('sidebarBackdrop');if(!sidebar||!toggle||!backdrop)return;const wasOpen=sidebar.classList.contains('open'),restoreFocus=!open&&wasOpen&&(sidebar.contains(document.activeElement)||document.activeElement===backdrop);sidebar.classList.toggle('open',open);backdrop.classList.toggle('visible',open);toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Închide meniul':'Deschide meniul');if(restoreFocus)toggle.focus()}
function setAppStatus(message){const status=document.getElementById('appStatus');if(status)status.textContent=message}
function showPage(p){if(!titles[p])return;document.querySelectorAll('.page').forEach(x=>x.classList.toggle('active',x.id===p));document.querySelectorAll('.nav').forEach(x=>{const active=x.dataset.page===p;x.classList.toggle('active',active);if(active)x.setAttribute('aria-current','page');else x.removeAttribute('aria-current')});document.getElementById('title').textContent=titles[p][0];document.getElementById('subtitle').textContent=titles[p][1];setMenuOpen(false);render()}
document.querySelectorAll('.nav').forEach(n=>n.onclick=()=>showPage(n.dataset.page));
document.querySelectorAll('[data-think-target]').forEach(button=>button.addEventListener('click',()=>showPage(button.dataset.thinkTarget)));
document.getElementById('workStartRecording')?.addEventListener('click',()=>document.getElementById('audioRecordStart')?.click());document.getElementById('workQuickNote')?.addEventListener('click',()=>{document.getElementById('commandInput')?.focus();document.getElementById('commandInput')?.scrollIntoView({behavior:'smooth',block:'center'})});document.getElementById('workOpenThink')?.addEventListener('click',()=>showPage('dashboard'));
document.getElementById('menuToggle')?.addEventListener('click',()=>setMenuOpen(!document.getElementById('appSidebar').classList.contains('open')));
document.getElementById('sidebarBackdrop')?.addEventListener('click',()=>setMenuOpen(false));
document.addEventListener('keydown',event=>{if(event.key==='Escape')setMenuOpen(false)});
function openModal(html){document.getElementById('modalContent').innerHTML=html;const heading=document.querySelector('#modalContent h2');if(heading)heading.id='modalTitle';document.getElementById('modal').classList.remove('hidden')}function closeModal(){document.getElementById('modal').classList.add('hidden')}
function field(label,id,placeholder='',type='text'){return `<label for="${id}">${label}</label><input id="${id}" type="${type}" placeholder="${placeholder}"/>`}
function selectField(label,id,opts){return `<label for="${id}">${label}</label><select id="${id}">${opts.map(o=>`<option value="${esc(o[0])}">${esc(o[1])}</option>`).join('')}</select>`}
function optionsEntities(filter=()=>true,first='— selectează —'){return [['',first],...db.entities.filter(filter).map(e=>[e.id,`${e.name} (${e.type})`])]}
function addEntity(){openModal(`<h2>Entitate nouă</h2><div class="form">${field('Nume','newName','Ex. Monstera variegată')}${field('Tip configurabil','newType','Ex. plantă, individ, obiect, specimen')}<div class="form-actions"><button class="secondary" onclick="closeModal()">Anulează</button><button class="primary" onclick="saveEntity()">Creează</button></div></div>`)}
function saveEntity(typeOverride=null){const name=document.getElementById('newName')?.value.trim(),type=typeOverride||document.getElementById('newType')?.value.trim()||'generic';if(!name)return alert('Completează numele.');const eid=id();if(commit('entity.created',[{operation:'entity.create',target:eid,data:{name,type}}],{entityId:eid,name,type})){closeModal();showPage('entities')}}
function addLocation(){openModal(`<h2>Locație nouă</h2><div class="form">${field('Nume locație','locName','Ex. Sera 2 / Raft 4')}${selectField('Părinte (opțional)','locParent',optionsEntities(e=>e.type==='location','Fără părinte'))}<div class="form-actions"><button class="secondary" onclick="closeModal()">Anulează</button><button class="primary" onclick="saveLocation()">Creează locație</button></div></div>`)}
function saveLocation(){const name=document.getElementById('locName').value.trim(),parent=document.getElementById('locParent').value;if(!name)return alert('Completează numele locației.');const lid=id(),ops=[{operation:'entity.create',target:lid,data:{name,type:'location'}}];if(parent)ops.push({operation:'relation.create',data:{sourceId:parent,targetId:lid,type:'contains'}});if(commit('location.created',ops,{entityId:lid,name,parentId:parent||null,summary:parent?'Locație creată în ierarhia spațiilor':'Locație creată'})){closeModal();showPage('relations')}}
function relationHelp(type){const help={related_to:'Legătură generică. Nu implică proprietate, localizare sau ierarhie.',located_in:'Localizare curentă a unei entități într-o locație. O entitate poate avea o singură locație activă; mutările păstrează istoricul.',parent_of:'Sursa este părintele logic al destinației. Direcția este sursă → copil; nu se creează automat relația inversă.',contains:'Sursa conține destinația. Pentru locații, folosește aceasta pentru seră → raft sau cameră → dulap; locațiile nu se mută.',owns:'Sursa deține destinația. Nu presupune automat drepturi exclusive sau relația inversă.',custom:'Definește un nume explicit pentru relația specifică domeniului.'};return help[type]||''}
function refreshRelationForm(){const type=document.getElementById('relType').value,custom=document.getElementById('relCustom'),target=document.getElementById('relTarget'),source=document.getElementById('relSource');custom.disabled=type!=='custom';custom.required=type==='custom';custom.placeholder=type==='custom'?'Obligatoriu, ex. crescut_din':'Folosit doar pentru tipul Personalizat';document.getElementById('relHelp').textContent=relationHelp(type);const old=target.value;const opts=type==='located_in'?optionsEntities(e=>e.type==='location','Selectează locația'):optionsEntities();target.innerHTML=opts.map(o=>`<option value="${esc(o[0])}">${esc(o[1])}</option>`).join('');if(opts.some(o=>o[0]===old))target.value=old;if(type==='located_in'){source.querySelectorAll('option').forEach(o=>{const ent=db.entities.find(e=>e.id===o.value);o.disabled=!!ent&&ent.type==='location';});}else source.querySelectorAll('option').forEach(o=>o.disabled=false)}
function addRelation(){if(db.entities.length<2)return alert('Creează cel puțin două entități sau locații.');openModal(`<h2>Relație nouă</h2><div class="form">${selectField('Sursă','relSource',optionsEntities())}${selectField('Tip relație','relType',[['related_to','Asociat cu'],['located_in','Localizat în'],['parent_of','Părinte pentru'],['contains','Conține'],['owns','Deține'],['custom','Personalizat']])}${field('Nume tip personalizat','relCustom','Folosit doar pentru tipul Personalizat')}<div class="note" id="relHelp"></div>${selectField('Destinație','relTarget',optionsEntities())}<div class="note">Direcția este întotdeauna sursă → destinație. Relațiile nu sunt inversate automat.</div><div class="form-actions"><button class="secondary" onclick="closeModal()">Anulează</button><button class="primary" onclick="saveRelation()">Salvează relația</button></div></div>`);document.getElementById('relType').addEventListener('change',refreshRelationForm);refreshRelationForm()}
function saveRelation(){const sourceId=document.getElementById('relSource').value,targetId=document.getElementById('relTarget').value,type=document.getElementById('relType').value,customTypeName=document.getElementById('relCustom').value.trim();if(!sourceId||!targetId)return alert('Alege sursa și destinația.');if(type==='custom'&&!customTypeName)return alert('Numele tipului personalizat este obligatoriu.');const source=db.entities.find(e=>e.id===sourceId),target=db.entities.find(e=>e.id===targetId);if(type==='located_in'&&source?.type==='location')return alert('O locație nu se mută. Pentru ierarhia locațiilor folosește „Conține”, cu locația părinte ca sursă și locația copil ca destinație.');if(type==='located_in'&&target?.type!=='location')return alert('„Localizat în” trebuie să aibă o locație ca destinație.');const data={sourceId,targetId,type,...(type==='custom'?{customTypeName}:{})};if(commit('relation.created',[{operation:'relation.create',data}],{sourceId,targetId,relationType:type,customTypeName:type==='custom'?customTypeName:null})){closeModal();showPage('relations')}}
function addAttribute(){attributeForm(null)}function attributeForm(entityId){const suggestions=[['description','Descriere'],['identification','Identificare'],['state','Stare'],['measurement','Măsurare'],['financial','Financiar'],['other','Alt rol']];openModal(`<h2>${entityId?'Atribut pentru entitate':'Definiție atribut'}</h2><div class="form">${field('Nume','attrName','Ex. pH')}${selectField('Tip de date','attrType',[['text','Text'],['number','Număr'],['boolean','Adevărat/fals'],['date','Dată'],['json','Structură JSON']])}${selectField('Rol','attrRole',suggestions)}${selectField('Natură','attrNature',[['static','Static'],['dynamic','Dinamic'],['calculated','Calculat']])}${selectField('Proprietar','attrOwner',[['entity','Entitate'],['location','Locație'],['relation','Relație'],['event','Eveniment']])}${field('Limită recomandată minimă (opțional)','attrMin','Ex. 5.5','number')}${field('Limită recomandată maximă (opțional)','attrMax','Ex. 6.5','number')}<label><input type="checkbox" id="attrRequired"> Obligatoriu</label><label><input type="checkbox" id="attrIdentifying"> Relevant pentru identificare</label><label><input type="checkbox" id="attrHistory" checked> Păstrează istoric</label>${entityId?field('Valoare inițială','attrValue','Valoare')+`<label><input type="checkbox" id="attrCertain" checked> Valoare sigură</label>`:''}<div class="note" id="attrSuggestion">Limitele min/max sunt orientative: valorile din afara intervalului vor genera avertisment, dar vor putea fi înregistrate. Nu bloca măsurătorile reale.</div><div class="form-actions"><button class="secondary" onclick="closeModal()">Anulează</button><button class="primary" onclick="saveAttribute('${entityId||''}')">Salvează</button></div></div>`);document.getElementById('attrName').addEventListener('input',suggestAttributeForm)}
function suggestAttributeForm(){const n=document.getElementById('attrName').value.trim().toLowerCase(),tip=['ph','ec','tds','temperatură','temperatura','umiditate','înălțime','inaltime'].includes(n),ident=['cod','serie','număr de serie','numar de serie','identificator'].includes(n);if(tip){document.getElementById('attrType').value='number';document.getElementById('attrRole').value='measurement';document.getElementById('attrNature').value='dynamic';document.getElementById('attrHistory').checked=true}if(ident){document.getElementById('attrRole').value='identification';document.getElementById('attrIdentifying').checked=true}document.getElementById('attrSuggestion').textContent=tip?'Sugestie: măsurare numerică dinamică, cu istoric. Verifică înainte de salvare.':ident?'Sugestie: posibil identificator stabil. Confirmă unicitatea și semnificația.':'Sugestie generică; definește explicit semnificația temporală și rolul.'}
function saveAttribute(entityId){const name=document.getElementById('attrName').value.trim();if(!name)return alert('Numele atributului este obligatoriu.');const minRaw=document.getElementById('attrMin').value,maxRaw=document.getElementById('attrMax').value,min=minRaw===''?null:Number(minRaw),max=maxRaw===''?null:Number(maxRaw);if(min!==null&&!Number.isFinite(min)||max!==null&&!Number.isFinite(max))return alert('Limitele trebuie să fie numere valide.');if(min!==null&&max!==null&&min>max)return alert('Limita minimă nu poate fi mai mare decât limita maximă.');const def={id:id(),name,type:document.getElementById('attrType').value,role:document.getElementById('attrRole').value,nature:document.getElementById('attrNature').value,ownerType:document.getElementById('attrOwner').value,required:document.getElementById('attrRequired').checked,identifying:document.getElementById('attrIdentifying').checked,historyEnabled:document.getElementById('attrHistory').checked,validation:{min,max}};const ops=[{operation:'attribute.define',data:def}];if(entityId){const targetEntity=db.entities.find(e=>e.id===entityId);if(def.ownerType==='relation'||def.ownerType==='event')return alert('Atributul are proprietar '+def.ownerType+'. Atașează-l unei relații sau unui eveniment, nu unei entități.');if(def.ownerType==='location'&&targetEntity?.type!=='location')return alert('Atributul este definit pentru locații. Selectează o entitate de tip locație.');const raw=document.getElementById('attrValue').value;if(raw.trim()!==''||def.required){let value;try{value=parseTyped(raw,def.type);if(!confirmAttributeWarnings(def,value))return}catch(err){return alert(err.message)}ops.push({operation:'attribute.set',target:entityId,data:{name,value,certainty:document.getElementById('attrCertain').checked?'certain':'uncertain'}})}}if(commit('attribute.configured',ops,{attribute:name,entityId:entityId||null,definition:def})){closeModal();if(entityId)showPage('entities');else showPage('attributes')}}
function parseTyped(raw,type){if(type==='number'){if(raw.trim()==='')throw Error('Valoarea numerică este obligatorie.');const n=Number(raw);if(!Number.isFinite(n))throw Error('Introdu un număr valid.');return n}if(type==='boolean'){if(['true','da','1'].includes(raw.toLowerCase()))return true;if(['false','nu','0'].includes(raw.toLowerCase()))return false;throw Error('Folosește da/nu sau true/false.')}if(type==='json'){try{return JSON.parse(raw)}catch{throw Error('JSON invalid.')}}return raw}
function validateAttribute(def,value){if(def.required&&(value===null||value===''))throw Error(`„${def.name}” este obligatoriu.`);const warnings=[];if(def.type==='number'&&value!==''&&value!==null&&Number.isFinite(Number(value))){if(def.validation?.min!==null&&def.validation?.min!==undefined&&Number(value)<def.validation.min)warnings.push(`sub limita recomandată ${def.validation.min}`);if(def.validation?.max!==null&&def.validation?.max!==undefined&&Number(value)>def.validation.max)warnings.push(`peste limita recomandată ${def.validation.max}`)}return warnings}
function confirmAttributeWarnings(def,value){const warnings=validateAttribute(def,value);return !warnings.length||confirm(`Atenție: valoarea ${def.name} = ${value} este ${warnings.join(' și ')}. Valoarea reală poate fi înregistrată. Continui?`)}
function editAttribute(entityId,name){const e=db.entities.find(x=>x.id===entityId);if(!e)return;const def=db.attributes.find(a=>a.name.toLowerCase()===name.toLowerCase())||{type:typeof e.attributes[name]==='number'?'number':'text',name};openModal(`<h2>Valoare atribut: ${esc(name)}</h2><div class="form">${field('Valoare curentă / nouă','editAttrValue','Valoare')}${selectField('Certitudine','editAttrCertainty',[['certain','Sigură'],['uncertain','Incertă']])}<div class="note">Valoarea anterioară rămâne în jurnal. Corecțiile sunt evenimente noi.</div><div class="form-actions"><button class="secondary" onclick="closeModal()">Anulează</button><button class="primary" onclick="saveEditedAttribute('${entityId}','${encodeURIComponent(name)}')">Înregistrează valoarea</button></div></div>`);document.getElementById('editAttrValue').value=String(e.attributes[name]??'')}
function saveEditedAttribute(entityId,encoded){const name=decodeURIComponent(encoded),def=db.attributes.find(a=>a.name.toLowerCase()===name.toLowerCase())||{type:'text',name};let value;try{value=parseTyped(document.getElementById('editAttrValue').value,def.type);if(!confirmAttributeWarnings(def,value))return}catch(err){return alert(err.message)}const certainty=document.getElementById('editAttrCertainty').value;if(commit('attribute.value_changed',[{operation:'attribute.set',target:entityId,data:{name,value,certainty,forceHistory:true}}],{entityId,attribute:name,value,certainty},{certainty})){closeModal();showPage('entities')}}
function addPopulation(){openModal(`<h2>Grup / populație</h2><div class="form">${field('Nume grup','popName','Ex. Fancy anonimi')}${field('Tip / linie','popType','Ex. Fancy Tiger')}${field('Cantitate inițială','popQty','5','number')}${selectField('Certitudine','popCertainty',[['certain','Sigură'],['uncertain','Incertă']])}${selectField('Locație inițială','popLoc',optionsEntities(e=>e.type==='location','Fără locație'))}<div class="note">Nu se creează indivizi individuali pentru cantitatea anonimă.</div><div class="form-actions"><button class="secondary" onclick="closeModal()">Anulează</button><button class="primary" onclick="savePopulation()">Creează populație</button></div></div>`)}
function savePopulation(){const name=document.getElementById('popName').value.trim(),type=document.getElementById('popType').value.trim()||'population',qty=Number(document.getElementById('popQty').value),locationId=document.getElementById('popLoc').value,certainty=document.getElementById('popCertainty').value;if(!name||!Number.isFinite(qty)||qty<=0)return alert('Completează numele și o cantitate pozitivă.');const pid=id(),ops=[{operation:'entity.create',target:pid,data:{name,type:'population',populationType:type}}];if(locationId)ops.push({operation:'relation.create',data:{sourceId:pid,targetId:locationId,type:'located_in'}});ops.push({operation:'stock.change',data:{populationId:pid,locationId:locationId||null,quantity:qty,action:'add',disposition:'active',certainty}});if(commit('population.created',ops,{entityId:pid,name,populationType:type,quantity:qty,locationId:locationId||null,summary:`Populație creată: ${name}, cantitate inițială ${qty}${locationId?' în '+(db.entities.find(e=>e.id===locationId)?.name||'locație'):''}`},{certainty})){closeModal();showPage('inventory')}}
function addStockAction(){const pops=db.entities.filter(e=>e.type==='population'||e.type==='group'||e.attributes?.populationType);if(!pops.length)return alert('Creează mai întâi o populație/grup.');openModal(`<h2>Mișcare de stoc</h2><div class="form">${selectField('Populație / grup','stockPop',pops.map(e=>[e.id,e.name]))}${selectField('Acțiune','stockAction',[['add','Adaugă cantitate'],['move_out','Mută între locații'],['sell','Vinde'],['dispose','Scade / pierdere']])}${selectField('Locație sursă','stockLoc',optionsEntities(e=>e.type==='location','Fără locație'))}${selectField('Destinație (pentru mutare)','stockDest',optionsEntities(e=>e.type==='location','Selectează destinația'))}${field('Cantitate','stockQty','1','number')}${selectField('Certitudine','stockCertainty',[['certain','Sigură'],['uncertain','Incertă']])}<div class="note">Operația verifică soldul disponibil. Dacă nu există cantitate suficientă, întreaga operație este anulată.</div><div class="form-actions"><button class="secondary" onclick="closeModal()">Anulează</button><button class="primary" onclick="saveStockAction()">Previzualizează</button></div></div>`)}
function saveStockAction(){const populationId=document.getElementById('stockPop').value,action=document.getElementById('stockAction').value,locationId=document.getElementById('stockLoc').value||null,destinationId=document.getElementById('stockDest').value||null,quantity=Number(document.getElementById('stockQty').value),certainty=document.getElementById('stockCertainty').value;if(!Number.isFinite(quantity)||quantity<=0)return alert('Cantitatea trebuie să fie pozitivă.');if(action==='move_out'&&!destinationId)return alert('Alege destinația mutării.');const ops=[{operation:'stock.change',data:{populationId,action,locationId,destinationId,quantity,certainty}}];if(action==='sell'){const amount=prompt('Preț total al vânzării în RON? (lasă gol dacă nu dorești să înregistrezi suma)','');if(amount!==null&&amount.trim()!==''){const n=Number(amount);if(!Number.isFinite(n)||n<0)return alert('Suma nu este validă.');ops.push({operation:'finance.record',data:{entityId:populationId,kind:'sale',amount:n,currency:'RON',description:`Vânzare ${quantity} unități`,quantity}})}}const balance=E.balances(db).filter(x=>x.populationId===populationId&&x.locationId===locationId&&x.disposition==='active').reduce((a,x)=>a+x.quantity,0);const preview=action==='add'?`Se adaugă ${quantity}.`:action==='move_out'?`Se mută ${quantity}; sold estimat la sursă după mutare: ${balance-quantity}.`:`Se scad ${quantity}; sold estimat după operație: ${balance-quantity}.`;if(!confirm(`${preview}\n\nConfirmi operația?`))return;if(commit('stock.'+action,ops,{populationId,action,locationId,destinationId,quantity,certainty},{certainty})){closeModal();showPage('inventory')}}
function addFinance(){openModal(`<h2>Tranzacție financiară</h2><div class="form">${selectField('Tip','finKind',[['cost','Cost / achiziție'],['sale','Vânzare / venit'],['fee','Taxă'],['other','Altă tranzacție']])}${field('Sumă','finAmount','0.00','number')}${selectField('Monedă','finCurrency',[['RON','RON'],['EUR','EUR'],['USD','USD']])}${selectField('Entitate asociată (opțional)','finEntity',optionsEntities())}${field('Descriere','finDescription','Ex. Achiziție / taxă / vânzare')}${field('Cantitate asociată (opțional)','finQuantity','1','number')}<div class="note">Tranzacția se atașează evenimentului. Costul/venitul derivat nu se editează manual.</div><div class="form-actions"><button class="secondary" onclick="closeModal()">Anulează</button><button class="primary" onclick="saveFinance()">Înregistrează</button></div></div>`)}
function saveFinance(){const amount=Number(document.getElementById('finAmount').value),kind=document.getElementById('finKind').value,currency=document.getElementById('finCurrency').value,entityId=document.getElementById('finEntity').value||null,description=document.getElementById('finDescription').value.trim(),quantity=Number(document.getElementById('finQuantity').value||1);if(!Number.isFinite(amount)||amount<0)return alert('Suma trebuie să fie pozitivă sau zero.');if(commit('finance.transaction',[{operation:'finance.record',data:{amount,kind,currency,entityId,description,quantity}}],{amount,kind,currency,entityId,description,quantity})){closeModal();showPage('finance')}}
function addEventNote(){openModal(`<h2>Eveniment / observație</h2><div class="form">${field('Tip eveniment','noteType','Ex. observație, tratament, fertilizare')}${selectField('Element asociat (opțional)','noteEntity',optionsEntities())}<label>Detalii</label><textarea id="noteText" placeholder="Ce s-a întâmplat? Include detalii observate."></textarea>${selectField('Certitudine','noteCertainty',[['certain','Sigură'],['uncertain','Incertă']])}<div class="form-actions"><button class="secondary" onclick="closeModal()">Anulează</button><button class="primary" onclick="saveEventNote()">Salvează eveniment</button></div></div>`)}
function saveEventNote(){const type=document.getElementById('noteType').value.trim()||'observation',entityId=document.getElementById('noteEntity').value||null,description=document.getElementById('noteText').value.trim(),certainty=document.getElementById('noteCertainty').value;if(!description)return alert('Adaugă detalii despre eveniment.');if(commit('event.'+type,[{operation:'event.note',data:{entityId,description}}],{entityId,description,summary:description,certainty},{certainty})){closeModal();showPage('events')}}
function closeRelation(rid){if(!confirm('Închizi această relație? Evenimentul original rămâne în istoric.'))return;commit('relation.closed',[{operation:'relation.close',data:{relationId:rid}}],{relationId:rid});showPage('relations')}
function moveEntity(entityId){const locations=db.entities.filter(e=>e.type==='location');if(!locations.length)return alert('Creează mai întâi o locație.');openModal(`<h2>Mută entitatea</h2><div class="form">${selectField('Noua locație','moveTarget',locations.map(e=>[e.id,e.name]))}<div class="form-actions"><button class="secondary" onclick="closeModal()">Anulează</button><button class="primary" onclick="saveMove('${entityId}')">Mută</button></div></div>`)}
function saveMove(entityId){const targetId=document.getElementById('moveTarget').value;if(!targetId)return alert('Alege locația.');if(commit('entity.moved',[{operation:'relation.move',data:{sourceId:entityId,targetId}}],{entityId,targetId})){closeModal();showPage('relations')}}
function entityRelationLabel(r){return r.type==='custom'?(r.customTypeName||'Personalizat'):({'related_to':'asociat cu','located_in':'localizat în','parent_of':'părinte pentru','contains':'conține','owns':'deține'}[r.type]||r.type)}
function entityRelationsHtml(entityId){const rels=db.relations.filter(r=>!r.endedAt&&(r.sourceId===entityId||r.targetId===entityId));if(!rels.length)return '<div class="empty">Nicio relație activă pentru această entitate.</div>';return '<div class="list">'+rels.map(r=>{const source=db.entities.find(e=>e.id===r.sourceId),target=db.entities.find(e=>e.id===r.targetId);return `<div class="row"><div><b>${esc(source?.name||r.sourceId)} → ${esc(target?.name||r.targetId)}</b><div class="muted">${esc(entityRelationLabel(r))} · din ${esc(new Date(r.startedAt).toLocaleString('ro-RO'))}</div></div></div>`}).join('')+'</div>'}
function renderEntities(){const box=document.getElementById('entityList');if(currentEntityId&&db.entities.some(e=>e.id===currentEntityId)){const e=db.entities.find(x=>x.id===currentEntityId);box.innerHTML=`<div class="entity-detail"><div class="detail-head"><div><button class="secondary" onclick="currentEntityId=null;render()">← Înapoi</button><h2>${esc(e.name)}</h2><div class="muted">${esc(e.type)} · ID intern ${esc(e.id)}</div><div class="muted">Locație curentă: ${esc(E.activeLocation(db,e.id)?.name||'nespecificată')}</div></div><div class="row-actions"><button class="secondary" onclick="attributeForm('${e.id}')">+ Atribut</button><button class="secondary" onclick="moveEntity('${e.id}')">Mută</button></div></div><h3>Relații active</h3>${entityRelationsHtml(e.id)}<h3>Atribute curente</h3>${Object.entries(e.attributes||{}).map(([name,value])=>`<div class="row"><div><b>${esc(name)}</b><div class="value">${esc(typeof value==='object'?JSON.stringify(value):value)}</div><div class="muted">${(e.attributeHistory?.[name]||[]).length} valori istorice</div></div><button class="secondary" onclick="editAttribute('${e.id}','${encodeURIComponent(name)}')">Înregistrează valoare</button></div>`).join('')||'<div class="empty">Nu există atribute.</div>'}<h3>Cronologie</h3><div class="list">${entityEvents(e.id).map(eventRow).join('')||'<div class="empty">Fără evenimente.</div>'}</div><h3>Evoluție numerică</h3>${entityChart(e)}</div>`;return}box.innerHTML=db.entities.map(e=>`<div class="row"><div><b>${esc(e.name)}</b><div class="muted">${esc(e.type)} · ${Object.keys(e.attributes||{}).length} atribute · ${esc(E.activeLocation(db,e.id)?.name||'fără locație')}</div><div class="muted">${db.relations.filter(r=>!r.endedAt&&(r.sourceId===e.id||r.targetId===e.id)).length} relații active</div></div><div class="row-actions"><button class="secondary" onclick="openEntity('${e.id}')">Deschide</button><button class="secondary" onclick="moveEntity('${e.id}')">Mută</button></div></div>`).join('')||'<div class="empty">Nicio entitate încă.</div>'}
function openEntity(eid){currentEntityId=eid;showPage('entities')}
function isEventVisible(ev){return ev.status==='committed'&&!ev.hiddenFromHistory&&!db.events.some(x=>x.payload?.correctsEventId===ev.id&&x.id!==ev.id)}
function visibleEvents(){return db.events.filter(isEventVisible)}
function entityEvents(eid){return visibleEvents().filter(ev=>(ev.payload?.entityId===eid||ev.payload?.sourceId===eid||ev.payload?.targetId===eid||ev.operations?.some(op=>op.target===eid||op.data?.entityId===eid||op.data?.sourceId===eid||op.data?.targetId===eid))).sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp))}
function entityChart(e){const defs=db.attributes.filter(a=>a.type==='number'&&(a.nature==='dynamic'||a.historyEnabled)&&Object.hasOwn(e.attributes||{},a.name));if(!defs.length)return '<div class="note">Definește un atribut numeric dinamic (de exemplu pH) pentru a activa graficul.</div>';const points=[];for(const d of defs){for(const h of e.attributeHistory?.[d.name]||[]){if(Number.isFinite(Number(h.value)))points.push({name:d.name,value:Number(h.value),at:h.at,certainty:h.certainty||'certain'})}}if(!points.length)return '<div class="empty">Nu există valori numerice istorice.</div>';const selected=defs[0].name,pts=points.filter(p=>p.name===selected).sort((a,b)=>new Date(a.at)-new Date(b.at));return `<label>Atribut pentru grafic <select id="entityChartSelect" onchange="drawEntityChart('${e.id}')">${defs.map(d=>`<option value="${esc(d.name)}">${esc(d.name)}</option>`).join('')}</select></label><div id="entityChartBox" class="chart-box"></div>`}
function drawEntityChart(entityId){const box=document.getElementById('entityChartBox'),sel=document.getElementById('entityChartSelect');if(!box||!sel)return;const e=db.entities.find(x=>x.id===entityId),name=sel.value,pts=(e.attributeHistory?.[name]||[]).filter(h=>Number.isFinite(Number(h.value))).sort((a,b)=>new Date(a.at)-new Date(b.at));if(!pts.length){box.innerHTML='<div class="empty">Fără valori numerice.</div>';return}const W=760,H=250,L=55,R=20,T=20,B=40,vals=pts.map(p=>Number(p.value)),min=Math.min(...vals),max=Math.max(...vals),rng=max-min||1,t0=Date.parse(pts[0].at),t1=Date.parse(pts[pts.length-1].at),x=p=>L+(t1===t0?(W-L-R)/2:(Date.parse(p.at)-t0)/(t1-t0)*(W-L-R)),y=v=>T+(max-v)/rng*(H-T-B);let grid='';for(let i=0;i<5;i++){const v=min+(max-min)*i/4,yy=y(v);grid+=`<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#e5e7eb"/><text x="${L-7}" y="${yy+4}" text-anchor="end" font-size="11" fill="#667085">${Number(v.toFixed(3))}</text>`}const path=pts.map((p,i)=>`${i?'L':'M'} ${x(p)} ${y(Number(p.value))}`).join(' '),dots=pts.map(p=>`<circle cx="${x(p)}" cy="${y(Number(p.value))}" r="5" fill="${p.certainty==='uncertain'?'white':'#20242b'}" stroke="#20242b" stroke-width="2"><title>${esc(new Date(p.at).toLocaleString('ro-RO'))}: ${esc(p.value)} (${esc(p.certainty||'certain')})</title></circle>`).join('');const evs=entityEvents(entityId).filter(ev=>!ev.type.startsWith('attribute.')&&Date.parse(ev.timestamp)>=t0&&Date.parse(ev.timestamp)<=t1);const markers=evs.map(ev=>{const xx=L+(t1===t0?(W-L-R)/2:(Date.parse(ev.timestamp)-t0)/(t1-t0)*(W-L-R));return `<line x1="${xx}" y1="${T}" x2="${xx}" y2="${H-B}" stroke="#8a9098" stroke-dasharray="4 4"><title>${esc(ev.type)} · ${esc(new Date(ev.timestamp).toLocaleString('ro-RO'))}</title></line>`}).join('');box.innerHTML=`<div class="chart-meta">${pts.length} valori pentru ${esc(name)}. Cercurile goale sunt valori incerte; liniile punctate sunt evenimente discrete, nu dovezi de cauzalitate.</div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafic ${esc(name)}">${grid}${markers}<path d="${path}" fill="none" stroke="#20242b" stroke-width="2.5"/>${dots}</svg>`}
function renderRelations(){const rels=db.relations.filter(r=>!r.endedAt);document.getElementById('relationList').innerHTML=rels.map(r=>`<div class="row"><div><b>${esc(db.entities.find(e=>e.id===r.sourceId)?.name||r.sourceId)} → ${esc(db.entities.find(e=>e.id===r.targetId)?.name||r.targetId)}</b><div class="muted">${esc(r.type==='custom'?(r.customTypeName||'Personalizat'):({'related_to':'Asociat cu','located_in':'Localizat în','parent_of':'Părinte pentru','contains':'Conține','owns':'Deține'}[r.type]||r.type))} · din ${new Date(r.startedAt).toLocaleString('ro-RO')}</div></div><div class="row-actions"><button class="secondary" onclick="addRelationAttribute('${r.id}')">Atribut</button><button class="secondary" onclick="closeRelation('${r.id}')">Închide relația</button></div></div>`).join('')||'<div class="empty">Nicio relație activă.</div>';const locs=db.entities.filter(e=>e.type==='location');document.getElementById('locationList').innerHTML=locs.map(l=>`<div class="row"><div><b>${esc(l.name)}</b><div class="muted">${esc(E.locationPath(db,l.id).join(' → '))}</div></div><span class="badge">locație</span></div>`).join('')||'<div class="empty">Nu există locații. Creează una pentru a reprezenta localizarea ca relație.</div>'}
function renderInventory(){const bals=E.balances(db);document.getElementById('stockList').innerHTML=bals.map(b=>`<div class="row"><div><b>${esc(db.entities.find(e=>e.id===b.populationId)?.name||b.populationId)}</b><div class="muted">Locație: ${esc(db.entities.find(e=>e.id===b.locationId)?.name||'nespecificată')} · dispoziție: ${esc(b.disposition)}</div></div><strong>${b.quantity}</strong></div>`).join('')||'<div class="empty">Nu există mișcări de stoc.</div>'}
function renderFinance(){const totals=E.totalFinance(db),box=document.getElementById('financeSummary');box.innerHTML=Object.entries(totals).map(([k,v])=>{const [currency,kind]=k.split('|');return `<div class="card"><span>${esc(kind)} · ${esc(currency)}</span><strong>${v.toLocaleString('ro-RO',{maximumFractionDigits:2})}</strong></div>`}).join('')||'<div class="empty">Nu există tranzacții financiare.</div>';document.getElementById('financeList').innerHTML=db.finance.slice().sort((a,b)=>new Date(b.at)-new Date(a.at)).map(f=>`<div class="row"><div><b>${esc(f.kind)} · ${f.amount.toLocaleString('ro-RO')} ${esc(f.currency)}</b><div class="muted">${esc(f.description)} · ${esc(db.entities.find(e=>e.id===f.entityId)?.name||'fără entitate')} · ${new Date(f.at).toLocaleString('ro-RO')}</div></div><span class="badge">eveniment ${esc(f.eventId.slice(0,8))}</span></div>`).join('')||''}
function renderAttributes(){document.getElementById('attributeList').innerHTML=db.attributes.map(a=>`<div class="row"><div><b>${esc(a.name)}</b><div class="muted">${esc(a.type)} · rol ${esc(a.role)} · natură ${esc(a.nature)} · proprietar ${esc(a.ownerType||'entity')} · ${a.identifying?'identificator':'neidentificator'} · ${a.historyEnabled?'istoric activ':'istoric oprit'}${a.required?' · obligatoriu':''}</div><div class="muted">Limite recomandate: ${a.validation?`min ${a.validation.min??'—'}, max ${a.validation.max??'—'}`:'nespecificate'}</div></div><span class="badge">configurabil</span></div>`).join('')||'<div class="empty">Nicio definiție de atribut.</div>'}
function eventRow(ev){const p=ev.payload||{},ops=ev.operations||[];let detail=p.summary||p.description||p.attribute&&`${p.attribute}: ${p.previous??'—'} → ${p.value??'—'}`||p.name||p.note||'';if(!detail)detail=ops.map(o=>o.operation).join(', ');const corrected=db.events.some(x=>x.payload?.correctsEventId===ev.id);const attrName=p.attribute||ops.find(o=>o.operation==='attribute.set'||o.operation==='set_attribute')?.data?.name;const target=p.entityId||ops.find(o=>o.operation==='attribute.set'||o.operation==='set_attribute')?.target;const correctionButton=(ev.type==='event.correction'&&p.correctsEventId)?`<button class="secondary" onclick="correctAnyEvent('${p.correctsEventId}')">Modifică din nou</button>`:(ev.type==='event.correction'||ev.type==='attribute.value_corrected')?'<span class="muted">Corecție aplicată</span>':(corrected?'<span class="muted">Corectat</span>':(attrName&&target?`<button class="secondary" onclick="correctAttributeEvent('${ev.id}')">Corectează</button>`:`<button class="secondary" onclick="correctAnyEvent('${ev.id}')">Corectează</button>`));const eventAttrButton=db.attributes.some(a=>a.ownerType==='event')?`<button class="secondary" onclick="addEventAttribute('${ev.id}')">Atribut</button>`:'';return `<div class="row"><div><b>${esc(ev.type)}${corrected?' · corectat ulterior':''}</b><div>${esc(detail)}</div><div class="muted">${new Date(ev.timestamp).toLocaleString('ro-RO')} · ${esc(ev.source||'local')} · ${esc(ev.actor||'utilizator')} · ${esc(ev.id.slice(0,8))}</div></div><div class="row-actions"><span class="badge">${esc(ev.certainty||'certain')}</span>${eventAttrButton}${correctionButton}</div></div>`}
function correctAttributeEvent(eventId){const original=db.events.find(ev=>ev.id===eventId);if(!original)return;const p=original.payload||{},op=(original.operations||[]).find(o=>o.operation==='attribute.set'||o.operation==='set_attribute'),d=op?.data||{},name=p.attribute||d.name||d.attribute,target=p.entityId||op?.target;if(!name||!target)return alert('Nu pot identifica atributul din evenimentul original.');const entity=db.entities.find(e=>e.id===target),def=db.attributes.find(a=>a.name.toLowerCase()===String(name).toLowerCase())||{type:'text'};const old=p.value??d.value??entity?.attributes?.[name]??'';const raw=prompt(`Valoarea corectă pentru „${name}”:`,String(old));if(raw===null)return;let value;try{value=parseTyped(raw,def.type);if(!confirmAttributeWarnings(def,value))return}catch(err){return alert(err.message)}const note=prompt('Motivul corecției (opțional):','Corecție de valoare');if(note===null)return;if(commit('attribute.value_corrected',[{operation:'attribute.correct',target,data:{name,value,certainty:'certain',correctsEventId:eventId}},{operation:'event.invalidate',data:{correctsEventId:eventId}}],{entityId:target,attribute:name,previous:old,value,correctsEventId:eventId,correctionNote:note,summary:`Corecție ${name}: ${String(old)} → ${String(value)}`})){render()}}
function addRelationAttribute(relationId){const rel=db.relations.find(r=>r.id===relationId&&!r.endedAt);if(!rel)return alert('Relația nu mai este activă.');const defs=db.attributes.filter(a=>a.ownerType==='relation');if(!defs.length)return alert('Definește mai întâi un atribut cu proprietar „Relație”.');openModal(`<h2>Atribut pe relație</h2><div class="form">${selectField('Atribut','relAttrName',defs.map(d=>[d.name,`${d.name} (${d.type})`]))}${field('Valoare','relAttrValue','Valoare')}${selectField('Certitudine','relAttrCert',[['certain','Sigură'],['uncertain','Incertă']])}<div class="form-actions"><button class="secondary" onclick="closeModal()">Anulează</button><button class="primary" onclick="saveRelationAttribute('${relationId}')">Salvează</button></div></div>`)}
function saveRelationAttribute(relationId){const name=document.getElementById('relAttrName').value,def=db.attributes.find(a=>a.name===name);let value;try{value=parseTyped(document.getElementById('relAttrValue').value,def.type);if(!confirmAttributeWarnings(def,value))return}catch(err){return alert(err.message)}if(commit('relation.attribute_changed',[{operation:'relation.attribute.set',data:{relationId,name,value,certainty:document.getElementById('relAttrCert').value}}],{relationId,attribute:name,value})){closeModal();showPage('relations')}}
function addEventAttribute(eventId){const defs=db.attributes.filter(a=>a.ownerType==='event');if(!defs.length)return alert('Definește mai întâi un atribut cu proprietar „Eveniment”.');openModal(`<h2>Atribut pe eveniment</h2><div class="form">${selectField('Atribut','eventAttrName',defs.map(d=>[d.name,`${d.name} (${d.type})`]))}${field('Valoare','eventAttrValue','Valoare')}${selectField('Certitudine','eventAttrCert',[['certain','Sigură'],['uncertain','Incertă']])}<div class="form-actions"><button class="secondary" onclick="closeModal()">Anulează</button><button class="primary" onclick="saveEventAttribute('${eventId}')">Salvează</button></div></div>`)}
function saveEventAttribute(eventId){const name=document.getElementById('eventAttrName').value,def=db.attributes.find(a=>a.name===name);let value;try{value=parseTyped(document.getElementById('eventAttrValue').value,def.type);if(!confirmAttributeWarnings(def,value))return}catch(err){return alert(err.message)}if(commit('event.attribute_changed',[{operation:'event.attribute.set',data:{eventId,name,value,certainty:document.getElementById('eventAttrCert').value}}],{targetEventId:eventId,attribute:name,value})){closeModal();showPage('events')}}
function correctAnyEvent(eventId){
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
 if(commit('event.correction',ops,payload))render();
}
function renderHistory(){const entityFilter=document.getElementById('historyEntityFilter'),typeFilter=document.getElementById('historyTypeFilter'),prev=entityFilter.value,prevType=typeFilter.value;entityFilter.innerHTML='<option value="">Toate elementele</option>'+db.entities.map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join('');entityFilter.value=prev;typeFilter.innerHTML='<option value="">Toate tipurile</option>'+[...new Set(visibleEvents().map(e=>e.type))].sort().map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('');typeFilter.value=prevType;const eid=entityFilter.value,typ=typeFilter.value;const events=visibleEvents().filter(ev=>(!typ||ev.type===typ)&&(!eid||ev.payload?.entityId===eid||ev.payload?.sourceId===eid||ev.payload?.targetId===eid||ev.operations?.some(o=>o.target===eid||o.data?.entityId===eid||o.data?.sourceId===eid||o.data?.targetId===eid))).sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp));document.getElementById('historyList').innerHTML=events.map(eventRow).join('')||'<div class="empty">Niciun eveniment pentru filtrele selectate.</div>'}
function renderAudit(){const warnings=db.meta?.replayWarnings||[];const integrityNotice=integrityBlocked?'<p class="status-warn"><b>MOD NUMAI CITIRE</b> · '+esc(integrityBlockReason)+'. Exportul original rămâne disponibil; poți reconstrui doar dacă jurnalul este valid sau poți importa un backup verificat.</p>':'';document.getElementById('auditSummary').innerHTML=`Jurnal: <b>${db.events.length}</b> evenimente · Entități: <b>${db.entities.length}</b> · Relații: <b>${db.relations.length}</b> · Erori la replay: <b>${warnings.length}</b> · Context conversațional: <b>${E.contextIsActive(db)?'activ':'expirat'}</b>.${integrityNotice}`;document.getElementById('auditList').innerHTML=[...warnings.map(w=>`<div class="row"><div><b class="status-warn">Eroare replay</b><div>${esc(w.eventId)} · ${esc(w.error)}</div></div></div>`),...visibleEvents().slice(-10).reverse().map(eventRow)].join('')||'<div class="empty">Nu există evenimente.</div>'}
function renderThinkActivity(){
 const chart=document.getElementById('thinkActivityChart'),summary=document.getElementById('thinkActivitySummary');if(!chart||!summary)return;
 const today=new Date();today.setHours(0,0,0,0);
 const days=Array.from({length:7},(_,index)=>{const date=new Date(today);date.setDate(today.getDate()-6+index);return {date,key:[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-'),label:date.toLocaleDateString('ro-RO',{weekday:'short'}).replace('.','')}}),counts=new Map(days.map(day=>[day.key,0]));
 let total=0;
 for(const event of db.events){if(!event||event.status==='pending'||typeof event.timestamp!=='string')continue;const date=new Date(event.timestamp);if(!Number.isFinite(date.getTime()))continue;const key=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');if(counts.has(key)){counts.set(key,counts.get(key)+1);total++}}
 const max=Math.max(1,...counts.values());
 chart.innerHTML=days.map(day=>{const count=counts.get(day.key),height=count?Math.max(8,Math.round(count/max*100)):3;return '<div class="think-day" title="'+esc(day.label+': '+count+' evenimente')+'" aria-label="'+esc(day.label+': '+count+' evenimente')+'"><span class="think-day-count">'+count+'</span><div class="think-day-track"><i style="height:'+height+'%"></i></div><small>'+esc(day.label)+'</small></div>'}).join('');
 summary.textContent=total+' '+(total===1?'eveniment':'evenimente')+' în ultimele 7 zile · '+counts.get(days[6].key)+' astăzi';
}
function render(){document.getElementById('entityCount').textContent=db.entities.length;document.getElementById('eventCount').textContent=db.events.length;document.getElementById('relationCount').textContent=db.relations.filter(r=>!r.endedAt).length;document.getElementById('stockCount').textContent=E.balances(db).filter(x=>x.disposition==='active').reduce((sum,x)=>sum+Number(x.quantity||0),0);renderEntities();renderRelations();renderInventory();renderFinance();renderAttributes();document.getElementById('eventList').innerHTML=visibleEvents().slice().sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp)).map(eventRow).join('')||'<div class="empty">Niciun eveniment.</div>';document.getElementById('recentEvents').innerHTML=visibleEvents().slice().sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp)).slice(0,5).map(eventRow).join('')||'<div class="empty">Niciun eveniment.</div>';renderHistory();renderAudit();renderThinkActivity();if(currentEntityId&&document.getElementById('entityChartBox'))drawEntityChart(currentEntityId);renderVoiceContext()}
document.getElementById('quickEvent').onclick=()=>showPage('work');document.getElementById('historyEntityFilter').onchange=renderHistory;document.getElementById('historyTypeFilter').onchange=renderHistory;
function exportData(){const blob=new Blob([JSON.stringify({exportedAt:E.now(),app:'Collector MVP v6',db:integrityRawBackup||db},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='collector-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();URL.revokeObjectURL(a.href)}
document.getElementById('importFile').addEventListener('change',async ev=>{const file=ev.target.files?.[0];if(!file)return;try{const raw=JSON.parse(await file.text()),candidate=raw.db||raw;const validated=E.validateImport(candidate);if(!confirm('Jurnal valid, fără erori, iar proiecțiile corespund istoricului. Importul va înlocui datele locale curente. Ai exportat o copie de siguranță?'))return;if(!persistRaw(validated))throw Error('Nu s-au putut salva datele importate. Datele locale au rămas neschimbate.');db=validated;integrityBlocked=false;integrityCanRebuild=false;integrityBlockReason=null;integrityRawBackup=null;currentEntityId=null;render();alert('Import reușit: jurnalul și proiecțiile au fost validate.')}catch(err){alert('Import eșuat: '+err.message)}finally{ev.target.value=''}});
function verifyReplay(){const rebuilt=E.replay(db.events,[]);const report={events:db.events.length,entitiesCurrent:db.entities.length,entitiesReplay:rebuilt.entities.length,relationsCurrent:db.relations.length,relationsReplay:rebuilt.relations.length,stockCurrent:db.stock.length,stockReplay:rebuilt.stock.length,financialCurrent:db.finance.length,financialReplay:rebuilt.finance.length,warnings:rebuilt.meta.replayWarnings||[]};openModal(`<h2>Verificare replay</h2><pre>${esc(JSON.stringify(report,null,2))}</pre><p>Replay-ul reconstruiește proiecțiile pornind din jurnalul de evenimente.</p><div class="form-actions"><button class="secondary" onclick="closeModal()">Închide</button><button class="primary" onclick="rebuildFromJournal()">Reconstruiește proiecțiile</button></div>`)}
function rebuildFromJournal(){if(integrityBlocked&&!integrityCanRebuild){alert('Reconstruirea a fost blocată: datele originale nu pot fi înlocuite în siguranță prin replay. Exportă copia păstrată sau importă un backup valid.');return false}const rebuilt=E.replay(db.events,[]);const warnings=rebuilt.meta.replayWarnings||[];if(warnings.length){alert('Reconstruirea a fost blocată: jurnalul conține '+warnings.length+' evenimente invalide. Datele existente au fost păstrate. Exportă datele și repară jurnalul sau importă un backup valid.');return false}rebuilt.meta={...db.meta,...rebuilt.meta};delete rebuilt.meta.integrityError;if(!persistRaw(rebuilt)){alert('Reconstruirea nu a fost salvată. Starea activă și datele existente au rămas neschimbate.');return false}db=rebuilt;integrityBlocked=false;integrityCanRebuild=false;integrityBlockReason=null;integrityRawBackup=null;currentEntityId=null;closeModal();render();alert('Proiecțiile au fost reconstruite și salvate cu succes din jurnal.');return true}
const VOICE_CONTEXT_KEY='collector_voice_context_v1';
const VOICE_CONTEXT_TTL_MS=30*60*1000;
function readVoiceContext(){
 try{
  const raw=localStorage.getItem(VOICE_CONTEXT_KEY);if(!raw)return null;
  const context=JSON.parse(raw);
  if(!context||typeof context.entityId!=='string'||!Number.isFinite(context.expiresAt)||Date.now()>=context.expiresAt){localStorage.removeItem(VOICE_CONTEXT_KEY);return null}
  const entity=db.entities.find(item=>item.id===context.entityId);
  if(!entity){localStorage.removeItem(VOICE_CONTEXT_KEY);return null}
  return {entityId:entity.id,entityName:entity.name,entityType:entity.type,updatedAt:context.updatedAt,expiresAt:context.expiresAt};
 }catch(error){try{localStorage.removeItem(VOICE_CONTEXT_KEY)}catch{}return null}
}
function renderVoiceContext(){
 const panel=document.getElementById('voiceContextPanel'),label=document.getElementById('voiceContextLabel'),clear=document.getElementById('clearVoiceContext');
 if(!panel||!label||!clear)return;
 const context=readVoiceContext();
 if(context){
  label.textContent='Context vocal activ: '+context.entityName+' ('+context.entityType+'). Expiră la '+new Date(context.expiresAt).toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'})+'. Comenzile fără entitate explicită îl pot folosi.';
  clear.hidden=false;
 }else{
  label.textContent='Context vocal: niciun element selectat. Pentru o comandă fără nume de entitate, confirmă mai întâi o țintă.';
  clear.hidden=true;
 }
}
function clearVoiceContext(message){
 try{localStorage.removeItem(VOICE_CONTEXT_KEY)}catch{}
 renderVoiceContext();
 if(message)setAppStatus(message);
}
function setVoiceContext(entityId){
 const entity=db.entities.find(item=>item.id===entityId);
 if(!entity){clearVoiceContext();return}
 const now=Date.now();
 try{
  localStorage.setItem(VOICE_CONTEXT_KEY,JSON.stringify({entityId:entity.id,updatedAt:now,expiresAt:now+VOICE_CONTEXT_TTL_MS}));
  renderVoiceContext();
 }catch(error){clearVoiceContext('Nu am putut păstra contextul vocal local: '+error.message)}
}
function updateVoiceContextFromCommand(command){
 if(!command)return;
 const ids=new Set();
 for(const operation of command.operations||[]){
  if(operation.operation==='attribute.set'&&operation.target)ids.add(operation.target);
  if(operation.operation==='stock.change'&&operation.data?.populationId)ids.add(operation.data.populationId);
 }
 if(ids.size===1)setVoiceContext([...ids][0]);
 else if(ids.size>1)clearVoiceContext('Lotul a vizat mai multe entități; contextul vocal anterior a fost șters pentru a evita presupuneri.');
}
function voiceContextEntityForPhrase(index){
 const context=readVoiceContext();
 if(!context)throw Error('Fraza '+(index+1)+': nu ai menționat entitatea și nu există context vocal activ. Spune numele complet sau confirmă mai întâi o țintă.');
 const entity=db.entities.find(item=>item.id===context.entityId);
 if(!entity){clearVoiceContext();throw Error('Contextul vocal nu mai corespunde unei entități active. Selectează din nou ținta.')}
 return entity;
}
function parseCommand(text){
 const s=String(text??'').normalize('NFC').trim();
 if(!s)return {error:'Scrie o comandă.'};
 let m;
 // Acceptă atât forma scurtă, cât și formularea completă afișată în exemplele UI.
 if((m=s.match(/^(?:observație|observatie|notează|noteaza|înregistrează observație|inregistreaza observatie)\s*:?\s*(.+)$/iu)))return {type:'note',description:m[1].trim()};
 if((m=s.match(/^(?:setează|seteaza|înregistrează|inregistreaza)\s+(?:atributul\s+)?(.+?)\s+pentru\s+(.+?)\s*(?:=|\beste\b|\bla\b)\s*(.+)$/iu))){return {type:'attribute',attribute:m[1].trim(),entityName:m[2].trim(),value:m[3].trim()}}
 if((m=s.match(/^(?:setează|seteaza|înregistrează|inregistreaza)\s+(?:atributul\s+)?(.+?)\s*(?:=|\beste\b|\bla\b)\s*(.+)$/iu)))return {type:'attribute',attribute:m[1].trim(),entityName:null,value:m[2].trim(),usesContext:true};
 if((m=s.match(/^(?:înregistrează observație|inregistreaza observatie):?\s*(.+?)\s+are\s+(.+?)\s+([0-9]+(?:[.,][0-9]+)?)$/iu)))return {type:'attribute',entityName:m[1].trim(),attribute:m[2].trim(),value:m[3].replace(',','.')};
 if((m=s.match(/^(?:am vândut|am vandut|vinde)\s+(\d+)\s+(.+?)(?:\s+din\s+(.+))?$/iu)))return {type:'sale',quantity:Number(m[1]),populationName:m[2].trim(),locationName:m[3]?.trim()||null};
 return {error:'Nu pot interpreta această comandă fără să ghicesc. Folosește „Observație: ...” sau „Înregistrează [atribut] pentru [entitate] = [valoare]”.'};
}
function voiceBatchResolveTarget(matches,key,label,selections,unresolved,index){
 const selectedId=selections[key];
 if(matches.length===0)throw Error('Fraza '+(index+1)+': nu am găsit '+label+'. Verifică numele și încearcă din nou.');
 if(selectedId){
  const selected=matches.find(entity=>entity.id===selectedId);
  if(!selected)throw Error('Selecția pentru '+label+' nu mai este validă. Reia alegerea.');
  return selected;
 }
 if(matches.length===1)return matches[0];
 unresolved.push({key,label,index,matches});
 return null;
}
function renderVoiceBatchDisambiguation(entries,unresolved,selections){
 const box=document.getElementById('commandResult');
 const controls=unresolved.map(item=>'<label for="voiceChoice_'+esc(item.key)+'">Fraza '+(item.index+1)+' · '+esc(item.label)+'</label><select id="voiceChoice_'+esc(item.key)+'" data-voice-choice-key="'+esc(item.key)+'"><option value="">Selectează explicit…</option>'+item.matches.map(entity=>'<option value="'+esc(entity.id)+'" '+(selections[item.key]===entity.id?'selected':'')+'>'+esc(entity.name)+' · '+esc(entity.type)+' · …'+esc(entity.id.slice(-6))+'</option>').join('')+'</select>').join('');
 box.innerHTML='<b>Este necesară o alegere explicită</b><p>Am găsit mai multe potriviri. Nu am ales automat nicio entitate și nu am salvat nimic.</p>'+controls+'<p class="note">Selectează ținta corectă pentru fiecare frază. Lotul complet va fi revalidat și previzualizat numai după ce toate alegerile sunt clare.</p><button class="primary" id="resolveVoiceBatch">Reverifică lotul</button> <button class="secondary" id="cancelVoiceBatchResolution">Anulează lotul</button>';
 document.getElementById('resolveVoiceBatch').onclick=()=>{
  const next={...selections};
  box.querySelectorAll('[data-voice-choice-key]').forEach(select=>{next[select.dataset.voiceChoiceKey]=select.value});
  runVoiceBatch(entries,next);
 };
 document.getElementById('cancelVoiceBatchResolution').onclick=()=>{pendingCoreCommand=null;voiceCommandPending=false;voiceReadbackPending=false;cancelSpeechOutput();box.textContent='Lot anulat. Nu s-au modificat date.'};
}
async function runVoiceBatch(phrases,selections={}){
 const box=document.getElementById('commandResult');
 const entries=(Array.isArray(phrases)?phrases:[]).map(value=>String(value||'').trim()).filter(Boolean);
 if(!entries.length){voiceReadbackPending=false;setAppStatus('Sesiunea vocală s-a încheiat fără fraze finale. Nu s-au modificat datele.');return}
 const operations=[],items=[],summaries=[],unresolved=[],warnings=[];
 try{
  for(let index=0;index<entries.length;index++){
   const phrase=entries[index];
   let parsed=parseCommand(phrase);
   if(parsed.error)parsed={type:'note',description:phrase};
   if(parsed.type==='note'){
    operations.push({operation:'event.note',data:{description:parsed.description}});
    items.push({type:'note',description:parsed.description});
    summaries.push('Observație '+(index+1)+': „'+parsed.description+'”');
   }else if(parsed.type==='attribute'){
    const matches=parsed.entityName?db.entities.filter(x=>x.name.toLowerCase()===parsed.entityName.toLowerCase()):[];
    const entity=parsed.entityName?voiceBatchResolveTarget(matches,'entity:'+index,'entitatea „'+parsed.entityName+'”',selections,unresolved,index):voiceContextEntityForPhrase(index);
    const definitions=db.attributes.filter(a=>a.name.toLowerCase()===parsed.attribute.toLowerCase());
    if(definitions.length!==1)throw Error(definitions.length?'Fraza '+(index+1)+': definiția atributului „'+parsed.attribute+'” nu este unică.':'Fraza '+(index+1)+': atributul „'+parsed.attribute+'” nu este definit. Nu voi modifica schema în tăcere.');
    if(entity){
     const def=definitions[0];
     const value=parseTyped(parsed.value,def.type);
     const valueWarnings=validateAttribute(def,value);if(valueWarnings.length)warnings.push('Fraza '+(index+1)+' · '+def.name+': '+valueWarnings.join(' și '));
     operations.push({operation:'attribute.set',target:entity.id,data:{name:def.name,value,certainty:'certain',forceHistory:true}});
     items.push({type:'attribute',entityId:entity.id,attribute:def.name,value});
     summaries.push(entity.name+(parsed.usesContext?' · context activ':'')+' · '+def.name+' = '+JSON.stringify(value));
    }
   }else if(parsed.type==='sale'){
    const populations=db.entities.filter(x=>x.name.toLowerCase()===parsed.populationName.toLowerCase()&&(x.type==='population'||x.type==='group'));
    const population=voiceBatchResolveTarget(populations,'population:'+index,'populația „'+parsed.populationName+'”',selections,unresolved,index);
    const locations=parsed.locationName?db.entities.filter(x=>x.type==='location'&&x.name.toLowerCase()===parsed.locationName.toLowerCase()):[];
    const location=parsed.locationName?voiceBatchResolveTarget(locations,'location:'+index,'locația „'+parsed.locationName+'”',selections,unresolved,index):null;
    if(population&&(!parsed.locationName||location)){
     operations.push({operation:'stock.change',data:{populationId:population.id,action:'sell',locationId:location?.id||null,quantity:parsed.quantity,disposition:'sold'}});
     items.push({type:'sale',populationId:population.id,quantity:parsed.quantity,locationId:location?.id||null});
     summaries.push('Vânzare '+parsed.quantity+' × '+population.name+(location?' din '+location.name:''));
    }
   }
  }
  if(unresolved.length){voiceReadbackPending=false;renderVoiceBatchDisambiguation(entries,unresolved,selections);return}
  if(!operations.length)throw Error('Lotul nu conține operații valide.');
 }catch(error){voiceReadbackPending=false;box.textContent=error.message+' Nu s-a salvat nimic.';return}
 const command={contractVersion:'collector.command.v1',turnId:E.uid(),intent:'voice.batch',idempotencyKey:commandIntentKey(),source:'text',certainty:'certain',payload:{items},operations};
 try{
  const result=await ensureAICorePort().preview(command);
  if(result.status!=='preview_ok'){box.textContent=result.status==='duplicate'?'Acest lot a fost deja procesat.':'Preview-ul lotului a fost respins: '+(result.errors||[]).join(' ')+(result.errors?.length?'':' ('+result.status+')');voiceReadbackPending=false;return}
  pendingCoreCommand=command;voiceCommandPending=true;voiceReadbackPending=true;
  const summary='Lot vocal · '+entries.length+' fraze';
  const readbackText=summary+'. '+summaries.join('. ')+(warnings.length?'. Atenție: '+warnings.join('. '):'')+'. Modificări estimate: '+result.projectionChanges.entities+' entități, '+result.projectionChanges.relations+' relații, '+result.projectionChanges.stock+' modificări de stoc și '+result.projectionChanges.finance+' modificări financiare. Nu am salvat nimic. Confirmă întregul lot pe ecran.';
  box.innerHTML='<b>Preview Core Port · lot vocal</b><p>'+esc(summary)+'</p><ol>'+summaries.map(item=>'<li>'+esc(item)+'</li>').join('')+'</ol>'+(warnings.length?'<p class="note"><b>Atenție la valori:</b> '+warnings.map(esc).join('; ')+'. Confirmarea lotului confirmă și aceste valori.</p>':'')+'<p>Operații în lot: '+operations.length+'. Modificări estimate — entități: '+result.projectionChanges.entities+', relații: '+result.projectionChanges.relations+', stoc: '+result.projectionChanges.stock+', financiar: '+result.projectionChanges.finance+'.</p><p class="note">Nicio modificare nu a fost salvată. Confirmarea execută toate operațiile într-un singur eveniment atomic.</p><button class="secondary" id="readbackCoreCommand" type="button">🔊 Redă rezumatul</button> <button class="primary" id="confirmCoreCommand">Confirmă și salvează lotul</button> <button class="secondary" id="cancelCoreCommand">Anulează lotul</button>';
  document.getElementById('readbackCoreCommand').onclick=()=>speakWorkFeedback(readbackText,true);
  document.getElementById('confirmCoreCommand').onclick=confirmCoreCommand;
  document.getElementById('cancelCoreCommand').onclick=()=>{pendingCoreCommand=null;voiceCommandPending=false;voiceReadbackPending=false;cancelSpeechOutput();box.textContent='Lot anulat. Nu s-au modificat date.'};
  speakWorkFeedback(readbackText);
 }catch(error){voiceReadbackPending=false;box.textContent='Preview-ul lotului a eșuat: '+error.message}
}
async function runCommand(){
 const text=document.getElementById('commandInput').value,parsed=parseCommand(text),box=document.getElementById('commandResult');
 if(parsed.error){box.textContent=parsed.error;speakWorkFeedback(parsed.error);return}
 let operations=[],payload={},summary='';
 if(parsed.type==='note'){
  operations=[{operation:'event.note',data:{description:parsed.description}}];payload={description:parsed.description,summary:parsed.description};summary=`Observație: „${parsed.description}”`;
 } else if(parsed.type==='attribute'){
  const matches=db.entities.filter(x=>x.name.toLowerCase()===parsed.entityName.toLowerCase());
  if(matches.length!==1){box.textContent=matches.length?'Există mai multe entități cu acest nume; selectează explicit entitatea.':`Nu găsesc entitatea „${parsed.entityName}”.`;speakWorkFeedback(box.textContent);return}
  const def=db.attributes.find(a=>a.name.toLowerCase()===parsed.attribute.toLowerCase());
  if(!def){box.textContent=`Atributul „${parsed.attribute}” nu este definit. Nu voi modifica schema în tăcere.`;speakWorkFeedback(box.textContent);return}
  let value;try{value=parseTyped(parsed.value,def.type);if(!confirmAttributeWarnings(def,value)){voiceReadbackPending=false;return}}catch(err){box.textContent=err.message;speakWorkFeedback(box.textContent);return}
  operations=[{operation:'attribute.set',target:matches[0].id,data:{name:def.name,value,certainty:'certain',forceHistory:true}}];payload={entityId:matches[0].id,attribute:def.name,value};summary=`${matches[0].name} · ${def.name} = ${JSON.stringify(value)}`;
 } else if(parsed.type==='sale'){
  const populations=db.entities.filter(x=>x.name.toLowerCase()===parsed.populationName.toLowerCase()&&(x.type==='population'||x.type==='group'));
  if(populations.length!==1){box.textContent=populations.length?'Există mai multe populații cu acest nume. Selectează una explicit.':'Nu am găsit o singură populație cu acel nume.';speakWorkFeedback(box.textContent);return}
  const locations=parsed.locationName?db.entities.filter(x=>x.type==='location'&&x.name.toLowerCase()===parsed.locationName.toLowerCase()):[];
  if(parsed.locationName&&locations.length!==1){box.textContent='Nu am găsit o singură locație cu acel nume.';speakWorkFeedback(box.textContent);return}
  const locationId=locations[0]?.id||null;
  operations=[{operation:'stock.change',data:{populationId:populations[0].id,action:'sell',locationId,quantity:parsed.quantity,disposition:'sold'}}];payload={populationId:populations[0].id,quantity:parsed.quantity,locationId};summary=`Vânzare ${parsed.quantity} × ${populations[0].name}${locations[0]?' din '+locations[0].name:''}`;
 }
 const command={contractVersion:'collector.command.v1',turnId:E.uid(),intent:parsed.type,idempotencyKey:commandIntentKey(),source:'text',certainty:'certain',payload,operations};
 try{
  const result=await ensureAICorePort().preview(command);
  if(result.status!=='preview_ok'){box.textContent=result.status==='duplicate'?'Această comandă a fost deja procesată.':'Preview respins: '+(result.errors||[]).join(' ')+(result.errors?.length?'':' ('+result.status+')');speakWorkFeedback(box.textContent);return}
  pendingCoreCommand=command;
  const readbackText=`${summary}. Modificări estimate: ${result.projectionChanges.entities} entități, ${result.projectionChanges.relations} relații, ${result.projectionChanges.stock} modificări de stoc și ${result.projectionChanges.finance} modificări financiare. Nu am salvat nimic. Pentru înregistrare, confirmă pe ecran.`;
  if(voiceReadbackPending)voiceCommandPending=true;
  box.innerHTML=`<b>Preview Core Port</b><p>${esc(summary)}</p><p>Modificări estimate — entități: ${result.projectionChanges.entities}, relații: ${result.projectionChanges.relations}, stoc: ${result.projectionChanges.stock}, financiar: ${result.projectionChanges.finance}.</p><p class="note">Nicio modificare nu a fost salvată încă. Confirmarea de mai jos execută atomic comanda și salvează în localStorage.</p><button class="secondary" id="readbackCoreCommand" type="button">🔊 Redă rezumatul</button> <button class="primary" id="confirmCoreCommand">Confirmă și salvează</button> <button class="secondary" id="cancelCoreCommand">Anulează</button>`;
  document.getElementById('readbackCoreCommand').onclick=()=>speakWorkFeedback(readbackText,true);
  document.getElementById('confirmCoreCommand').onclick=confirmCoreCommand;
  document.getElementById('cancelCoreCommand').onclick=()=>{pendingCoreCommand=null;voiceCommandPending=false;cancelSpeechOutput();box.textContent='Comandă anulată. Nu s-au modificat date.'};
  speakWorkFeedback(readbackText);
 }catch(err){box.textContent='Preview eșuat: '+err.message}
}
async function confirmCoreCommand(){
 const box=document.getElementById('commandResult');if(!pendingCoreCommand)return;
 const command=pendingCoreCommand;pendingCoreCommand=null;
 try{
  const result=await ensureAICorePort().execute(command,{confirmed:true});
  if(result.status==='committed'||result.status==='duplicate'){
   if(result.status==='committed'&&voiceCommandPending)updateVoiceContextFromCommand(command);
   box.innerHTML=`<b class="status-ok">${result.status==='committed'?'Salvat cu succes':'Comandă deja procesată'}</b><p>Event ID: ${esc(result.eventId||'—')}</p>`;
   if(voiceCommandPending)speakWorkFeedback(result.status==='committed'?'Comanda a fost salvată cu succes.':'Comanda fusese deja procesată.',true);
   voiceCommandPending=false;
  } else {box.textContent=`Execuție nefinalizată (${result.status}): ${(result.errors||[]).join(' ')}`;if(voiceCommandPending)speakWorkFeedback(box.textContent,true);voiceCommandPending=false}
 }catch(err){box.textContent='Execuția a eșuat: '+err.message;if(voiceCommandPending)speakWorkFeedback(box.textContent,true);voiceCommandPending=false}
}
document.getElementById('parseCommand').onclick=runCommand;
document.getElementById('clearVoiceContext')?.addEventListener('click',()=>clearVoiceContext('Contextul vocal a fost șters.'));
document.getElementById('checkOfflineSpeech')?.addEventListener('click',async()=>{
 const button=document.getElementById('checkOfflineSpeech'),status=document.getElementById('offlineSpeechStatus');
 if(!button||!status)return;
 const bridge=window.CollectorAndroidSpeech;
 if(!bridge||!bridge.isAvailable()){status.textContent='Verificarea STT on-device este disponibilă numai în aplicația Android Collector.';return}
 button.disabled=true;status.textContent='Verific suportul on-device pentru română…';
 try{
  const result=await bridge.getOfflineSpeechSupport('ro-RO');
  if(result.languageStatus==='installed')status.textContent='Română: model on-device instalat. Dictarea și transcrierea live folosesc SpeechRecognizer local, fără fallback cloud. Acuratețea trebuie validată pe dispozitiv. Niciun audio nu a fost încărcat.';
  else if(result.languageStatus==='downloadable')status.textContent='Română: model suportat on-device, dar neinstalat. Instalează pachetul de limbă în setările serviciului de recunoaștere Android; Collector nu pornește descărcări în fundal și nu folosește cloud.';
  else if(result.status==='permission-required')status.textContent='Permisiunea pentru microfon nu a fost acordată. Apasă din nou și acceptă solicitarea Android pentru a verifica limba; nu am pornit microfonul și nu am capturat audio.';
  else if(result.languageStatus==='pending')status.textContent='Română: descărcarea modelului on-device este în așteptare. Niciun audio nu a fost capturat.';
  else if(result.languageStatus==='unsupported')status.textContent='Serviciul on-device nu raportează suport pentru limba română pe acest dispozitiv.';
  else status.textContent=result.message||'Suportul limbii române nu a putut fi verificat pe această versiune Android.';
 }catch(error){status.textContent='Verificarea STT on-device a eșuat: '+error.message}
 finally{button.disabled=false}
});

let activeRecognition=null;
let voiceSessionRecognition=null;
let voiceSessionActive=false;
let voiceSessionUtterances=[];
let voiceSessionUtteranceIndexes=new Set();
let voiceReadbackPending=false;
let voiceCommandPending=false;
let speechOutputActive=false;
function cancelSpeechOutput(){const synth=window.speechSynthesis;if(synth&&typeof synth.cancel==='function')synth.cancel();speechOutputActive=false}
function speakWorkFeedback(text,force=false){
 if(!force&&!voiceReadbackPending)return false;
 voiceReadbackPending=false;
 if(activeRecognition||voiceSessionActive){setAppStatus('Rezumatul este disponibil pe ecran; microfonul nu a fost eliberat încă.');return false}
 if(typeof audioRecorder!=='undefined'&&audioRecorder&&['starting','recording','paused'].includes(audioRecorder.state)){setAppStatus('Rezumatul este disponibil pe ecran. Citirea vocală a fost omisă cât timp reportofonul înregistrează.');return false}
 const synth=window.speechSynthesis,Utterance=window.SpeechSynthesisUtterance;
 if(!synth||typeof synth.speak!=='function'||typeof Utterance!=='function'){setAppStatus('Citirea vocală nu este disponibilă pe acest dispozitiv. Rezumatul rămâne disponibil pe ecran.');return false}
 try{
  synth.cancel();
  const utterance=new Utterance(String(text||'').slice(0,600));
  utterance.lang='ro-RO';utterance.rate=.95;utterance.pitch=1;
  const voices=typeof synth.getVoices==='function'?synth.getVoices():[];
  const romanian=voices.find(voice=>/^ro(?:-|_)/i.test(voice.lang||''));
  if(romanian)utterance.voice=romanian;
  utterance.onstart=()=>{speechOutputActive=true;setAppStatus('Redau rezumatul vocal. Microfonul rămâne oprit.')};
  utterance.onend=()=>{speechOutputActive=false;setAppStatus('Rezumatul a fost citit. Confirmă pe ecran numai dacă preview-ul este corect.')};
  utterance.onerror=()=>{speechOutputActive=false;setAppStatus('Nu am putut reda rezumatul vocal. Verifică preview-ul afișat pe ecran.')};
  synth.speak(utterance);return true;
 }catch(error){speechOutputActive=false;setAppStatus('Citirea vocală nu a pornit: '+error.message+'. Rezumatul rămâne pe ecran.');return false}
}
function setVoiceUi(listening){const local=document.getElementById('voiceButton');if(local){local.textContent=listening?'■ Oprește dictarea':'🎙 Dictează comandă';local.setAttribute('aria-label',listening?'Oprește dictarea':'Începe dictarea');local.setAttribute('aria-pressed',String(listening))}}
function setVoiceSessionUi(listening){const session=document.getElementById('voiceSessionButton');if(session){session.textContent=listening?'■ Oprește transcrierea':'🎙 Transcriere live';session.setAttribute('aria-label',listening?'Oprește transcrierea live':'Începe transcrierea live');session.setAttribute('aria-pressed',String(listening))}}

let nativeSpeechMode=null,nativeSpeechSessionId=null,nativeSpeechListenerHandles=[];
let nativeSpeechSegments=[],nativeTranscriptSession=null,nativeSpeechStopRequested=false;
let nativeDictationText='';
async function removeNativeSpeechListeners(){
 const handles=nativeSpeechListenerHandles.splice(0);
 await Promise.all(handles.map(async handle=>{try{await handle?.remove?.()}catch(error){console.warn('Nu am putut elimina listenerul STT:',error)}}));
}
function nativeSpeechText(){
 return nativeSpeechSegments.map(segment=>segment.text).filter(Boolean).join(nativeSpeechMode==='session'?'\\n':' ');
}
function ensureNativeTranscriptSession(sessionId){
 if(!nativeTranscriptSession&&sessionId){
  nativeTranscriptSession={id:sessionId,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),language:'ro-RO',provider:'android-speech-recognizer-on-device',source:'microphone',audioRecordingId:null,audioLinkStatus:'not-linked',segments:[]};
 }
 return nativeTranscriptSession;
}
async function persistNativeTranscriptSession(){
 if(!nativeTranscriptSession||!window.CollectorAudioStore?.saveTranscriptSession)return;
 nativeTranscriptSession.segments=nativeSpeechSegments.map(segment=>({...segment}));
 nativeTranscriptSession.updatedAt=new Date().toISOString();
 try{await window.CollectorAudioStore.saveTranscriptSession(nativeTranscriptSession);await renderVoiceTranscriptHistory()}
 catch(error){setAppStatus('Transcrierea rămâne pe ecran, dar nu am putut salva copia locală: '+error.message)}
}
function renderNativeTranscriptInput(partial=''){
 const finalText=nativeSpeechMode==='dictation'?nativeSpeechSegments.map(x=>x.text).join(' '):nativeSpeechSegments.map(x=>x.text).join('\\n');
 const input=document.getElementById('commandInput');
 if(input)input.value=finalText+(partial?(finalText?(nativeSpeechMode==='dictation'?' ':'\\n'):'')+partial:'');
}
async function finishNativeSpeech(event){
 const mode=nativeSpeechMode,shouldProcess=nativeSpeechStopRequested;
 const utterances=nativeSpeechSegments.map(segment=>segment.text).filter(Boolean);
 await persistNativeTranscriptSession();
 nativeSpeechMode=null;nativeSpeechSessionId=null;nativeSpeechStopRequested=false;
 voiceSessionActive=false;voiceSessionRecognition=null;activeRecognition=null;
 setVoiceSessionUi(false);setVoiceUi(false);
 await removeNativeSpeechListeners();
 if(event.status==='cancelled')return;
 if(mode==='session'){
  if(utterances.length){
   document.getElementById('commandInput').value=utterances.join('\\n');
   if(event.status==='stopped'&&shouldProcess){
    setAppStatus('Transcrierea s-a încheiat. Pregătesc preview-ul comun pentru '+utterances.length+' fraze.');
    runVoiceBatch(utterances);
   }else{
    setAppStatus('Textul recunoscut a fost păstrat local. Nu s-a creat niciun preview și nu s-au modificat datele.');
   }
  }else setAppStatus('Sesiunea on-device s-a încheiat fără fraze finale. Nu s-au modificat datele.');
 }else if(mode==='dictation'){
  if(utterances.length){
   document.getElementById('commandInput').value=utterances.join(' ');
   voiceReadbackPending=true;
   setAppStatus('Dictare română on-device încheiată. Verifică preview-ul înainte de confirmare.');
   runCommand();
  }else{
   voiceReadbackPending=false;
   setAppStatus('Nu a fost recunoscut text. Nu s-au modificat datele.');
  }
 }
}
async function startNativeSpeech(mode){
 const bridge=window.CollectorAndroidSpeech;
 if(!bridge?.isAvailable?.())return false;
 if(nativeSpeechMode)return false;
 nativeSpeechMode=mode;nativeSpeechSessionId=null;nativeSpeechSegments=[];
 nativeTranscriptSession=null;nativeSpeechStopRequested=false;nativeDictationText='';
 voiceSessionUtterances=[];voiceSessionUtteranceIndexes=new Set();
 pendingCoreCommand=null;voiceCommandPending=false;voiceReadbackPending=false;
 cancelSpeechOutput();
 if(mode==='session'){voiceSessionActive=true;setVoiceSessionUi(true);setAppStatus('Solicit recunoaștere vocală locală în română…')}
 else{activeRecognition={native:true};setVoiceUi(true);setAppStatus('Solicit recunoaștere vocală locală în română…')}
 try{
  const handlers={
   speechSegment:event=>{
    if(nativeSpeechSessionId&&event.sessionId!==nativeSpeechSessionId)return;
    if(!nativeSpeechSessionId)nativeSpeechSessionId=event.sessionId;
    ensureNativeTranscriptSession(event.sessionId);
    if(nativeSpeechSegments.some(segment=>segment.id===event.segmentId))return;
    const segment={id:String(event.segmentId||crypto.randomUUID()),text:String(event.text||'').trim(),
     startOffsetMs:Number(event.startOffsetMs),endOffsetMs:Number(event.endOffsetMs),
     startedAt:Number(event.startedAt),endedAt:Number(event.endedAt),
     confidence:Number(event.confidence),language:event.language||'ro-RO',provider:event.provider||'android-speech-recognizer-on-device'};
    if(!segment.text||!Number.isFinite(segment.startOffsetMs)||!Number.isFinite(segment.endOffsetMs)||
       segment.startOffsetMs<0||segment.endOffsetMs<segment.startOffsetMs)return;
    nativeSpeechSegments.push(segment);
    if(nativeSpeechMode==='session')voiceSessionUtterances.push(segment.text);
    renderNativeTranscriptInput();
    persistNativeTranscriptSession();
    setAppStatus('STT on-device: '+nativeSpeechSegments.length+' segmente finale. Transcriptul este salvat local; audio nu a fost încărcat.');
   },
   speechPartial:event=>{
    if(nativeSpeechSessionId&&event.sessionId!==nativeSpeechSessionId)return;
    const partial=String(event.text||'').trim();
    if(partial)renderNativeTranscriptInput(partial);
   },
   speechState:event=>{
    if(nativeSpeechSessionId&&event.sessionId!==nativeSpeechSessionId)return;
    if(event.status==='listening'){
     if(nativeSpeechMode==='session')setAppStatus('Transcriere on-device activă în română. Fiecare frază finală este salvată local cu timestamp.');
     else setAppStatus('Dictare on-device activă în română. Microfonul rămâne exclusiv pentru STT.');
     return;
    }
    if(['stopped','error','cancelled'].includes(event.status))finishNativeSpeech(event);
   },
   speechError:event=>{
    const message=event.message||'Eroare la recunoașterea vocală on-device.';
    setAppStatus(message);
    const box=document.getElementById('commandResult');if(box)box.textContent=message;
   }
  };
  nativeSpeechListenerHandles=await Promise.all(Object.entries(handlers).map(([name,handler])=>bridge.addListener(name,handler)));
  const started=await bridge.startListening('ro-RO',mode==='session');
  if(nativeSpeechMode!==mode)return true;
  nativeSpeechSessionId=started.sessionId;
  ensureNativeTranscriptSession(started.sessionId);
  if(mode==='session')voiceSessionRecognition={native:true,stop:()=>bridge.stopListening(nativeSpeechSessionId)};
  else activeRecognition={native:true,stop:()=>bridge.stopListening(nativeSpeechSessionId)};
  setAppStatus(mode==='session'?'Transcriere live Android on-device activă. Apasă din nou pentru oprire și preview.':'Dictare Android on-device activă. Vorbește în română.');
  return true;
 }catch(error){
  const failedMode=nativeSpeechMode;nativeSpeechMode=null;nativeSpeechSessionId=null;
  voiceSessionActive=false;voiceSessionRecognition=null;activeRecognition=null;
  setVoiceSessionUi(false);setVoiceUi(false);await removeNativeSpeechListeners();
  const message='STT on-device nu a putut porni: '+error.message+'. Nu am folosit un serviciu cloud.';
  setAppStatus(message);const box=document.getElementById('commandResult');if(box)box.textContent=message;
  return false;
 }
}
async function stopNativeSpeech(){
 if(!nativeSpeechSessionId)return;
 nativeSpeechStopRequested=true;
 setAppStatus('Oprire transcriere on-device. Aștept ultimul segment final…');
 try{await window.CollectorAndroidSpeech.stopListening(nativeSpeechSessionId)}
 catch(error){setAppStatus('Nu am putut opri elegant transcrierea: '+error.message)}
}
function stopVoiceSession(){if(!voiceSessionActive)return;if(nativeSpeechMode==='session'){stopNativeSpeech();return}voiceSessionActive=false;setVoiceSessionUi(false);setAppStatus('Oprire sesiune. Pregătesc preview-ul comun al lotului; nimic nu este salvat automat.');try{voiceSessionRecognition?.stop()}catch(error){setAppStatus('Sesiunea s-a oprit: '+error.message)}}
function startVoiceSession(){
 if(voiceSessionActive){stopVoiceSession();return}
 if(activeRecognition){activeRecognition.stop?.();return}
 if(nativeAudioAvailable()&&!nativeAudioStateReady){
  const message='Verific starea reportofonului Android. Transcrierea nu va porni până când starea microfonului nu este confirmată; încearcă din nou în câteva secunde.';
  setAppStatus(message);document.getElementById('commandResult').textContent=message;
  refreshNativeAudioState().catch(error=>setAppStatus('Nu pot confirma starea reportofonului Android: '+error.message));return;
 }
 if(isAudioRecorderBusy()){
  const message='Reportofonul folosește microfonul. Oprește înregistrarea înainte de transcriere.';
  setAppStatus(message);document.getElementById('commandResult').textContent=message;return;
 }
 cancelSpeechOutput();voiceCommandPending=false;voiceReadbackPending=false;
 if(window.CollectorAndroidSpeech?.isAvailable?.()){startNativeSpeech('session');return}
 const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!SR){
  const message='Sesiunea vocală nu este disponibilă în acest browser. Poți introduce observația în câmpul text.';
  setAppStatus(message);document.getElementById('commandResult').textContent=message;document.getElementById('commandInput').focus();return;
 }
 voiceSessionUtterances=[];voiceSessionUtteranceIndexes=new Set();pendingCoreCommand=null;
 const rec=new SR();voiceSessionRecognition=rec;voiceSessionActive=true;rec.lang='ro-RO';rec.interimResults=true;rec.maxAlternatives=1;rec.continuous=true;
 rec.onstart=()=>{setVoiceSessionUi(true);setAppStatus('Sesiune vocală activă. Fiecare frază finală este păstrată separat. Oprește sesiunea pentru un preview comun; nimic nu se salvează automat.')};
 rec.onresult=e=>{
  let interim='';
  for(let i=e.resultIndex||0;i<(e.results||[]).length;i++){
   const result=e.results[i],phrase=String(result[0]?.transcript||'').trim();if(!phrase)continue;
   if(result.isFinal){if(!voiceSessionUtteranceIndexes.has(i)){voiceSessionUtteranceIndexes.add(i);voiceSessionUtterances.push(phrase)}}
   else interim+=(interim?' ':'')+phrase;
  }
  const preview=voiceSessionUtterances.join(' · ')+(interim?(voiceSessionUtterances.length?' · ':'')+interim:'');
  document.getElementById('commandInput').value=preview;
  setAppStatus('Sesiune vocală: '+(voiceSessionUtterances.length?voiceSessionUtterances.length+' fraze finale capturate.':'ascult.'));
 };
 rec.onerror=e=>{voiceSessionActive=false;setVoiceSessionUi(false);const message='Sesiunea vocală s-a întrerupt: '+e.error+'. Frazele finale capturate rămân disponibile pentru verificare.';setAppStatus(message)};
 rec.onend=()=>{
  const utterances=voiceSessionUtterances.slice();voiceSessionActive=false;voiceSessionRecognition=null;setVoiceSessionUi(false);
  if(utterances.length){document.getElementById('commandInput').value=utterances.join('\\n');setAppStatus('Sesiunea s-a încheiat. Pregătesc preview-ul comun pentru '+utterances.length+' fraze.');runVoiceBatch(utterances)}
  else{voiceReadbackPending=false;setAppStatus('Sesiunea vocală s-a încheiat fără fraze finale recunoscute. Nu s-au modificat date.')}
 };
 try{rec.start()}catch(error){voiceSessionActive=false;voiceSessionRecognition=null;setVoiceSessionUi(false);setAppStatus('Nu am putut porni sesiunea vocală: '+error.message)}
}
function startVoiceCapture(){
 if(activeRecognition){activeRecognition.stop?.();return}
 if(voiceSessionActive){stopVoiceSession();return}
 if(nativeAudioAvailable()&&!nativeAudioStateReady){
  const message='Verific starea reportofonului Android. Dictarea nu va porni până când starea microfonului nu este confirmată; încearcă din nou în câteva secunde.';
  setAppStatus(message);document.getElementById('commandResult').textContent=message;
  refreshNativeAudioState().catch(error=>setAppStatus('Nu pot confirma starea reportofonului Android: '+error.message));return;
 }
 if(isAudioRecorderBusy()){
  const message='Reportofonul folosește microfonul. Oprește înregistrarea înainte de dictare.';
  setAppStatus(message);document.getElementById('commandResult').textContent=message;return;
 }
 cancelSpeechOutput();voiceCommandPending=false;voiceReadbackPending=false;
 if(window.CollectorAndroidSpeech?.isAvailable?.()){startNativeSpeech('dictation');return}
 const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!SR){
  const message='Dictarea vocală nu este disponibilă în acest browser. Poți scrie comanda sau folosi dictarea sistemului de operare.';
  setAppStatus(message);document.getElementById('commandResult').textContent=message;document.getElementById('commandInput').focus();return;
 }
 const rec=new SR();activeRecognition=rec;rec.lang='ro-RO';rec.interimResults=false;rec.maxAlternatives=1;rec.continuous=false;
 rec.onstart=()=>{setVoiceUi(true);setAppStatus('Ascult o comandă. Nu se salvează nimic fără confirmarea Core.')};
 let oneShotTranscript='';
 rec.onresult=e=>{oneShotTranscript=Array.from(e.results||[]).map(result=>result[0]?.transcript||'').join(' ').trim();if(!oneShotTranscript)return;voiceReadbackPending=true;document.getElementById('commandInput').value=oneShotTranscript;setAppStatus('Am recepționat dictarea. Aștept eliberarea microfonului înainte de preview și citirea rezumatului.')};
 rec.onerror=e=>{activeRecognition=null;voiceReadbackPending=false;setVoiceUi(false);const message='Dictarea nu a reușit: '+e.error+'. Poți încerca din nou sau poți introduce textul.';setAppStatus(message);document.getElementById('commandResult').textContent=message};
 rec.onend=()=>{activeRecognition=null;setVoiceUi(false);if(oneShotTranscript){setAppStatus('Dictarea s-a încheiat. Verifică preview-ul înainte de salvare.');runCommand()}else setAppStatus('Dictarea s-a încheiat fără text recunoscut. Nu s-au modificat datele.')};
 try{rec.start()}catch(error){activeRecognition=null;setVoiceUi(false);setAppStatus('Nu am putut porni microfonul: '+error.message)}
}
document.getElementById('voiceButton').onclick=startVoiceCapture;
document.getElementById('voiceSessionButton').onclick=startVoiceSession;
let audioRecorder=null,audioStream=null,audioStartPending=false,audioChunks=[],audioStartedAt=0,audioPausedMs=0,audioPauseStartedAt=0,audioTimer=null,audioObjectUrl=null;
let nativeAudioState=null,nativeAudioStateReady=false;
function nativeAudioAvailable(){return !!window.CollectorAndroidRecorder?.isAvailable?.()}
async function refreshNativeAudioState(){if(!nativeAudioAvailable())return null;nativeAudioStateReady=false;const state=await window.CollectorAndroidRecorder.getRecordingState();const validStatuses=['inactive','complete','interrupted','starting','recording','paused'];if(!state||!validStatuses.includes(state.status))throw new Error('Serviciul Android nu a returnat o stare validă a reportofonului.');nativeAudioState=state;nativeAudioStateReady=true;if(['starting','recording','paused'].includes(nativeAudioState.status)){audioRecorder={native:true,state:nativeAudioState.status,id:nativeAudioState.id}}else if(audioRecorder?.native)audioRecorder=null;updateAudioTimer();return nativeAudioState}
async function waitForNativeAudioState(expected,timeoutMs=8000){const deadline=Date.now()+timeoutMs;let state=null;while(Date.now()<deadline){state=await refreshNativeAudioState();if(state&&expected.includes(state.status))return state;if(state&&['interrupted','error'].includes(state.status))throw new Error(state.error||'Înregistrarea nativă a fost întreruptă.');await new Promise(resolve=>setTimeout(resolve,200))}return state}
function startNativeAudioPolling(){clearInterval(audioTimer);audioTimer=setInterval(async()=>{try{const state=await refreshNativeAudioState();if(state&&!['starting','recording','paused'].includes(state.status)){clearInterval(audioTimer);audioTimer=null;const message=state.status==='complete'?'Înregistrare salvată în stocarea privată Android.':state.status==='interrupted'?'Înregistrare întreruptă. Fișierul parțial a fost păstrat pentru recuperare.':'Reportofon pregătit.';setAudioUi('idle',message);await renderAudioRecordings()}}catch(error){console.warn('Nu pot actualiza starea reportofonului Android:',error)}},250)}
async function initializeNativeAudioRecorder(){if(!nativeAudioAvailable())return;try{const state=await refreshNativeAudioState();if(state&&['starting','recording','paused'].includes(state.status)){setAudioUi(state.status,'Înregistrarea nativă este activă. Serviciul Android raportează o înregistrare activă; validarea cu ecranul stins rămâne necesară.');startNativeAudioPolling()}else if(state?.status==='interrupted'){setAudioUi('idle',state.recoverable?'Am recuperat o înregistrare întreruptă. Fișierul AAC parțial poate fi redat.':'Am găsit o înregistrare întreruptă, dar formatul nu garantează recuperarea fișierului.')}}catch(error){setAudioUi('idle','Nu pot verifica starea reportofonului Android: '+error.message)}}
async function startNativeAudioRecording(){cancelSpeechOutput();try{audioStartPending=true;setAudioUi('starting','Solicit permisiunile Android și pornesc serviciul de înregistrare…');const result=await window.CollectorAndroidRecorder.startRecording({bitRate:128000,sampleRate:44100});audioRecorder={native:true,state:'starting',id:result.recordingId};audioStartPending=false;const state=await waitForNativeAudioState(['recording']);if(!state||state.status!=='recording')throw new Error(state?.error||'Serviciul Android nu a confirmat pornirea microfonului.');setAudioUi('recording','Înregistrare nativă activă. Serviciul Android rulează cu notificare persistentă; verificarea pe dispozitiv este încă necesară.');startNativeAudioPolling();await renderAudioRecordings()}catch(error){audioStartPending=false;let state=null;try{state=await refreshNativeAudioState()}catch(refreshError){}if(state&&['starting','recording','paused'].includes(state.status)){setAudioUi(state.status,'Serviciul Android pare activ, dar confirmarea pornirii a întârziat. Starea va fi verificată în continuare.');startNativeAudioPolling()}else{audioRecorder=null;clearInterval(audioTimer);audioTimer=null;setAudioUi('idle','Nu am putut porni reportofonul Android: '+error.message)}}}
async function pauseNativeAudioRecording(){try{const id=audioRecorder.id;setAudioUi('saving','Pun în pauză înregistrarea…');await window.CollectorAndroidRecorder.pauseRecording(id);const state=await waitForNativeAudioState(['paused']);if(!state||state.status!=='paused')throw new Error(state?.error||'Serviciul nu a confirmat pauza.');audioRecorder={native:true,state:'paused',id};setAudioUi('paused','Înregistrare pusă pe pauză. Serviciul Android rămâne disponibil pentru reluare.')}catch(error){setAudioUi('recording','Nu am putut pune în pauză: '+error.message)}}
async function resumeNativeAudioRecording(){try{const id=audioRecorder.id;setAudioUi('starting','Reiau înregistrarea…');await window.CollectorAndroidRecorder.resumeRecording(id);const state=await waitForNativeAudioState(['recording']);if(!state||state.status!=='recording')throw new Error(state?.error||'Serviciul nu a confirmat reluarea.');audioRecorder={native:true,state:'recording',id};setAudioUi('recording','Înregistrare reluată prin serviciul Android.')}catch(error){setAudioUi('paused','Nu am putut relua înregistrarea: '+error.message)}}
async function stopNativeAudioRecording(){if(!audioRecorder?.native)return;const id=audioRecorder.id;setAudioUi('saving','Oprire și finalizare fișier audio…');try{await window.CollectorAndroidRecorder.stopRecording(id);const state=await waitForNativeAudioState(['complete','interrupted','inactive'],10000);clearInterval(audioTimer);audioTimer=null;audioRecorder=null;if(state?.status==='complete'){setAudioUi('idle','Înregistrare salvată local pe Android. '+formatAudioDuration(state.durationMs||0)+' · '+Math.round((state.sizeBytes||0)/1024)+' KB.');}else if(state?.status==='interrupted'){setAudioUi('idle','Înregistrare întreruptă. Fișierul parțial a fost păstrat. '+(state.error||''));}else{setAudioUi('idle','Înregistrarea a fost oprită.');}await renderAudioRecordings()}catch(error){const state=await refreshNativeAudioState().catch(()=>null);if(state&&['starting','recording','paused'].includes(state.status)){setAudioUi(state.status,'Serviciul Android încă raportează o înregistrare activă. Poți încerca din nou oprirea.');startNativeAudioPolling()}else{clearInterval(audioTimer);audioTimer=null;audioRecorder=null;setAudioUi('idle','Nu am putut finaliza înregistrarea Android: '+error.message)}}}
let audioWakeLock=null;
async function acquireAudioWakeLock(){if(!('wakeLock'in navigator)||document.visibilityState!=='visible')return false;if(audioWakeLock&&!audioWakeLock.released)return true;try{const lock=await navigator.wakeLock.request('screen');audioWakeLock=lock;lock.addEventListener('release',()=>{if(audioWakeLock===lock)audioWakeLock=null});return true}catch(error){audioWakeLock=null;return false}}
async function releaseAudioWakeLock(){const lock=audioWakeLock;audioWakeLock=null;if(lock&&!lock.released){try{await lock.release()}catch(error){console.warn('Nu am putut elibera Screen Wake Lock:',error)}}}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&audioRecorder?.state==='recording'&&!audioRecorder?.native)acquireAudioWakeLock()});
function formatAudioDuration(ms){const total=Math.max(0,Math.floor(ms/1000));return String(Math.floor(total/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0')}
function audioElapsed(){if(audioRecorder?.native)return Math.max(0,Number(nativeAudioState?.durationMs||0));if(audioPauseStartedAt)return audioPausedMs;if(audioRecorder?.state==='recording')return Math.max(0,Date.now()-audioStartedAt-audioPausedMs);return audioPausedMs}
function setAudioUi(state,message){const start=document.getElementById('audioRecordStart'),pause=document.getElementById('audioRecordPause'),resume=document.getElementById('audioRecordResume'),stop=document.getElementById('audioRecordStop'),global=document.getElementById('globalVoice'),status=document.getElementById('audioRecorderStatus');if(start)start.disabled=state!=='idle';if(pause)pause.disabled=state!=='recording';if(resume)resume.disabled=state!=='paused';if(stop)stop.disabled=!['recording','paused'].includes(state);if(global){const active=['recording','paused'].includes(state);global.disabled=['starting','saving'].includes(state);global.textContent=active?'■ Oprește înregistrarea':'🎙 Înregistrează';global.setAttribute('aria-label',active?'Oprește înregistrarea audio':'Începe înregistrarea audio');global.setAttribute('aria-pressed',String(active));global.classList.toggle('is-listening',state==='recording')}if(status&&message)status.textContent=message;const workState=document.getElementById('workRecorderState');if(workState){workState.textContent=state==='recording'?'● Înregistrează':state==='paused'?'Ⅱ În pauză':state==='saving'?'Salvează…':state==='starting'?'Pornește…':'● Pregătit';workState.classList.toggle('is-listening',state==='recording')}}
function updateAudioTimer(){const timer=document.getElementById('audioRecorderTimer');if(timer)timer.textContent=formatAudioDuration(audioElapsed())}
function stopAudioTracks(){if(audioStream){for(const track of audioStream.getTracks())track.stop();audioStream=null}}
function isAudioRecorderBusy(){return !!audioStartPending||!!(audioRecorder&&['starting','recording','paused','saving'].includes(audioRecorder.state))||(nativeAudioAvailable()&&(!nativeAudioStateReady||!!(nativeAudioState&&['starting','recording','paused'].includes(nativeAudioState.status))))}
async function startAudioRecording(){if(activeRecognition||voiceSessionActive){const message='Dictarea sau transcrierea vocală folosește microfonul. Oprește sesiunea vocală înainte de a porni reportofonul.';setAudioUi('idle',message);return}if(nativeAudioAvailable()&&!nativeAudioStateReady){const message='Verific starea reportofonului Android. Reportofonul nu va porni până când starea microfonului nu este confirmată; încearcă din nou în câteva secunde.';setAudioUi('idle',message);refreshNativeAudioState().catch(error=>setAudioUi('idle','Nu pot confirma starea reportofonului Android: '+error.message));return}if(audioStartPending||audioRecorder&&['recording','paused','starting'].includes(audioRecorder.state))return;cancelSpeechOutput();if(nativeAudioAvailable()){await startNativeAudioRecording();return}if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){setAudioUi('idle','Înregistrarea audio nu este disponibilă în acest browser. Încearcă un browser cu MediaRecorder și permisiune pentru microfon.');return}if(!window.CollectorAudioStore){setAudioUi('idle','Stocarea audio locală nu este disponibilă. Nicio înregistrare nu a fost pornită.');return}try{audioStartPending=true;setAudioUi('starting','Solicit accesul la microfon…');audioStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});const mimeCandidates=['audio/webm;codecs=opus','audio/webm','audio/mp4'];const mimeType=mimeCandidates.find(type=>MediaRecorder.isTypeSupported?.(type));audioRecorder=new MediaRecorder(audioStream,mimeType?{mimeType}:undefined);audioStartPending=false;audioChunks=[];audioStartedAt=Date.now();audioPausedMs=0;audioPauseStartedAt=0;audioRecorder.ondataavailable=event=>{if(event.data&&event.data.size>0)audioChunks.push(event.data)};audioRecorder.onerror=event=>{releaseAudioWakeLock();stopAudioTracks();clearInterval(audioTimer);audioTimer=null;audioRecorder=null;setAudioUi('idle','Eroare la înregistrarea audio: '+(event.error?.message||'eroare necunoscută'))};audioRecorder.onstop=async()=>{clearInterval(audioTimer);audioTimer=null;releaseAudioWakeLock();stopAudioTracks();if(audioPauseStartedAt){audioPausedMs+=Date.now()-audioPauseStartedAt;audioPauseStartedAt=0}const durationMs=Math.max(0,Date.now()-audioStartedAt-audioPausedMs),type=audioRecorder?.mimeType||audioChunks[0]?.type||'audio/webm',blob=new Blob(audioChunks,{type});audioRecorder=null;if(!blob.size){setAudioUi('idle','Înregistrarea s-a încheiat, dar browserul nu a furnizat date audio.');return}try{const record={id:'audio-'+(crypto.randomUUID?.()||Date.now()+'-'+Math.random().toString(16).slice(2)),createdAt:new Date().toISOString(),durationMs,mimeType:type,size:blob.size,blob};await CollectorAudioStore.save(record);if(audioObjectUrl)URL.revokeObjectURL(audioObjectUrl);audioObjectUrl=URL.createObjectURL(blob);const player=document.getElementById('audioPlayback');player.src=audioObjectUrl;player.hidden=false;setAudioUi('idle','Înregistrare salvată local. '+formatAudioDuration(durationMs)+' · '+Math.round(blob.size/1024)+' KB. Nu a fost adăugat niciun eveniment în jurnal.');await renderAudioRecordings()}catch(error){setAudioUi('idle','Nu am putut salva înregistrarea locală: '+error.message)}};audioRecorder.start(1000);const wakeLockAcquired=await acquireAudioWakeLock();setAudioUi('recording','Înregistrare audio activă. '+(wakeLockAcquired?'Ecranul este menținut activ. ':'Blocarea stingerii ecranului nu este disponibilă; păstrează aplicația în prim-plan. ')+'Microfonul este pornit; apasă pauză sau oprește când ai terminat.');audioTimer=setInterval(updateAudioTimer,250);updateAudioTimer()}catch(error){audioStartPending=false;stopAudioTracks();audioRecorder=null;setAudioUi('idle',error.name==='NotAllowedError'?'Accesul la microfon a fost refuzat. Permite accesul din setările browserului.':'Nu am putut porni înregistrarea: '+error.message)}}
function pauseAudioRecording(){if(audioRecorder?.native){pauseNativeAudioRecording();return}if(audioRecorder?.state!=='recording')return;try{audioRecorder.pause();audioPauseStartedAt=Date.now();releaseAudioWakeLock();setAudioUi('paused','Înregistrare pusă pe pauză. Ecranul poate reveni la stingerea automată. Apasă reia sau oprește.')}catch(error){setAudioUi('recording','Nu am putut pune în pauză: '+error.message)}}
async function resumeAudioRecording(){if(audioRecorder?.native){await resumeNativeAudioRecording();return}if(audioRecorder?.state!=='paused')return;try{audioRecorder.resume();if(audioPauseStartedAt){audioPausedMs+=Date.now()-audioPauseStartedAt;audioPauseStartedAt=0}const wakeLockAcquired=await acquireAudioWakeLock();setAudioUi('recording','Înregistrare reluată. '+(wakeLockAcquired?'Ecranul este menținut activ. ':'Blocarea stingerii ecranului nu este disponibilă. ')+'Microfonul este activ.')}catch(error){setAudioUi('paused','Nu am putut relua înregistrarea: '+error.message)}}
function stopAudioRecording(){if(audioRecorder?.native){stopNativeAudioRecording();return}if(!audioRecorder||!['recording','paused'].includes(audioRecorder.state))return;setAudioUi('saving','Oprire și salvare locală…');releaseAudioWakeLock();try{audioRecorder.stop()}catch(error){stopAudioTracks();audioRecorder=null;setAudioUi('idle','Nu am putut opri înregistrarea: '+error.message)}}
async function playAudioRecording(recordId){try{const player=document.getElementById('audioPlayback');if(nativeAudioAvailable()){const record=await window.CollectorAndroidRecorder.getRecording(recordId);if(!record?.uri)throw Error('Fișierul audio nativ nu mai există.');if(audioObjectUrl){URL.revokeObjectURL(audioObjectUrl);audioObjectUrl=null}player.src=window.CollectorAndroidRecorder.toPlaybackUrl(record.uri);player.hidden=false;await player.play();return}const record=await CollectorAudioStore.get(recordId);if(!record?.blob)throw Error('Fișierul audio nu mai există.');if(audioObjectUrl)URL.revokeObjectURL(audioObjectUrl);audioObjectUrl=URL.createObjectURL(record.blob);player.src=audioObjectUrl;player.hidden=false;await player.play()}catch(error){setAudioUi('idle','Nu pot reda înregistrarea: '+error.message)}}
async function deleteAudioRecording(recordId){if(!confirm('Ștergi definitiv această înregistrare audio locală?'))return;try{if(nativeAudioAvailable())await window.CollectorAndroidRecorder.deleteRecording(recordId);else await CollectorAudioStore.remove(recordId);await renderAudioRecordings();setAudioUi('idle','Înregistrarea audio a fost ștearsă din stocarea locală.')}catch(error){setAudioUi('idle','Nu am putut șterge înregistrarea: '+error.message)}}
async function renderAudioRecordings(){const list=document.getElementById('audioRecordingList');if(!list||(!nativeAudioAvailable()&&!window.CollectorAudioStore))return;try{const records=nativeAudioAvailable()?(await window.CollectorAndroidRecorder.listRecordings()).recordings:await CollectorAudioStore.list();list.replaceChildren();if(!records.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='Nu există înregistrări audio locale.';list.append(empty);return}for(const record of records){const row=document.createElement('div');row.className='audio-recording-row';const info=document.createElement('div'),name=document.createElement('b'),meta=document.createElement('small');name.textContent=new Date(record.createdAt).toLocaleString('ro-RO');meta.textContent=formatAudioDuration(record.durationMs)+' · '+Math.round((record.sizeBytes??record.size??0)/1024)+' KB'+(record.status==='interrupted'?' · Întreruptă':'');info.append(name,meta);const actions=document.createElement('div');actions.className='row-actions';const play=document.createElement('button');play.className='secondary';play.type='button';play.textContent='Redă';if(nativeAudioAvailable()&&(['starting','recording','paused'].includes(record.status)||(record.status==='interrupted'&&!record.recoverable))){play.disabled=true;play.title=record.status==='interrupted'?'Fișierul întrerupt nu este garantat redabil.':'Înregistrarea este încă activă.'}play.setAttribute('aria-label','Redă înregistrarea din '+name.textContent);play.addEventListener('click',()=>playAudioRecording(record.id));const remove=document.createElement('button');remove.className='secondary';remove.type='button';remove.textContent='Șterge';remove.setAttribute('aria-label','Șterge înregistrarea din '+name.textContent);remove.addEventListener('click',()=>deleteAudioRecording(record.id));if(nativeAudioAvailable()&&['starting','recording','paused'].includes(record.status))remove.disabled=true;actions.append(play,remove);row.append(info,actions);list.append(row)}}catch(error){list.textContent='Nu pot citi înregistrările locale: '+error.message}}
async function renderVoiceTranscriptHistory(){
 const list=document.getElementById('voiceTranscriptHistory');if(!list)return;
 if(!window.CollectorAudioStore?.listTranscriptSessions){list.textContent='Stocarea locală a transcrierilor nu este disponibilă.';return}
 try{
  const sessions=(await window.CollectorAudioStore.listTranscriptSessions()).slice(0,10);
  list.replaceChildren();
  if(!sessions.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='Nu există transcrieri salvate.';list.append(empty);return}
  for(const session of sessions){
   const row=document.createElement('div');row.className='audio-recording-row';
   const info=document.createElement('div'),title=document.createElement('b'),summary=document.createElement('small');
   title.textContent='Transcriere · '+new Date(session.createdAt).toLocaleString('ro-RO');
   const text=session.segments.map(segment=>segment.text).join(' ');
   summary.textContent=session.segments.length+' segmente · '+text.slice(0,150)+(text.length>150?'…':'');
   info.append(title,summary);
   const actions=document.createElement('div');actions.className='audio-recording-actions';
   const load=document.createElement('button');load.className='secondary';load.type='button';load.textContent='Reîncarcă text';
   load.addEventListener('click',()=>{document.getElementById('commandInput').value=session.segments.map(segment=>segment.text).join('\\n');setAppStatus('Transcrierea locală a fost reîncărcată. Verifică textul înainte de interpretare.')});
   const remove=document.createElement('button');remove.className='secondary';remove.type='button';remove.textContent='Șterge';
   remove.addEventListener('click',async()=>{try{await window.CollectorAudioStore.removeTranscriptSession(session.id);await renderVoiceTranscriptHistory()}catch(error){setAppStatus('Nu am putut șterge transcrierea: '+error.message)}});
   actions.append(load,remove);row.append(info,actions);list.append(row);
  }
 }catch(error){list.textContent='Nu pot citi transcrierile locale: '+error.message}
}
document.getElementById('audioRecordStart').addEventListener('click',startAudioRecording);
document.getElementById('audioRecordPause').addEventListener('click',pauseAudioRecording);
document.getElementById('audioRecordResume').addEventListener('click',resumeAudioRecording);
document.getElementById('audioRecordStop').addEventListener('click',stopAudioRecording);
renderAudioRecordings();
renderVoiceTranscriptHistory();
initializeNativeAudioRecorder();

async function renderWorkAlarms(){
 const list=document.getElementById('workAlarmList');if(!list)return;
 if(!window.CollectorAndroidRecorder?.isAvailable?.()){list.textContent='Programarea alarmelor este disponibilă în aplicația Android.';return}
 try{const rows=(await window.CollectorAndroidRecorder.listAlarms()).alarms||[];list.replaceChildren();if(!rows.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='Nu ai alarme programate.';list.append(empty);return}
 for(const alarm of rows){const row=document.createElement('div');row.className='alarm-row';const info=document.createElement('div'),title=document.createElement('b'),when=document.createElement('small');title.textContent=alarm.title;when.textContent=new Date(alarm.triggerAtMs).toLocaleString('ro-RO');info.append(title,when);const cancel=document.createElement('button');cancel.className='secondary';cancel.type='button';cancel.textContent='Anulează';cancel.addEventListener('click',async()=>{try{await window.CollectorAndroidRecorder.cancelAlarm(alarm.id);await renderWorkAlarms();document.getElementById('workAlarmStatus').textContent='Alarma a fost anulată.'}catch(error){document.getElementById('workAlarmStatus').textContent='Eroare: '+error.message}});row.append(info,cancel);list.append(row)}
 }catch(error){list.textContent='Nu pot încărca alarmele: '+error.message}
}
async function addWorkAlarm(){
 const title=document.getElementById('workAlarmTitle'),when=document.getElementById('workAlarmWhen'),status=document.getElementById('workAlarmStatus');
 if(!window.CollectorAndroidRecorder?.isAvailable?.()){status.textContent='Alarmele locale necesită aplicația Android.';return}
 const triggerAtMs=Date.parse(when.value);
 if(!title.value.trim()||!Number.isFinite(triggerAtMs)||triggerAtMs<=Date.now()){status.textContent='Completează un titlu și alege o dată/oră din viitor.';return}
 const button=document.getElementById('workAlarmAdd');button.disabled=true;
 try{await window.CollectorAndroidRecorder.scheduleAlarm(title.value.trim(),triggerAtMs);title.value='';when.value='';status.textContent='Alarma a fost programată pe acest dispozitiv.';await renderWorkAlarms()}
 catch(error){status.textContent='Nu am putut programa alarma: '+error.message}
 finally{button.disabled=false}
}
document.getElementById('workAlarmAdd')?.addEventListener('click',addWorkAlarm);
document.querySelectorAll('[data-alarm-minutes]').forEach(button=>button.addEventListener('click',async()=>{
 const status=document.getElementById('workAlarmStatus');
 if(!window.CollectorAndroidRecorder?.isAvailable?.()){status.textContent='Alarmele locale necesită aplicația Android.';return}
 button.disabled=true;
 const minutes=Number(button.dataset.alarmMinutes);
 try{const triggerAtMs=Date.now()+minutes*60000;await window.CollectorAndroidRecorder.scheduleAlarm('Reminder în '+minutes+' minute',triggerAtMs);status.textContent='Reminder programat pentru '+new Date(triggerAtMs).toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'});await renderWorkAlarms()}
 catch(error){status.textContent='Nu am putut programa reminderul: '+error.message}
 finally{button.disabled=false}
}));
(function setAlarmMin(){const input=document.getElementById('workAlarmWhen');if(input){const now=new Date(Date.now()-new Date().getTimezoneOffset()*60000);input.min=now.toISOString().slice(0,16)}})();
renderWorkAlarms();

document.getElementById('globalVoice').onclick=()=>{showPage('work');if(audioRecorder&&(audioRecorder.state==='recording'||audioRecorder.state==='paused'))stopAudioRecording();else startAudioRecording()};
// Conversation context expires after 30 minutes; persistent entities and event history are unaffected.
// Do not persist stale in-memory snapshots on focus; context expiry is evaluated when commands are handled.
// Every committed change is persisted before publication; never write a stale in-memory snapshot on unload.
render();
window.__collectorAppReady = true;
