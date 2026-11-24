# Collector — punct unic de continuare

Ultima actualizare: 2026-11-21
Versiune de lucru: v0.7 — Attribute Range Policy Fix

## Scopul acestui fișier
Acesta este punctul unic de reluare pentru sesiunile viitoare. Citește-l înainte de orice modificare. Nu relua audituri sau pași deja finalizați fără un motiv concret și fără să verifici starea actuală.

## Starea proiectului
- Proiect: Collector MVP v11.
- Documentația arhitecturală AI Foundation v0.1 este inclusă în `docs/architecture/Collector-AI-Foundation-v0.1.md` și în copia rădăcină.
- Auditul Phase 0 este inclus în `docs/architecture/AI-FOUNDATION-PHASE0-AUDIT.md` și în copia rădăcină.
- Core Port UI integration v0.3 este inclusă.
- Replay fix v0.4 este inclus.
- Command parser fix v0.5 este inclus.
- Population/balance fix v0.6 este inclus.
- Attribute range policy fix v0.7 este inclus.
- Deciziile D-001–D-044 din `Decizio.md` trebuie păstrate ca autoritate. Nu rescrie și nu modifica deciziile fără o solicitare explicită și o analiză de impact.

## Comportamentul v0.7 pentru atribute numerice
- Minimul și maximul sunt limite recomandate, nu blocaje pentru măsurători reale.
- O valoare în afara intervalului produce avertisment și utilizatorul poate confirma înregistrarea.
- Atributele opționale pot fi definite fără valoare inițială.
- Atributele marcate obligatorii rămân obligatorii.
- Configurația cu minim mai mare decât maxim este invalidă și trebuie respinsă.
- UI folosește formularea „Limite recomandate”.
- Politica este aplicată pe fluxurile de atribute pentru entități, relații, evenimente, corecții și comenzi rapide.

## Verificare executată
În folderul proiectului, `npm test` a fost executat la 2026-11-21.
Rezultat: 38 teste, 38 reușite, 0 eșuate.
Comanda: `npm test` (Node.js >=18).

Atenție: testele automate trecute nu înlocuiesc testarea manuală în browser a cazului pH 5.2. Acesta rămâne testul manual de acceptanță imediat următor.

## Ce nu este încă finalizat
1. Publicarea/integrarea efectivă a stării v0.7 în repository-ul GitHub `Aplicatie` NU este confirmată. ZIP-ul este un pachet local de lucru, nu dovada unui commit sau merge.
2. Trebuie conectat GitHub în ChatGPT, apoi inspectat repository-ul și branch-ul real înainte de orice push.
3. Compară repository-ul cu acest pachet; păstrează modificările existente și D-001–D-044. Preferă un branch/commit sau PR verificabil, nu suprascriere oarbă.
4. După integrare, verifică CI/testele din repository și consemnează commit SHA și branch-ul aici.
5. Test manual: creează/folosește atributul pH cu limite recomandate 5.5–6.5 și încearcă o măsurătoare 5.2. Așteptat: avertisment + opțiune de continuare; după confirmare, valoarea 5.2 trebuie să fie înregistrată și vizibilă în cronologie/valoarea curentă.
6. Testează și 7.0, o valoare în interval, valoare inițială goală la atribut opțional și invalidarea minim > maxim.
7. Verifică problema anterioară de populații/solduri: diferența dintre cantitatea populației și soldul derivat trebuie explicată și validată pe date reale, nu doar presupusă.

## Instrucțiuni pentru următoarea sesiune
- Începe prin a citi acest fișier și `README.md`.
- Nu cere utilizatorului să reexplice proiectul, deciziile, arhitectura sau istoricul versiunilor.
- Nu cere să repete pași deja efectuați.
- Prima acțiune tehnică: conectează/verifică GitHub și inspectează repository-ul `Aplicatie`, branch-ul implicit și ultimul commit; apoi compară cu pachetul v0.7.
- Nu pretinde că v0.7 este în GitHub până când un commit/PR este confirmat.
- Utilizatorul nu este programator: explică pașii operaționali în română, unul câte unul, fără jargon inutil.

## Fișiere de pornire locală
- `Porneste-Collector.bat` pornește serverul local.
- Deschide `http://localhost:8000` în browser.
- Nu închide fereastra serverului cât timp folosește aplicația.

---

## Actualizare 2026-11-24 — WORK / THINK / Voice Read-back

### Repository și dependențe verificate
- Repository: `davidlucian-ioan/Aplicatie`.
- `main` nu a fost modificat și nu s-a făcut niciun merge automat.
- PR #43 — Android foundation: `feature/android-native-recorder` → `main`. Rămâne draft; build-ul APK reușește, dar testarea fizică pe Android este obligatorie înainte de a declara înregistrarea cu ecranul stins fiabilă.
- PR #44 — WORK/THINK workspace: `feature/think-dashboard-analytics` → `feature/android-native-recorder`. Include ecranul WORK pentru captură și remindere, THINK cu indicatori, graficul local pe 7 zile, scurtături către module și teste UI. Quality CI și Android debug build au trecut.
- PR #45 — spoken read-back: `feature/voice-readback` → `feature/think-dashboard-analytics`. Include sinteză vocală română pentru preview și confirmarea salvării, buton de repetare, anularea TTS înainte de captură și suprimarea TTS cât timp reportofonul înregistrează.
- Dependență: #45 → #44 → #43. Nu schimba bazele PR-urilor și nu integra în `main` fără verificarea dependențelor și testarea Android fizică.

### Ultimele verificări confirmate
- THINK PR #44: Quality CI PASS — run `45382375930`; Android debug PASS — run `45382376123`.
- Voice Read-back PR #45, head `71b73b8767f8b9585d06ea833b130d99a1ce362a`: Quality CI PASS — run `45383640700`; Android debug PASS — run `45383640738`.
- Testele noi verifică citirea preview-ului după eliberarea microfonului, faptul că nu se creează evenimente înainte de confirmare și fallback-ul când Speech Synthesis nu este disponibil.
- Build-ul Android reușit confirmă compilarea APK-ului, nu comportamentul pe un telefon fizic cu ecranul blocat.

### Constrângeri păstrate
- D-001–D-044 rămân autoritatea pentru comportamentul domeniului.
- Nicio modificare în Collector Core, schema evenimentelor, Replay, idempotency sau atomicitate pentru aceste două PR-uri.
- AI/speech nu poate ocoli Core Port, preview-ul și confirmarea explicită.
- Speech Recognition în browser nu este prezentat ca offline. TTS este opțional; când nu este disponibil, preview-ul vizual rămâne utilizabil.
- Nicio înregistrare audio nu este trimisă către cloud de aceste funcționalități.

### Actualizare 2026-11-24 — Voice batch preview (PR #46)
- Branch: `feature/voice-batch-preview`, bazat pe `feature/voice-readback`.
- PR: https://github.com/davidlucian-ioan/Aplicatie/pull/46 — deschis, mergeable; nu este integrat.
- Fiecare rezultat final din SpeechRecognition este păstrat ca frază separată; indexurile finale repetate sunt deduplicate.
- La oprirea sesiunii se construiește un singur preview cu lista frazelor și numărul operațiilor. O frază care nu corespunde unei comenzi structurate este păstrată ca observație.
- Operațiile sunt trimise împreună prin Core Port. Confirmarea creează un singur eveniment; anularea nu persistă nimic.
- Quality CI: PASS, run 45385254964; Android build: PASS, run 45385254881.

### Actualizare 2026-11-24 — Entity disambiguation și loturi mixte (PR #47)
- Branch: `feature/voice-entity-disambiguation`, bazat pe `feature/voice-batch-preview`.
- PR: https://github.com/davidlucian-ioan/Aplicatie/pull/47 — deschis, mergeable; nu este integrat.
- Pentru nume duplicate, UI prezintă candidații cu nume, tip și ID; utilizatorul trebuie să selecteze explicit. Lotul complet este revalidat după fiecare alegere, înainte de preview.
- Țintele inexistente, definițiile de atribut absente/duplicate și selecțiile devenite invalide blochează întregul lot; nu există fallback la prima potrivire.
- Avertismentele pentru valori în afara limitelor recomandate apar în preview, înainte de confirmarea atomică.
- Parserul atributelor folosește delimitatori lexicali cu word-boundary pentru `este`/`la`; testul a prins și corectat regresia în care „la” din „Plantă” trunchia numele entității la „P”.
- Teste E2E: disambiguare explicită pentru două entități cu același nume și lot mixt `attribute.set` + `stock.change`, verificând un singur eveniment și soldul rămas.
- Quality CI: PASS, run 45389796885; 40 teste Chromium au trecut.
- Android debug build: PASS, run 45389797002.
- Nu s-a modificat Core, schema jurnalului, Replay, idempotency sau D-001–D-044.

### Actualizare 2026-11-24 — Context vocal cu TTL (PR #48)
- Branch: `feature/voice-context-ttl`, bazat pe `feature/voice-entity-disambiguation`.
- Contextul activ este păstrat într-o cheie locală separată, cu ID-ul entității și expirare la 30 de minute; numele și tipul sunt citite din proiecția verificată.
- Contextul se setează numai după o comandă vocală confirmată. Comenzile cu țintă explicită rămân prioritare; contextul este folosit doar când o comandă de atribut omite entitatea.
- Contextul poate fi șters manual, este eliminat când expiră sau când entitatea nu mai există și este șters când un lot confirmat vizează mai multe entități.
- Funcționează pentru sesiunea live și dictarea one-shot confirmată. Nu este folosit de comenzile text introduse manual.
- Loturile cu stoc insuficient sunt respinse în preview integral: nici modificarea de atribut, nici vânzarea nu sunt persistate.
- Quality CI: PASS, run 45391198777; 43 teste Chromium au trecut, inclusiv persistarea, expirarea, ștergerea contextului și refuzul atomic.
- Android debug build: PASS, run 45391199038.
- Ultimul cod validat: `9fd244eaf77a5d016a1e05712820268e4e6bfe6c`. Documentația checkpoint este actualizată în commitul următor.
- Nu s-a modificat Core, schema jurnalului, Replay, idempotency sau D-001–D-044.

### Actualizare 2026-11-24 — Android on-device STT capability probe (PR #49)
- Branch: `feature/android-offline-stt-probe`, bazat pe `feature/voice-context-ttl`.
- A fost adăugat pluginul nativ `CollectorSpeechPlugin`, care verifică numai disponibilitatea serviciului Android on-device și suportul modelului pentru `ro-RO`.
- API 31–32: raportează existența serviciului, dar marchează limba ca neverificată, deoarece lista limbilor instalate nu este expusă de acest API.
- API 33+: folosește `SpeechRecognizer.checkRecognitionSupport` pentru a clasifica modelul ca instalat, în așteptare, descărcabil sau nesuportat.
- Folosește exclusiv `createOnDeviceSpeechRecognizer`; nu există fallback la recognizerul Android generic. Nu pornește ascultarea, nu capturează audio și nu descarcă modele.
- WORK are o acțiune diagnostică explicită. În browser raportează că verificarea este disponibilă doar în aplicația Android.
- Manifest patcher adaugă query-ul pentru `android.speech.RecognitionService` și îl îmbină într-un bloc `queries` existent; pluginul este înregistrat și copiat în proiectul Capacitor generat.
- Teste automate noi: probele verifică folosirea exclusivă a API-ului on-device, lipsa capturii audio, bridge-ul nativ, manifestul și fallback-ul browser.
- Build Android la commitul `4d0f63f870b806cde692199b0927d06a14a957ec`: PASS, confirmă compilarea pluginului nativ. Quality CI pe acel commit a fost blocat de teste de integrare cu newline escapate; corecțiile sunt incluse în head-ul curent.
- PR: https://github.com/davidlucian-ioan/Aplicatie/pull/49 — deschis, mergeable; nu este integrat.\n- Quality CI: PASS, run 45393056286; 44 teste Chromium au trecut. Android debug build: PASS, run 45393056339.\n- Ultimul cod validat: `cc086275d09d91645ebb89758ba3ee2fb4e2e7c8`. Nu declara limba română disponibilă până când verificarea pe un telefon fizic nu confirmă modelul instalat.
- Recunoașterea efectivă nu este încă activată. Următoarea implementare trebuie să fie exclusiv on-device și să nu concureze cu serviciul nativ de înregistrare pentru microfon.

### Următorii pași
1. Finalizează CI pentru PR #49 și verifică pe un dispozitiv Android fizic dacă modelul românesc este instalat/suportat.
2. Numai după confirmarea limbii, implementează sesiunea STT on-device, cu oprire/distrugere corectă a recognizerului și integrare în batch preview.
3. Blochează explicit STT când serviciul de înregistrare audio ține microfonul; nu porni două capturi concurente.
4. Testare fizică Android: ecran blocat, schimbare aplicație, distrugere Activity, acțiunea Stop din notificare, întreruperi și recuperarea fișierelor parțiale.
5. Pentru THINK: extinde analizele numai pe baza proiecțiilor/jurnalului local și cu definiții clare ale indicatorilor.

### Actualizare 2026-11-24 — STT permission flow (PR #50)
- Branch: `feature/android-stt-permission-flow`, bazat pe `feature/android-offline-stt-probe`.
- PR: https://github.com/davidlucian-ioan/Aplicatie/pull/50 — deschis, dependent de PR #49.
- Diagnosticarea STT cere acum permisiunea Android pentru microfon numai după apăsarea explicită a butonului WORK.
- Acordarea permisiunii permite doar interogarea suportului on-device; nu pornește `startListening`, nu capturează audio, nu pornește reportofonul și nu descarcă modele.
- Refuzul este returnat ca stare `permission-required`; interfața explică faptul că nu s-a capturat audio.
- Au fost adăugate verificări automate pentru aliasul de permisiune, callback și contractul fără captură.
- Quality CI: PASS, run 45396795785, pentru head `d8ed34a5c3b57aa7caa7a5f613a9a2d703cb7604`.
- Android debug build: PASS, run 45396786190, pentru commitul de cod `67e5a0b2c9fe9edc621afa5d94e8ea83bf12f5b3`; ultimul commit după acesta schimbă doar documentația.
- PR #50 este deschis și mergeable, dar nu este integrat. Verificările CI confirmă testele și compilarea, nu funcționarea pe un telefon fizic.
- Nu s-a modificat Core, schema jurnalului, Replay, idempotency sau D-001–D-044.
- STT efectiv rămâne blocat până la verificarea modelului românesc pe un dispozitiv fizic.

### Următorii pași
1. Închide verificările CI pentru PR #50 și remediază orice regresie.
2. Testează pe Android fizic permisiune acordată/refuzată și starea modelului românesc.
3. Numai după confirmarea modelului instalat, implementează recunoașterea efectivă on-device, cu arbitrare exclusivă a microfonului față de reportofon.
4. Testare fizică a reportofonului: ecran blocat, schimbare aplicație, distrugere Activity, Stop din notificare, întreruperi și recuperarea fișierelor parțiale.

Nu relua audituri finalizate și nu modifica deciziile arhitecturale fără solicitare explicită și analiză de impact.


### Actualizare 2026-11-24 — Microphone arbitration (PR în lucru)
- Branch: `feature/android-microphone-arbitration`, bazat pe `feature/android-stt-permission-flow`.
- WORK refuză acum dictarea one-shot și transcrierea live cât timp reportofonul este în pornire, înregistrare, pauză sau salvare; sunt luate în calcul și stările native Android.
- Reportofonul refuză pornirea cât timp dictarea sau transcrierea vocală este activă. Mesajul cere oprirea explicită a sesiunii curente; aplicația nu oprește automat o înregistrare și nu aruncă transcrieri.
- Fereastra asincronă de pornire a reportofonului este tratată ca ocupare a microfonului înainte de confirmarea serviciului nativ.
- Au fost adăugate teste Playwright dedicate pentru conflictul recorder → STT, STT → recorder și pornire nativă asincronă → STT.
- Contractul și limitele sunt documentate în `docs/architecture/ANDROID-MICROPHONE-OWNERSHIP.md`.
- Validarea CI urmează; nu declara remedierea verificată până când testele și build-ul Android nu trec.
- Nu s-au modificat Collector Core, schema jurnalului, Replay, idempotency sau D-001–D-044.


### Checkpoint automat — 2026-11-24 — PR #51 reverificat și extins
- PR #51: https://github.com/davidlucian-ioan/Aplicatie/pull/51
- Branch: `feature/android-microphone-arbitration`; base: `feature/android-stt-permission-flow` (lanț PR intenționat, nu `main`).
- Head la checkpoint-ul intermediar: `6a8481493482fd0387706cffa9a0d5e607f5e4d8`; actualizat ulterior prin fixurile și testele de mai jos.
- Reverificarea a găsit o cursă la pornirea WebView: STT putea fi apăsat înainte ca starea reportofonului Android să fie citită.
- Remediere: `nativeAudioStateReady` pornește false; `refreshNativeAudioState` îl setează true numai după un răspuns reușit; `isAudioRecorderBusy` blochează STT cât timp bridge-ul Android este disponibil, dar starea încă nu este confirmată. Butoanele one-shot și live declanșează o nouă citire și refuză pornirea în acel interval.
- Test Playwright suplimentar: starea nativă rămâne pending, ambele controale STT sunt apăsate, iar recognizerul nu pornește.
- Total teste noi în `microphone-arbitration.spec.cjs`: 5 scenarii (native recorder → live/one-shot STT; live STT → browser recorder; pending native start → STT; initial native-state pending → fail closed pentru STT; initial native-state pending → fail closed pentru recorder).
- Documentația `docs/architecture/ANDROID-MICROPHONE-OWNERSHIP.md` actualizată cu regula fail-closed și limitările.
- Validare locală/CI pentru noul head: NEEXECUTATĂ / NECONFIRMATĂ. Nu declara PASS până la rularea Quality CI și Android debug build.
- Nu au fost modificate Collector Core, jurnalul, Replay, idempotency, schema sau D-001–D-044.
- Limite rămase: arbitrare la nivelul aceleiași aplicații/WebView; nu este lock OS-wide și nu garantează coordonare între două instanțe/taburi independente. Testarea fizică rămâne obligatorie.
- Următoarea acțiune: verifică PR status și CI; inspectează logurile dacă apar eșecuri; apoi continuă hardening pentru lifecycle, stop/error cleanup și testarea Android. Păstrează acest fișier actualizat la fiecare etapă.

- Reverificare suplimentară: și pornirea reportofonului nativ este acum fail-closed cât timp verificarea inițială a serviciului este pending; testul confirmă că `startRecording` nu este apelat.
- Butoanele STT verifică întâi dacă există o sesiune activă și permit oprirea ei; blocarea reportofonului se aplică numai la inițierea unei sesiuni noi.
- Head curent înainte de acest checkpoint: `3a4acd191b05f51f7f9b955a2bd8e9810a7c055a`; urmează actualizarea documentației și a descrierii PR.


### Reverificare CI — 2026-11-24
- A fost identificată o problemă de workflow: atât `.github/workflows/collector-quality.yml`, cât și `.github/workflows/android-build.yml` filtrau evenimentele `pull_request` exclusiv pentru target branch `main`.
- PR #51 este stacked pe `feature/android-stt-permission-flow`, deci nu primea automat aceste workflow-uri ca verificări PR.
- Corecție publicată pe branch-ul PR #51: am adăugat `feature/**` la filtrele `pull_request.branches` în ambele workflow-uri. Filtrul `push` pentru `feature/**` exista deja.
- Acest lucru permite verificarea PR-urilor intermediare, nu doar a celor care țintesc `main`.
- CI pentru noul head: încă în așteptare; connectorul disponibil pentru workflow runs filtrează numai evenimente PR și nu a returnat încă o rulare. Nu declara PASS până când GitHub Actions confirmă rezultatul.
- Head după corecția workflow-urilor urmează a fi verificat din metadata PR.

- Clarificare de execuție GitHub Actions: la un eveniment `pull_request`, GitHub evaluează workflow-ul din branch-ul de bază. Modificarea filtrelor aflată numai pe head-ul PR #51 nu poate activa retroactiv trigger-ul PR pentru acest PR; ea activează trigger-ul pentru push-urile pe `feature/**` și va fi disponibilă pentru PR-uri viitoare după ce ajunge în branch-ul lor de bază. PR #51 are în continuare target branch intermediar. Tool-ul GitHub disponibil pentru workflow runs expune numai evenimente PR, deci nu poate confirma rulările de tip push. Nu raporta CI PASS/FAIL fără acces la run-ul efectiv.
- Configurația Playwright confirmată: `testDir: ./e2e`, `testMatch: **/*.spec.cjs`, proiect Chromium inclus; fișierul nou este inclus de pattern-ul existent. Workflow-ul Quality CI rulează `npm run test:e2e` pe Chromium.


### Checkpoint — unknown native recorder state (2026-11-24)
- A second fail-open path was found: the Capacitor plugin returned an empty object when `active-state.json` was missing/corrupt. JavaScript could treat a resolved empty object as an inactive recorder.
- Native fix in `CollectorRecorderPlugin.getRecordingState()`: return explicit `inactive` only when the manifest is absent AND the native recording service is not running. If a manifest exists but cannot be parsed, or the service is running without readable state, return `status: unknown`.
- JavaScript fix: `refreshNativeAudioState()` clears the ready flag before querying and accepts only explicit statuses: `inactive`, `complete`, `interrupted`, `starting`, `recording`, `paused`. Empty/unknown/malformed results throw and keep microphone operations blocked.
- Added Node regression tests in `test-android-recorder-state.js` for native and JavaScript contracts.
- Added Playwright regression test ensuring unknown native state blocks both STT and recorder startup.
- Playwright microphone arbitration suite now contains 6 E2E scenarios; the new Node test file contains 2 static contract tests. These are added, not yet executed in this environment.
- Latest code commits: JS state validation `9665fa511a8f69dc2ac213b79f32b2c044e75401`; native plugin explicit unknown/inactive `44328bfc146a8d47c8fe78588777d3a6935ea211`; Node tests `00b5d4ca2389c5409279a4ffca1f8bbe3a8c398a`; E2E unknown-state regression `7a64410ff897cc7c37d51dd4351ac6231e5b900e`.
- Re-run Quality CI and Android build after the final checkpoint. No PASS claims until run results are available.

- Native-side bypass check added: `CollectorRecorderPlugin.startRecording()` now independently rejects a new recording if the state is unknown (non-empty malformed state, existing unreadable manifest, or service running without readable state). The JavaScript guard is not the only enforcement layer.
- Static Node contract test expanded to assert the native start guard. Latest native plugin commit: `7e6b67047a0443f45338f399aab5d440ef6ff955`; test commit: `ce020840153649bfadc1e3319b91375d101373d8`.

- Încă o cursă nativă eliminată: pluginul refuză un nou `startRecording` cât timp vechiul serviciu foreground încă rulează, chiar dacă manifestul spune deja `complete`/alt status inactiv. Previne suprapunerea dintre `stopSelf()`/teardown și o pornire imediat următoare.
- Testul static verifică și acest guard. Commituri: native service shutdown guard `21174fd5c7fe99d179caaca76f669286de5b47cc`; test `a418900086bf0e49f99c4f600b0b0ed183d60021`.

- Reverificare a testelor de contract: o aserțiune Node rămăsese pe forma anterioară a condiției native după separarea verificării `serviceRunning`; a fost corectată pentru a reflecta implementarea finală. Commit test: `ba433ad490c81a3a24d1b1a0f7b39f7ca3259920`. Numărul E2E confirmat prin citirea fișierului: 6; testele statice Node: 2.
