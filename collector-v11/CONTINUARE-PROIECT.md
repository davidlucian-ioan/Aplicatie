# Collector — punct unic de continuare

Ultima actualizare: 2026-11-26
Versiune de lucru: v0.8 — OpenAI Provider Integration (branch separat)

Checkpoint tehnic curent: codul este pe branch-ul `feature/openai-provider-integration`, runtime HEAD `563ac92649ed0d5441efd76b2fe101f570694d69`. Quality Suite, Cloud API, Android debug APK și iOS Simulator sunt verzi pe acest HEAD. PR #55 rămâne open/draft/unmerged; `main` nu a fost modificat.

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

## Integrare OpenAI — 2026-11-24
- Provider ales: OpenAI API, Responses API cu Structured Outputs.
- Branch: `feature/openai-provider-integration`.
- Server local: `server.js`, ascultă implicit pe `127.0.0.1:8000`.
- Cheia API este citită exclusiv din `OPENAI_API_KEY`; `.env` este ignorat de Git.
- Model implicit: `gpt-6.2-sol`, suprascris prin `OPENAI_MODEL`.
- UI are buton separat „Interpretează cu AI”; interpretarea locală existentă rămâne disponibilă.
- OpenAI primește textul comenzii și metadate limitate de entități/atribute, nu jurnalul complet.
- Providerul validează răspunsul cu `ai/contracts.js`; propunerile trec prin BrowserCorePort preview și confirmare explicită. Nu există execuție automată.
- `ai/context-sanitizer.js` aplică allowlist pentru contextul AI: numai ID/nume/tip pentru entități și definiții de atribute permise, fără atribute arbitrare sau date suplimentare; limitează numărul și lungimea câmpurilor. Modulul are teste unitare pentru eliminarea câmpurilor arbitrare și pentru limite.
- Promptul providerului include formele de date exacte pentru fiecare operație Core permisă, pentru a reduce propunerile invalide; testele verifică existența instrucțiunilor de contract.
- Endpoint-ul folosește `store:false`, limită de corp, rate limit și verificare Origin. Serverul static blochează toate fișierele ascunse (inclusiv `.env` și `.git`), fișierele private de server/test și modulele provider-side; răspunsurile HTML/JS includ CSP same-origin, `X-Frame-Options`, `Permissions-Policy` și `Referrer-Policy`.
- `test-openai-server-integration.js` pornește serverul într-un proces separat și verifică statusul providerului, livrarea UI, headerele de securitate, blocarea fișierelor private, refuzul Origin extern și comportamentul fără API key.
- Teste provider cu fetch mock și teste de wiring/siguranță adăugate; CI a identificat și a ghidat corectarea unei regresii în testul nou. Nu s-a efectuat încă un apel cu o cheie API reală. Ultima rundă de teste unitare, Core, invariants, Replay benchmark și Chromium E2E a trecut pe push-ul `d7ad7aa8`; verificarea PR aferentă era încă în curs.

## Ce nu este încă finalizat
1. Urmărește PR draft #55 și verifică finalizarea workflow-urilor GitHub Actions pentru ultimul commit. Ultimul push pentru `d7ad7aa8` a trecut; verificarea PR era încă în curs la salvarea acestei note. Nu marca PR Ready până nu sunt finalizate toate verificările.
2. Nu îl merge automat în `main`; păstrează deciziile și așteaptă revizuirea.
3. Configurează `OPENAI_API_KEY` pe calculatorul unde rulează Collector și efectuează un test real de interpretare.
4. Testează refuzuri, clarificări, intenții ambigue, operații nepermise, limite/rate limit și indisponibilitatea rețelei.
5. Test manual: creează/folosește atributul pH cu limite recomandate 5.5–6.5 și încearcă o măsurătoare 5.2. Așteptat: avertisment + opțiune de continuare; după confirmare, valoarea 5.2 trebuie să fie înregistrată și vizibilă în cronologie/valoarea curentă.
6. Testează și 7.0, o valoare în interval, valoare inițială goală la atribut opțional și invalidarea minim > maxim.
7. Verifică problema anterioară de populații/solduri: diferența dintre cantitatea populației și soldul derivat trebuie explicată și validată pe date reale, nu doar presupusă.

## Direcție nouă confirmată — aplicație mobilă comercială (2026-11-24)

Utilizatorul a clarificat explicit că Collector trebuie să fie o aplicație instalabilă pe Android și iPhone, publicată și vândută prin Google Play și Apple App Store. PC-ul nu este mediu de utilizare și nu trebuie să fie necesar pentru funcționarea aplicației; poate rămâne doar unealtă de dezvoltare/build.

- Document de referință: `MOBILE-APP-AND-COMMERCIAL-ROADMAP.md`.
- Direcție tehnică recomandată: Capacitor 8 pentru a reutiliza UI-ul HTML/CSS/JS și Core-ul existent, cu funcții native reale.
- Arhitectura de producție trebuie să includă stocare mobilă persistentă (SQLite), audio local, notificări native, backend cloud multiutilizator, autentificare, sincronizare offline-first și endpoint OpenAI securizat.
- `server.js` actual este doar server local de dezvoltare; nu este backend de producție.
- Monetizarea trebuie să respecte Apple In-App Purchase și Google Play Billing pentru funcții digitale/abonamente, cu verificarea regulilor regionale.
- Există shell Capacitor, build pipeline și funcții native inițiale, dar nu există încă backend multiutilizator, billing sau build-uri semnate pentru store. Nu afirma contrariul.
- Auditul static M0 și progresul implementării sunt salvate în `MOBILE-COMPATIBILITY-AUDIT.md`.
- Work și Think sunt acum ecrane distincte. Work include recorder și programarea alarmelor native.
- `app.js` folosește StorageAdapter asincron. Pe Android/iOS este selectat SQLite nativ; pe web rămâne adapterul localStorage.
- SQLite păstrează schema v7 ca snapshot și citește localStorage legacy până când Core validează și rescrie datele; sursa legacy nu este ștearsă.
- CI mobile generează Android debug APK și iOS Simulator app. Un build anterior cu Capacitor + Local Notifications a trecut; integrarea SQLite este încă în verificare.
- Următorul pas: verifică CI-ul SQLite pe ambele platforme, apoi mută audio din IndexedDB în Filesystem nativ și testează microfonul/notificările pe dispozitive reale. Păstrează testele Core ca gate și nu schimba D-001–D-044.
- Branch-ul curent rămâne `feature/openai-provider-integration`; PR #55 este draft, CI pe commitul `0d97ada1` a trecut pe push și pull_request. Nu merge în main fără aprobare.

## Progres mobil și cloud actualizat — 2026-11-24

- UI Work/Think implementat; Work este ecranul inițial, Think păstrează analiză și administrare.
- Capacitor 8, Android/iOS shell, SQLite adapter și migrare v7 implementate în cod.
- Notificări locale native implementate.
- Audio mobil: plugin AAC nativ, fișiere în storage privat, metadate SQLite, migrare IndexedDB; MediaRecorder rămâne fallback web.
- Permisiuni microfon Android/iOS, UIBackgroundModes audio și PrivacyInfo.xcprivacy incluse în configurarea nativă.
- Client Supabase Auth anonim bundle-uit pentru mobil; Secure Storage pe iOS/Android; AI trimite tokenul bearer doar către Cloud API. Cloud opt-out este respectat după ștergerea contului.
- Cloud API Node 22/Docker în `cloud-api/`: verifică tokenul prin Supabase Auth, folosește OpenAI server-side, rate-limit per utilizator, CORS allowlist și endpoint de ștergere cont cu service role key.
- Build mobil injectează `COLLECTOR_API_BASE_URL`, `COLLECTOR_SUPABASE_URL`, `COLLECTOR_SUPABASE_ANON_KEY`; fără configurație cloud AI rămâne dezactivat, dar Core local continuă.
- CI Cloud API a trecut pe un commit recent; CI pentru capul actual este în coadă. Nu declara APK/IPA curente validate până nu trec joburile Android și iOS.
- Nu există încă proiect Supabase real, backend deployat, chei configurate, smoke test OpenAI real, sync multi-device, billing, privacy policy finală sau store submission.
- Următorii pași după CI: remediază orice eșec; validează APK și iOS simulator build; configurează Supabase și un host Node HTTPS; rulează test pe telefoane reale; implementează sync/billing și documentele App Store/Play Store.

## Instrucțiuni pentru următoarea sesiune
- Continuă pe branch-ul `feature/openai-provider-integration` până când testele CI trec.
- Nu modifica direct `main` și nu crea PR înainte de verificarea CI.
- Păstrează D-001–D-044 și separarea strictă AI/Core.
- Nu cere utilizatorului să repete contextul sau pașii deja documentați.
- Utilizatorul nu este programator: explică pașii operaționali în română, unul câte unul, fără jargon inutil.

## Pornire locală — doar dezvoltare/testare
- `Porneste-Collector.bat` și `server.js` sunt doar pentru dezvoltare pe calculator; nu sunt cerințe pentru utilizatorii aplicației mobile.
- Build-urile mobile sunt generate de workflow-ul `.github/workflows/collector-mobile-build.yml`.
- `npm run mobile:build` produce bundle-ul allowlist în `www/`; `npm run mobile:sync` sincronizează proiectele native când toolchain-ul Capacitor este instalat.


## Salvare progres — verificare CI și build Android (2026-11-24 seara)

- Branch: `feature/openai-provider-integration`; PR #55 rămâne draft și deschis. Nu se face merge în `main` fără aprobare.
- Commit verificat anterior: `a00989d0b6bb40f409160449fd537a5e7b8af979`.
- CI Quality Suite: SUCCESS.
- CI Cloud API: SUCCESS (testele Node și Docker build).
- CI Mobile: jobul Android debug APK: SUCCESS; artifactul `collector-android-debug` a fost generat și recuperat. Este build debug, nu AAB semnat.
- CI Mobile: jobul iOS Simulator era încă QUEUED la ultima verificare; nu declara build iOS reușit până când jobul nu se finalizează cu SUCCESS și artifactul este prezent.
- Audio mobil AAC, Filesystem privat și index SQLite sunt implementate în cod; notificările native și clientul Supabase Secure Storage sunt implementate. Testarea pe dispozitive fizice rămâne obligatorie.
- Cloud API există în `cloud-api/`, testele și Docker build trec, dar serviciul nu este deployat. Nu există încă proiect Supabase configurat, chei server-side configurate, URL public HTTPS sau test OpenAI cu cheie reală.
- Sync multi-device, workspaces/tenant isolation la nivel de date, billing/entitlements, privacy policy finală și builduri semnate pentru store rămân neimplementate.
- Dependențele mobile sunt instalate în CI cu versiuni fixate prin comandă `npm install --no-save --no-package-lock`; nu sunt încă în `package.json` și lockfile. Înainte de release trebuie introduse ca dependențe declarate și regenerate lockfile-ul printr-un build verificat.
- Roadmap-ul mobil a fost corectat pentru a separa constatările auditului inițial de starea actuală a implementării.
- Următorii pași: (1) urmărește jobul iOS pentru commitul actual; (2) dacă rămâne blocat în coadă, verifică disponibilitatea runnerului macOS înainte de a crea alte commituri care pornesc workflow-uri; (3) finalizează dependențele reproductibile; (4) configurează Supabase și hosting Node HTTPS numai cu secrete introduse în managerul de secrete al hostului; (5) apoi testează pe dispozitive reale. Nu cere utilizatorului chei secrete în chat.


## Salvare progres — verificare build curent 0b751ee4 (2026-11-24)

- HEAD verificat: `0b751ee4c62a86c6daf5e8f07370fb1e3ff988f8` pe `feature/openai-provider-integration`; PR #55 rămâne draft/deschis. Nicio modificare în `main`.
- Workflow Quality Suite: SUCCESS. Au trecut testele Core/AI Foundation, invariants generate, regressions/sequences, Replay benchmark și testele browser Chromium, Firefox și WebKit. Mutation baseline nightly a fost skipped conform configurării workflow-ului, nu raportat ca eșec.
- Workflow Cloud API: SUCCESS; testele API și Docker build au trecut.
- Workflow Mobile: Android debug APK SUCCESS. Artifactul `collector-android-debug` a fost descărcat și inspectat; APK valid Android, 4,278,250 bytes, cu șase fișiere DEX.
- Scanarea APK: nu există `server.js`; configul Capacitor păstrează appId provizoriu `ro.collector.mobile`; `collector-config.js` are URL Supabase/API și anon key goale, deci cloud/AI rămân dezactivate în acest APK de test. Nu au fost găsite fișiere .env/server sau chei secrete în asset-urile inspectate.
- SQLite encryption este încă dezactivată în configurația nativă; trebuie evaluată și rezolvată înainte de distribuție comercială.
- Workflow Mobile iOS Simulator este încă QUEUED la ultima verificare; nu declara build iOS validat.
- Dependențele mobile sunt încă instalate în workflow cu versiuni fixate prin comandă, fără declarare completă în package.json/lockfile.
- APK-ul generat este DEBUG, nu AAB semnat pentru Play Store. Nu este versiune de producție.
- Următorii pași: urmărește iOS runner; declară dependențele mobile într-un lockfile reproductibil; evaluează criptarea SQLite; configurează proiect Supabase și hosting HTTPS; apoi testează pe dispozitive fizice. Nu solicita chei secrete în chat.


## Monetizare și estimare cost — 2026-11-24
- Document nou: `MONETIZATION-AND-COST-MODEL.md`; include auditul componentelor deja implementate, lipsurile billing, costuri furnizori, scenarii AI, măsuri de economisire și arhitectura recomandată.
- Model recomandat: un singur abonament Collector Pro; utilizatorul nu plătește separat OpenAI. Free păstrează Core/Work/Think local, audio și notificări locale. Pro poate include AI cu quota măsurată și cloud sync/backup după implementare.
- Niciun billing/RevenueCat/entitlement/restore/usage metering nu este implementat în cod la acest moment.
- Cloud API validează Supabase Auth și aplică 20 cereri/minut în memorie, dar nu verifică abonamentul și nu aplică un buget lunar persistent. Acesta este un blocaj înainte de activarea AI publică.
- Estimare orientativă: Render Starter ~7 USD/lună + Supabase Pro 25 USD/lună; OpenAI gpt-6.2-sol ~0,009–0,020 USD/interpretare în scenariile din document. RevenueCat este recomandat pentru evaluare, gratuit până la 2.500 USD MTR conform tarifului consultat, apoi 1% MTR.
- Nu cumpăra hosting și nu activa plăți până la finalizarea proiectului Supabase, a identității recuperabile, deploy-ului, sync/backup-ului, entitlement-ului și usage metering-ului.
- PR #55 rămâne draft/open; nu se face merge în main fără aprobare.


## Progres completare monetizare și abonament — 2026-11-24

- Backend: adăugat cloud-api/billing-service.js pentru Supabase REST/RPC folosind service-role key exclusiv server-side.
- Migrare nouă: cloud-api/migrations/001_billing_and_ai_usage.sql — entitlements, bugete AI lunare, usage per request, evenimente RevenueCat, RLS și RPC-uri atomice.
- Cloud API: /api/ai/status verifică entitlement-ul Pro și poate returna bugetul/consumul lunar; /api/ai/interpret refuză Free și rezervă bugetul înainte de apelul OpenAI, apoi regularizează după usage. Dacă regularizarea eșuează după un răspuns billable, rezerva nu este eliberată automat.
- RevenueCat: webhook cu Authorization secret, product ID allowlist, UUID Supabase ca App User ID, idempotency și protecție la evenimente întârziate.
- Mobile: integrat @revenuecat/purchases-capacitor 14.1.2 în build-ul Capacitor; bridge pentru offerings, purchase, customer info și restore; UI Collector Pro cu prețuri dinamice și buton de restaurare.
- Identitate: adăugate asocierea contului anonim la email/parolă și autentificarea ulterioară, astfel încât RevenueCat să primească același UUID Supabase la recuperarea contului. Acest lucru nu implementează încă sync de date.
- Native: Android launchMode standard pentru flow-ul de achiziție; iOS In-App Purchase capability adăugată automat în proiectul Xcode.
- Quota: default tehnic AI_MONTHLY_BUDGET_USD=1 USD/utilizator/lună; costul este calculat din usage OpenAI și tarifele input/output configurate. Nu este un preț sau quota comercială aprobată.
- Teste noi: entitlement gates, buget epuizat, usage settlement, webhook RevenueCat, Supabase billing service, account linking, RevenueCat client și configurare nativă. Cloud API/Docker run pentru commitul e8a301d a trecut; Quality și Android/iOS au fost întrerupte de commituri ulterioare și trebuie rerulate pe ultimul commit.
- NU există încă proiect Supabase live, migrarea nu este aplicată, nu există deploy public, chei RevenueCat, produse store sau tranzacții sandbox reale. Nu activa plăți/AI public până la aceste configurări și teste.
- Lipsuri rămase majore: sync multi-device și backup, teste reale Android/iOS, criptare SQLite at-rest, builduri semnate AAB/IPA, privacy policy/GDPR, store metadata și validarea fluxurilor de refund/transfer.
- Branch rămâne feature/openai-provider-integration; PR #55 draft/open; main nu a fost modificat și nu se face merge fără aprobarea explicită a utilizatorului.


## Politică RevenueCat și recuperare cont — completare 2026-11-24
- Achiziția este blocată în UI cât timp Supabase user este anonim. Utilizatorul trebuie să asocieze contul cu email/parolă; la login ulterior se folosește același UUID Supabase ca RevenueCat App User ID.
- În RevenueCat Project Settings → General trebuie configurat Restore Behavior = Keep with original App User ID. Nu activa Transfer to new App User ID până când handler-ul TRANSFER nu este implementat și testat; backend-ul curent ignoră transferurile.
- Webhook-ul rezolvă user-ul din app_user_id, original_app_user_id sau aliases; verifică entitlement_ids=pro sau product ID allowlist.
- Evenimentele TEMPORARY_ENTITLEMENT_GRANT, SUBSCRIPTION_EXTENDED și REFUND_REVERSED sunt acceptate ca activări dacă entitlement-ul Pro este prezent și expirarea este validă.
- UI oferă linkul de gestionare a abonamentului din CustomerInfo. Ștergerea contului avertizează că nu anulează automat abonamentul din App Store/Google Play.


## Ultima verificare tehnică — 2026-11-24, commit 009b1462
- Webhook RevenueCat caută UUID-ul Supabase în app_user_id, original_app_user_id și aliases; verifică entitlement_ids (implicit pro) sau product ID allowlist.
- Evenimentul BILLING_ISSUE folosește grace_period_expiration_at_ms pentru a păstra Pro pe durata perioadei de grație. TEMPORARY_ENTITLEMENT_GRANT, SUBSCRIPTION_EXTENDED și REFUND_REVERSED sunt acceptate.
- Achizițiile sunt blocate până când utilizatorul asociază contul cu email/parolă și confirmă emailul. Restore Behavior obligatoriu în RevenueCat: Keep with original App User ID; handler-ul TRANSFER nu este implementat.
- UI afișează linkul de gestionare a abonamentului și avertizează că ștergerea contului nu anulează abonamentul din magazin.
- Cloud API CI pe commit 009b1462: SUCCESS, inclusiv testele autentificate și Docker build.
- Quality și Mobile CI pentru commitul 009b1462: în așteptare la ultima verificare; nu declara E2E/browser sau APK final trecute până la finalizarea lor.
- PR #55 rămâne draft/open, branch feature/openai-provider-integration; main neatins.


## CHECKPOINT AUTORITATIV — 2026-11-24, verificare continuare din sesiune nouă

Acest checkpoint supersedează orice afirmație anterioară din document care descrie starea curentă ca și cum billing/RevenueCat/usage metering nu ar fi implementate. Secțiunile istorice se păstrează ca istoric, nu ca stare actuală.

### Repository și CI verificate
- Repository: `davidlucian-ioan/Aplicatie`.
- Branch activ: `feature/openai-provider-integration`.
- PR #55: deschis, draft, target `main`; nu este merged. Nu modifica `main` și nu face merge fără aprobarea explicită a utilizatorului.
- HEAD verificat: `9a781896cce13410aaa14f982ff3fee05bb76bfb`.
- La acest HEAD, toate cele 3 workflow-uri GitHub Actions au status completed/conclusion success: Collector Cloud API (run 161), Collector quality suite (run 1204), Collector mobile build (run 309).
- Fișierele modificate în PR #55 includ Cloud API, migrarea billing, testele cloud, clientul RevenueCat, configurarea nativă Android/iOS și documentația monetizării.

### Starea tehnică actuală
- OpenAI provider server-side este implementat; cheia API rămâne server-side.
- Cloud API validează sesiunea Supabase, aplică rate limiting, verifică entitlement Pro și rezervă atomic bugetul lunar înainte de apelul OpenAI; după răspuns face settlement pe baza usage.
- RevenueCat Capacitor SDK, UI de oferte, purchase/restore și verificare CustomerInfo sunt implementate în branch.
- Webhook RevenueCat este autentificat, mapează UUID Supabase din app_user_id/original_app_user_id/aliases, verifică entitlement/product allowlist și persistă evenimente idempotent.
- Migrarea `cloud-api/migrations/001_billing_and_ai_usage.sql` definește entitlements, usage budgets, usage records, billing events, RLS și RPC-uri de rezervare/settlement/webhook.
- Asocierea contului anonim la identitate recuperabilă, login și avertizarea la ștergerea contului privind abonamentul magazinului sunt implementate în branch.
- CI verde nu înseamnă că integrarea externă este activată: nu există confirmare că un proiect Supabase live a fost configurat, migrarea aplicată, Cloud API deployat, RevenueCat configurat cu produse reale sau tranzacții sandbox validate.

### Următoarea etapă — fără achiziție de hosting înainte de validare
1. Audit static țintit pentru fluxurile de restore/purchase, asociere cont, ștergere cont și webhook; verifică explicit scenariile de alias, email neconfirmat, expirare, refund, billing issue/grace period și cont schimbat.
2. Verifică dependențele mobile și build-urile native pe ultimul HEAD; CI verde este necesar, dar nu înlocuiește testarea pe dispozitive fizice.
3. Pregătește configurarea Supabase: proiect, Auth, URL/anon key, aplicarea migrației SQL și verificarea RLS/RPC. Nu introduce secrete în repository sau chat.
4. Pregătește RevenueCat: aplicații, produse lunare/anuale, entitlement exact `pro`, offering, chei publice SDK și webhook cu secret server-side; păstrează Restore Behavior = Keep with original App User ID până când transferul este implementat și testat.
5. Abia apoi deploy HTTPS pentru Cloud API și teste sandbox end-to-end Android/iOS: purchase, restore după reinstalare, reînnoire, anulare, refund, expirare, billing issue/grace period și ștergerea contului.
6. Înainte de release: validează backup/sync multi-device (încă neimplementate), criptarea SQLite at-rest, privacy/GDPR, builduri store semnate și metadata de store.
7. Actualizează acest checkpoint după fiecare etapă majoră, cu commit SHA și workflow IDs; păstrează istoricul, dar marchează clar secțiunile superseded.

### Reguli de continuitate
- Repository + acest document sunt sursa de adevăr; nu te baza pe memoria conversației pentru status.
- La începutul fiecărei sesiuni: citește ultimul checkpoint, verifică HEAD/PR și workflow-urile acelui SHA.
- Înainte de limita conversației: actualizează checkpoint-ul cu ce s-a schimbat, ce a trecut CI și următorul pas concret.
- Nu declara o configurare externă sau tranzacție reală ca reușită doar pentru că testele mock/CI au trecut.









## CHECKPOINT CURENT — 2026-11-25 (UI/UX + entity detail audit)
### Repo / safety
- Repo: `davidlucian-ioan/Aplicatie`; branch `feature/openai-provider-integration`; PR #55 draft; base `main`.
- Current code head before this checkpoint: `26eec11d737e0d7ab159b92e2f55547a4901625d`.
- Do not merge. Main is untouched.
- Latest commit series added modal accessibility, entity rename and E2E regression. A malformed test newline was fixed in `60ba554`; entity rename is in `5950fab` and regression in `26eec11`.

### UI/UX implementation
- Typography, spacing, cards/panels/buttons/forms, responsive breakpoints, focus/hover, sidebar/drawer.
- Work screen: desktop recorder/reminder split, mobile recorder first; command/interpretation area full width.
- Think dashboard KPIs, quick actions, recent activity; page intros for all main pages.
- Generic live filters on relations, locations, inventory, finance, attributes, events, audit; case-insensitive, no-match state, clear.
- Entity search by name/type/location/attribute names; result count and no-match state.
- Relations + locations paired workspace: desktop split/mobile stack. Finance metrics separated from ledger.
- Modal accessibility: focus on open, Tab/Shift+Tab trap, Escape, backdrop close, focus return. Regression test.
- Entity detail now has event-sourced rename action via Core `entity.rename`; empty name rejected, previous name/history retained. E2E regression added.
- Existing tests cover list filters, Work/mobile layout, relations responsive, entity search, modal keyboard behavior, and rename.
- Files touched: `collector-v11/index.html`, `style.css`, `app.js`, `e2e/page-ux.spec.cjs`, `e2e/collector-flows.spec.cjs`.

### CI status — exact current head
- Head: `26eec11`.
- Cloud API: SUCCESS.
- Android debug APK: SUCCESS.
- iOS simulator build: SUCCESS.
- Quality suite: still running at Playwright E2E step; core tests, generated invariants, phase 2 regressions, coverage baseline, replay benchmark, Chromium install, Firefox/WebKit install all completed successfully before E2E. The previous run `5ee2778` failed due literal escaped newline in the test; fixed in `60ba554`.
- Do not claim Quality green until it completes. If it remains stuck, inspect workflow and diagnose rather than guessing.

### Next implementation work
1. Finish/poll CI; diagnose any E2E failure and fix.
2. Continue audit of entity detail and every CRUD form: validation feedback, keyboard flow, empty/loading/error states, keyboard/mobile layout.
3. Check events/history/audit correction flows and visual hierarchy.
4. Add tests in batches; avoid frequent commits that cancel CI.
5. Save this checkpoint by replacing only the current section; preserve prior history.

### Product/release gaps (not yet live-validated)
- Supabase project/config, SQL migration/RPC execution and RLS in real DB.
- Deploy Cloud API and configure secrets; real OpenAI billing budget tests.
- RevenueCat products/entitlement/webhook, sandbox purchase/renew/restore/cancel/refund/grace testing.
- Sync/multi-device, backup/conflict strategy, encryption at rest, privacy/GDPR, physical device tests, signed release AAB/IPA/store metadata.
- Do not recommend purchasing hosting until external deployment architecture is validated.

### Continuity rules
- User requested autonomous continuation, no confirmation prompts for implementation decisions.
- Keep PR draft; do not merge or modify `main`.
- Batch implementation, tests, CI, and checkpoint updates.


## CHECKPOINT CURENT — 2026-11-25 (navigation/accessibility batch)
- Latest implementation HEAD before checkpoint: `5447bed`.
- Added entity detail heading focus target (`#entityDetailTitle`, tabindex -1); opening entity detail and completing rename moves keyboard focus to the heading. E2E asserts focus after rename.
- Relations now make both source and target entities clickable to open detail.
- Locations list entries open their entity detail.
- Inventory population rows open population detail; location remains displayed (linking it is next).
- Finance ledger entity names now link to entity detail.
- Added `.link-button` visual and keyboard focus styles.
- Commits in batch: `2f8b276` focus handling, `b1cd43a` relations/locations navigation, `98e8db1` inventory population links, `4ab8f7f` link styles, `c988e25` focus regression, `5447bed` finance links.
- Cloud API workflow succeeded at `c988e25`; Quality and Mobile builds were restarted/cancelled by subsequent branch pushes and must be checked on final HEAD.
- PR #55 remains open/draft; main untouched. No merge.
### Next
1. Wait for CI on final checkpoint, inspect any failures/logs.
2. Add E2E navigation coverage for relations/location/inventory/finance links, verify link markup and entity focus.
3. Link inventory locations and other entity references where useful.
4. Continue full form validation and CRUD accessibility audit.
5. External Supabase/RevenueCat deployment/sandbox testing remains a release blocker; do not claim live validation.


## CHECKPOINT CURENT — 2026-11-25 (WORK-FIRST)
- User priority confirmed: **Work is the main product experience; Think is deferred for later design discussion.** No further Think/dashboard feature work should be prioritized until the Work experience is mature.
- Work layout changed to a single-column, focused flow on desktop and mobile, max-width constrained for readability.
- Order is now consistent across screen sizes: 1) recorder/capture, 2) transcription + interpretation/command, 3) reminders.
- Recorder panel visually emphasized, primary record button larger, timer tabular and clearly separated; command textarea larger and mobile buttons have touch-friendly minimum height.
- E2E added to verify Work is active by default, single-column on desktop, and correct panel order/availability.
- Commit `f22a60e` Work-first CSS; `5848df9` E2E for desktop Work-first.
- Latest CI at checkpoint pending new run after these commits. Previous checkpoint `56960fa`: Cloud API success, Mobile build success, Quality E2E still running.
- Navigation batch from prior checkpoint remains: relations, locations, inventory population, finance entity links; keyboard focus after rename/open.
- Continue only on Work-focused product improvements; Think remains parked. PR #55 draft/open, branch `feature/openai-provider-integration`, main untouched.
### Work roadmap next
1. Make quick capture interactions faster: clear, save draft/continue, sensible command examples, explicit review before commit.
2. Improve recording list/playback and recording-to-transcription flow; keep audio local unless user explicitly chooses processing.
3. Reminder creation/list states, editing, snooze/done/cancel and notification permission UX.
4. AI interpretation UX: loading, errors, proposed operations, editable review, confirmation, cancellation, clear costs/Pro state.
5. Mobile touch/accessibility and E2E; no Think redesign yet.


## Continuare Work-first — capture mai sigură și rapidă (2026-11-25)

- Prioritate confirmată: Work este ecranul principal; Think rămâne parcat.
- Draft pentru câmpul de comandă: salvare automată izolată în local storage, restaurare la redeschidere/reîncărcare, status vizibil; draftul nu creează evenimente și nu atinge jurnalul Core.
- Buton „Șterge draft” cu confirmare pentru text existent și mesaj clar că ștergerea nu afectează evenimentele.
- Template-uri rapide inserabile în câmp: Observație, Verificare, Mutare, Vânzare. Inserarea nu execută și nu confirmă operații.
- Teste E2E noi pentru autosave/restore/clear și pentru inserarea template-ului fără commit de eveniment.
- Anularea alarmelor cere confirmare înainte de a apela pluginul nativ; test suplimentar verifică faptul că o eroare a pluginului păstrează alarma în lista locală.
- Verificare CI la momentul checkpointului: build mobil și Cloud API pe HEAD 43ed76b erau queued/pending; Quality suite queued. Rulările anterioare au fost anulate automat de push-uri succesive, deci nu sunt verdict. Așteaptă verdictul pe ultimul SHA înainte de următorul batch de push-uri.
- HEAD curent la momentul checkpointului: 43ed76b6517221101e1336b6adf44ac1a9b9248b pe branch feature/openai-provider-integration; PR #55 draft, fără merge.
- Următorul batch: testează CI; dacă apare fail, repară înainte de a continua. Apoi adaugă feedback/claritate la starea recorderului și revizuirea comenzii, teste E2E pentru cazurile de draft și microfon, și hardening reminder UX.


## Batch suplimentar Work — etichete audio și template-uri corecte (2026-11-25)

- Înregistrările audio pot primi un titlu personalizat, fără redenumirea sau modificarea fișierului audio. Metadatele titlului sunt păstrate în indexul nativ/local; listarea arată titlul și data/durata/dimensiunea.
- UI adaugă acțiunea „Redenumește” cu validare 1–100 caractere. Redarea și ștergerea rămân separate.
- Test native-store verifică persistența titlului și integritatea fișierului audio.
- Template-urile rapide au fost aliniate la sintaxa parserului local: Observație, Atribut și Vânzare; nu mai oferă texte „Verificare” sau „Mutare” care parserul local nu le recunoaște.
- E2E verifică existența template-urilor pentru atribut/vânzare și că inserarea textului nu produce eveniment.
- Nu se face merge. Așteaptă CI pentru HEAD-ul cel mai nou; mai multe push-uri anterioare au anulat joburile vechi.


## Work batch — etichete înregistrări și audit implementare (2026-11-25)

- Înregistrările audio au titluri personalizabile, păstrate ca metadate. Funcția rename este implementată atât în store-ul web, cât și în indexul nativ SQLite/storage; fișierul audio nu este redenumit sau rescris.
- Butonul UI „Redenumește” permite editarea titlului; titlul este validat la 1–100 caractere.
- Test pentru native-store verifică rename și faptul că fișierul rămâne intact.
- În auditul codului am corectat implementarea inițială incompletă: rename nativ a fost adăugat explicit în adapter, nu doar expus în API.
- Template-uri Work verificate și aliniate la sintaxa parserului local; Observation/Attribute/Sale.
- HEAD la checkpoint: 369f53c33fca0eacc94350bb4a8fc926c5a40a7d. CI pe acest HEAD era pending la momentul salvării. Așteaptă rularea pe HEAD curent, apoi verifică logs dacă orice job eșuează.


## Work batch — snooze pentru alarme (2026-11-25)

- Reminder-urile pot fi amânate din listă cu +10 minute sau +1 oră.
- Snooze creează și programează reminderul nou, apoi anulează reminderul original; dacă anularea originalului eșuează, încearcă să anuleze noul reminder și păstrează eroarea explicită.
- Duratele sunt allowlist 5/10/30/60 minute în service (UI expune 10 și 60); duratele invalide sunt respinse.
- Teste unitare pentru înlocuirea alarmelor și respingerea delay-ului invalid. Fixture-ul folosește ID-uri deterministe unice pentru a evita coliziunile.
- HEAD curent: 1eecbaa7027d0c97cc35be26aac64496553e783f. Android build era in progress, Quality suite pending; iOS jobul unei rulari a fost anulat de push ulterior. Nu se marchează CI verde până la verdictul pe HEAD final.


## Batch Work — integrity audit, draft/preview and voice UX (2026-11-25)

- Audit post-implementation found accidental literal escaped newlines in several files introduced by earlier patch batches; repaired actual syntax in audio-store API, reminders snooze function, and appended tests. Also corrected whitespace regex in E2E responsive tests.
- Work text edits now invalidate any pending Core preview, preventing confirmation of a stale interpretation after the command changes.
- Voice session interim text, final transcript, and one-shot dictation dispatch the input event so local draft autosave receives voice-captured text too.
- Added E2E coverage for autosaving text injected by voice capture.
- Reminder snooze tests were repaired to normal source newlines and now exercise deterministic IDs.
- CI is running on current HEAD f79b96912c9a50db74d58c5138ac75c819a44080; no pass/fail verdict yet. Wait for Quality and Android/iOS mobile build. Cloud API workflow may not be triggered by every frontend commit; monitor run availability.
- Current HEAD: f79b96912c9a50db74d58c5138ac75c819a44080. Branch feature/openai-provider-integration, draft PR #55. No merge.
- Next: inspect CI logs/results; fix failures. Continue Work-focused tasks: recorder recovery and recording-list UX; then reminder consistency; keep Think deferred.

## Work batch — recorder recovery checkpoint (2026-11-25)

- CI triage found 42 Playwright E2E failures caused by a JavaScript syntax error in the modal focus-trap line; this cascaded into app.js not loading. Fixed the missing bracket and pushed commit `7b6ba328`. The failure was not 42 independent product regressions.
- Native recorder now has an explicit persisted checkpoint API planned/implemented in `native-audio-recorder.js`: pending session key `collector_audio_pending_session_v1`, checkpoint saved before native start, restore on app initialization, and explicit completion after audio metadata commit.
- Work UI adds a recovery button to all three HTML entry points. It is only surfaced when a checkpoint is found; recovery is user-triggered, not automatic.
- Recovery path can reuse an already-copied private audio file if the previous stop succeeded but metadata/index commit failed.
- Unit tests added for checkpoint persistence, reinitialization recovery, recovery failure retaining the checkpoint, and already-copied file salvage.
- Important: latest CI is still pending/in-progress and must validate the newest HEAD. Cloud API, Quality Suite, and Mobile Build need full status confirmation; prior failing Quality run is explained by the app.js syntax error.
- Current branch remains `feature/openai-provider-integration`, PR #55 draft. No merge, deployment, or real purchase tests.

Next:
1. Verify latest CI after this batch, inspect any new failures.
2. Complete audio list UX (playback controls, metadata, rename/delete, recovery status) and tests.
3. Review native lifecycle and platform limitations; interruption recovery is best-effort because native plugin behavior after OS process kill needs real-device validation.
4. Keep Work as priority; Think stays deferred.

## Work batch — recoverable native audio (2026-11-25)

- Fixed the modal focus-trap syntax error in `app.js`; the prior 42 Playwright failures were a cascading startup failure, not independent regressions.
- Native recorder now checkpoints a session before calling the plugin, restores checkpoint on app initialization, and retains checkpoint after recoverable failures.
- Added explicit “Recuperează înregistrarea întreruptă” UI across all 3 entry points; no auto-finalization.
- Recovery can salvage an app-private file that was copied before the previous metadata/index commit failed.
- Metadata is committed before checkpoint removal; normal stop and explicit recovery clear the checkpoint only after audio-store save succeeds.
- Tests added: checkpoint-before-start, restore/recover after reconfigure, retry checkpoint retention, salvage of an already-copied file.
- Code audit caught and repaired patch-format mistakes (escaped source newlines) and a local-variable scope issue before relying on CI.
- Current HEAD: `780e59c00b6db4558037c655d9e4f32a34bc5657` before the last fixes; commits after it are in branch history. CI runs were cancelled by rapid pushes; latest HEAD needs a fresh complete CI result.
- Caveat: recovery after OS process termination depends on the native recorder plugin still exposing a stop/recovery URI or the app-private copied file. This is best-effort until validated on real Android/iOS devices.

## Work batch — browser recorder recovery and finalization UX (2026-11-25)

- Browser MediaRecorder now creates a recoverable IndexedDB session before starting capture.
- Audio chunks are written incrementally to a dedicated `recording_chunks` object store with a session/sequence index; long sessions no longer rewrite a growing full-chunk array each second.
- Final stop writes the normal recording first and removes the temporary checkpoint only after the final save succeeds.
- Startup detects both native recorder checkpoints and browser IndexedDB sessions. The same explicit Recover button handles either path; no automatic finalization or Core journal event is created.
- Browser recovery reconstructs the Blob in sequence order, saves it as a normal local audio recording, then clears temporary chunks.
- Background visibility copy now explains that captured chunks are persisted periodically but OS/browser suspension can still interrupt microphone capture.
- Stop failure, empty blob, and checkpoint-cleanup failure paths now expose recovery or a clear warning instead of hiding recoverable data.
- Native storage delegates browser checkpoint methods to the legacy IndexedDB store when the native recorder plugin is unavailable.
- Regression coverage: E2E exercises browser chunk persistence, reload detection, explicit recovery, recovered Blob content/duration, cleared checkpoint, and unchanged Core event journal. Native adapter delegation unit test added.
- Latest inspected HEAD before this checkpoint: `19a9e7272658f8794482fcf59d4caca42885c8c1`. Cloud API passed. Quality suite had passed Node/Core/property/Replay/benchmark stages and was running Chromium E2E; Mobile Build was queued. CI results are not yet final.
- Previous quality failure on `4ca2f400` was only a test expectation mismatch (11-byte fixture vs expected 12); the assertion was corrected to 11.
- Do not mark the current batch as fully validated until Quality Suite and both Android/iOS builds complete on the newest HEAD. PR #55 remains draft; no merge or production deployment.

Next actions:
1. Follow the newest HEAD through complete Quality Suite, Android debug APK, iOS simulator build, and Cloud API CI.
2. Inspect Playwright errors/logs if the new interruption-recovery E2E fails; fix root cause and retain regression coverage.
3. Finish audio list UX audit (playback focus, rename/delete while playing, recovered-file labels) and verify long recordings on real devices.
4. Continue reminders/local-notification consistency and Work-first accessibility; Think remains deferred.


## Hardening audio storage — 2026-11-25

- Added validation before deleting a native audio file from its metadata index: only files under `collector-audio/` with a simple allowed filename and `.aac`/`.webm` extension can be deleted.
- Invalid/corrupted metadata paths now fail safely and preserve both the metadata row and the target file rather than passing an arbitrary path to the native Filesystem plugin.
- Added regression test in `test-audio-store-native.js` for traversal-style corrupted paths.
- Commits: `634c23b9968984b9b4689e0fd6f788f4141afec7` (guard) and `5fa579964d4c1a7cf64c9d31921015ce51472d06` (test).
- CI workflow runs/status were not yet returned for this latest HEAD at the time of checkpoint; do not consider the change validated until the Quality/Mobile/Cloud checks finish.

- Follow-up: the same path validator is now applied when saving native metadata, preventing an unsafe path from entering the index through `saveNative`; regression coverage was added for this input as well. Latest commit: `3a6d43532f88ed626c241a5bf0da126ca192c07a`.


## Native playback lifecycle fix — 2026-11-25

- Found a lifecycle inconsistency during Work audio audit: the normal native recording stop path attached the playback URI directly to the `<audio>` element without registering the active record ID in the shared playback helper.
- Consequence: deleting that just-saved native recording while it was playing would not invoke the cleanup path for the active player.
- Fixed normal native stop to call `setAudioPlayback(record.id, nativePlayableUrl)`; this centralizes detach/revoke and tracks the record ID.
- Added static regression coverage to `test-mobile-build.js` asserting native stop uses the shared lifecycle helper.
- Commits: `87d51d74fef769ad9fee877b4e0b034f98e6e1ee` and `ac5f66d693f28d5c9a504e8787381165eac98d6d`.
- Await CI verdict on the latest HEAD; no merge/deploy.


## Work draft autosave race fix — 2026-11-25

- Found a race where quick typing followed by clearing could let an earlier asynchronous `writeRaw` finish after the `removeRaw`, resurrecting stale draft text on next launch.
- Draft persistence now serializes write/remove operations through a promise queue; clearing is enqueued behind pending autosaves, and version guards continue to protect status/restore updates.
- Added regression/static coverage to `test-mobile-build.js` for queue ordering and clear-after-pending-write behavior.
- Commit: `720b4a48fc2da6a214926884c221a9de3f86b640` (implementation), `2298812ecfd4a37212604493058b0d4575dc8e70` (test).
- CI has not yet been confirmed for the latest HEAD.


## Reminder initialization retry fix — 2026-11-25

- Fixed a retryability issue: reminder initialization previously marked itself complete before verifying the UI and successfully constructing the notification service. A transient storage/plugin setup failure prevented a later retry.
- Initialization now marks completion only after successful service setup; absent UI is not consumed, and unsupported web contexts remain intentionally disabled.
- Added regression coverage in `test-mobile-build.js`.
- Commits: `964b064f16e7b481bff852b8300d790a81d14bf6` (fix), `30787fce7d605db9743637b6dc5171de3cd2b8c4` (test).
- Await CI for latest HEAD.


## Reanaliză CI și remediere — 2026-11-25

- CI pentru HEAD `3739fc3e` a eșuat în 2 verificări statice: testul draft-clear căuta forma textuală `++writeVersion;`, dar implementarea corectă folosește `const version=++writeVersion;`; testul de retry reminders găsea primul `initialized=true` din ramura web, nu marcarea după setup-ul nativ.
- Logurile arată că aceste două aserțiuni sunt cauza eșecurilor Quality, Android și iOS; cele 197/199 teste din suitele mobile au trecut. Build-urile native au fost oprite înainte de compilare deoarece step-ul de wiring a eșuat.
- Corectate testele ca să verifice ordinea reală în handler și în blocul de setup nativ, fără a schimba logica aplicației. Testul draft verifică și că ștergerea este serializată în queue.
- Commits: `d2e60d9` și `e5d0d14`. CI pentru noul HEAD trebuie confirmat înainte de a considera blocajul rezolvat.
- Următoarea prioritate după CI: dependențe mobile reproductibile (declarate în package/lockfile), evaluarea SQLite encryption at-rest și testare pe device real. Nu există încă release build semnat sau configurare production.


## Hardening toolchain CI — 2026-11-25
- Pinned versions of the Capacitor/native/auth/billing build toolchain were previously duplicated across Android and iOS workflow commands.
- Centralized the shared, exact-version install command in `package.json` as `mobile:install-toolchain`; platform-specific Android/iOS packages remain installed separately in each job.
- CI workflow now invokes the shared script on both platforms; regression test checks shared pins and workflow wiring.
- This reduces drift between platforms but **does not yet make the native toolchain lockfile-reproducible**: installation still uses `--no-save --no-package-lock`. Next: safely generate and validate a lockfile containing native toolchain packages (npm ci on clean runners), after CI confirms this centralization change.
- Commits: `e1d7f3e` (package script), `379628f` (workflow), `38cefe0` (test).


## CI regression fix — 2026-11-25
- CI on HEAD `6270ba0` exposed the same single regression in Quality Suite and Android's pre-build verification: the Work draft clear handler incremented `writeVersion` only after checking whether the input was empty, while the invariant/test requires invalidating pending restore/autosave work immediately on any clear click.
- Fixed in `app.js`: `const version=++writeVersion;` now runs before the empty-input branch. Both empty and confirmed non-empty clear paths use that same version token; serialized removal remains unchanged.
- Commit: `d90600fe63cacb0c7c318e90f7f6f9901ab58712`.
- Rerun CI is required before marking green. The prior Cloud API run passed; Android and iOS are still pending/failing at the test gate, not at native compilation.


## Mobile CI fix — 2026-11-25
- Latest Android build failed at `npx cap add android` with `npm error could not determine executable to run`. Log evidence: shared toolchain install added 140 packages, then the separate platform install removed 137 packages. This pruned the local Capacitor CLI before `npx cap` ran; the failure was caused by sequential `npm install --no-save` invocations, not the native project code.
- Fix: install both `@capacitor/android@8.6.2` and `@capacitor/ios@8.6.2` in the same `mobile:install-toolchain` invocation; remove second platform install from each workflow; explicitly check local `./node_modules/.bin/cap --version` and use the local binary for add/sync. Regression coverage verifies pins and rejects sequential platform-install commands.
- Commits: `5f13c4e` package toolchain, `7bb7618` workflow, `d28d366` regression test.
- New CI must validate this fix; no local execution is claimed.


## CI regression fix — mobile toolchain test scoping — 2026-11-25
- The rerun after the Work draft fix exposed a test-only ReferenceError: `androidSection` was referenced before initialization in `test-mobile-build.js` while checking iOS shared-toolchain pins.
- Corrected the test by defining the Android workflow section before assertions. This does not change runtime/build configuration.
- Commit: `e8f61e4fec122931b66841ecd147bda8f30b8744`.
- New CI run required; previous quality run failed only at this test after the Work draft regression test passed.


## CI regression fix — duplicate Android test section declaration — 2026-11-25
- On HEAD `9277a3397b3f8c93bd04edd2f4eb9f922724a5bc`, Quality Suite failed at `test-mobile-build.js` with a SyntaxError: `androidSection` declared twice. Both Android and iOS build jobs stopped at the shared test verification step, before native compilation. 189/190 tests passed; the failing test file could not load.
- Cloud API workflow completed SUCCESS.
- Removed the stale duplicate declaration and redundant assertion. The correct Android section is already sliced between the Android job and iOS job, and the actual workflow wiring assertions remain.
- Fix commit: `a7ddc62fa2ad506e472590315c532d106c1e6398`.
- No runtime code or native build configuration changed. CI must re-run on this HEAD; no local execution is claimed.


## CI regression fix — Work draft clear redeclaration — 2026-11-25
- Quality Suite run `45677381070` failed in Playwright Chromium: 41 E2E failures and 3 passes. Browser console root cause was a JavaScript parse error in `app.js`: `Identifier 'version' has already been declared` (the clear handler declared the same const twice). The broad E2E failures were cascading because app.js did not load.
- Fixed by removing the duplicate declaration after confirmation and reusing the incremented version token created at the start of the clear handler. This preserves the draft autosave race protection.
- Added a Node test in `test-mobile-build.js` that parses the full `app.js` with `vm.Script`, catching syntax errors before browser E2E/native build wiring.
- Commits: `17989d6e831601e3d1904a811b1b95531e9da91d` (app fix), `cb247f3261a90227247b9b45c71fec64fbd5add5` (syntax regression test).
- The previous HEAD `c9f3e63369af872e1d6fa1445a7305c1be52f12f` had Cloud API SUCCESS and Android+iOS Mobile Build SUCCESS; only Quality Suite failed due app.js syntax error.
- New CI must validate latest branch HEAD. No local npm/E2E run is claimed. PR #55 stays draft; no merge/deploy.


## Continuare development — prioritizare pre-launch (2026-11-25)

- PR #55 este OPEN/DRAFT, base main, fără merge; branch `feature/openai-provider-integration`.
- HEAD verificat înainte de acest batch: `01ef1539e6735525b6c49ab58a164ab43bb266a4`.
- CI pentru acel HEAD: Cloud API run 443 SUCCESS; Quality Suite run 1685 SUCCESS; Mobile Build run 789 SUCCESS (Android și iOS joburile workflow au trecut). Aceste rezultate sunt pentru SHA-ul de mai sus.
- Reanaliza checklist-ului de lansare confirmă blocker-ul tehnic P0: SQLite at-rest encryption. Adapterul deschide DB cu encrypted:false; Capacitor config are androidIsEncryption/iosIsEncryption false. Nu activăm flagurile direct, deoarece instalările existente au DB plaintext și conversia greșită poate bloca accesul la date.
- Am creat `collector-v11/SQLITE-ENCRYPTION-MIGRATION-PLAN.md` cu auditul API SQLCipher și etapizarea: secret per-install criptografic random în secure store, new-db encryption, migrare plaintext recoverable/backup, marker de migrare crash-safe, Core validation/replay, fail-closed la secret lipsă/invalid, și teste fizice Android+iOS. Checklist-ul de lansare a fost actualizat să trimită la acest plan.
- Documentația pluginului confirmă SQLCipher AES-256 și API-uri secure-secret / encryption conversion. Config rămâne dezactivat până când bootstrap+migrări și testarea fizică sunt implementate.
- Commit-uri de documentare: `5ebb5bb9a44d776d8b64d26b15e9c99e858f1a31` (plan) și `cc01ac1567e265a4d4b6241f5ce5120f678e3288` (checklist). Aceste commits sunt în branch și trebuie verificate CI pe noul HEAD.
- Următoarea implementare: Stage A — teste state-machine/mock pentru bootstrap criptat și migration states, fără toggling encryption; apoi Stage B implementare guarded. Nu configura Supabase/RevenueCat, nu deploy, nu merge, nu schimba secrete fără aprobarea utilizatorului.


### Stage A encryption guard implemented (2026-11-25)
- Added pure classifier `classifySQLiteEncryptionState` in `storage-adapter.js` without changing runtime SQLite initialization or encryption flags.
- Fail-safe states: new DB → create-encrypted; encrypted DB with secret → open-encrypted; encrypted DB without secret → recovery-required; plaintext DB → convert-existing and requires verified backup; incomplete/unknown state → inspect-required.
- Added four regression tests covering the state table. This is preparatory safety logic, **not encryption implementation** and not validated on native devices.
- Commits: `5d7abf87856744117b6562dd1f28c1fee9920f4b` (classifier), `ba7d3c9b5e6cd40edbc001ee77a2e25244b0aafd` (tests).
- CI must run on newest HEAD; Stage B remains blocked on plugin-specific backup/convert API verification and physical-device migration tests.
\n\n### Stage B SQLite encryption bootstrap implemented (2026-11-25)\n- Added `sqlite-encryption-bootstrap.js`: cryptographically random 256-bit per-install passphrase via Web Crypto, secure-store write and verification, encrypted creation for a new database (`mode: secret`), and guarded opening of existing encrypted DBs only when the plugin secure store reports a secret.\n- Existing encrypted DB with missing key fails closed; existing plaintext DB fails closed and is left untouched. **In-place conversion intentionally not implemented** until a verified backup/export + restore path and Core validation are wired; this avoids risking existing user data.\n- Added opt-in feature gate `CollectorConfig.sqliteEncryptionEnabled` (false) and passed bootstrap into the SQLite adapter. Capacitor Android/iOS encryption flags remain false; bootstrap is dormant by default and would fail safely if incorrectly enabled before platform config.\n- Added 8 regression tests in `test-sqlite-encryption-bootstrap.js`: new encrypted DB/secret, secure-store verification failure, existing encrypted DB, missing secret, plaintext refusal, crypto unavailable, adapter integration, and fail-closed adapter behavior.\n- Added script loading in index, updated migration plan and launch gate.\n- Commits: `224de95`, `88a5083`, `220631f`, `22abb37`, `da31273`, `129d67f`, `3aa4100`, `8aec747`, `8c84065`, `d659287`, `0e7a9ed`.\n- Latest HEAD: `0e7a9ed3156453605eb6afbd1731947e251a559d`. CI queried for this HEAD but returned no workflow runs or combined statuses yet; do not claim green.\n- Remaining Stage B/C work: verified plaintext conversion/recovery implementation and native plugin config/test; run regression suite and CI. Physical Android+iOS validation remains a release gate.\n\n\n### Stage B migration implementation update (2026-11-25)\n- Implemented the safe plaintext DB conversion path in `sqlite-encryption-bootstrap.js`: read `collector_kv`, persist a versioned temporary snapshot in localStorage, verify exact read-back before conversion, generate/store the secure key if missing, convert with plugin `mode:'encryption'`, verify `isDatabaseEncrypted`, compare all key/value rows, transactionally restore from snapshot if mismatched, and remove the temporary backup only after successful verification.\n- Crash recovery: if a migration backup is present and the DB is already encrypted, compare rows and restore transactionally from the backup if needed, then remove the backup after verification. If conversion fails, the snapshot is preserved. If storage quota/write/read-back fails, conversion is not attempted.\n- Adapter initialization now actually invokes the bootstrap when `requireEncryption` is enabled, verifies native config encryption is enabled, refreshes any existing connection, creates/open encrypted mode, and verifies encryption after open. Fixed the earlier missing `encryptionState` initialization/wiring bug.\n- `createAutoStorageAdapter` refuses web plaintext when encryption is required. Feature gate remains OFF and Capacitor config flags remain OFF.\n- Tests expanded to cover safe migration, backup write failure, conversion failure with retained backup, interrupted migration recovery, adapter migration, config gate, encryption post-open verification, and web fail-closed.\n- HEAD at checkpoint: pending CI query. Physical-device tests remain mandatory; the temporary migration backup is plaintext in localStorage while migration is pending, and its crash/quota/cleanup behavior must be validated before enabling.\n\n\n### Stage B follow-up — legacy source migration + Core-gated cleanup\n- Plaintext SQLite conversion backup now captures the complete `collector_kv` key/value snapshot plus legacy Collector-prefixed localStorage values (excluding `collector_cloud_opt_out`). Existing SQLite values win key conflicts.\n- New encrypted DB initialization also imports legacy localStorage data if present, preventing the empty-new-DB case from leaving the user's old v6/v7 data stranded in plaintext storage.\n- Recovery from an interrupted migration restores the merged snapshot transactionally and verifies it. The temporary backup remains until `loadDb()` validates/replays the imported Core state. The app then calls `completeEncryptionMigration()`, which removes only legacy keys whose values still match the captured snapshot and removes the backup marker.\n- Found and fixed a mobile packaging blocker: `sqlite-encryption-bootstrap.js` was missing from `build-mobile.js` allowlist, and the SQLite plugin bridge insertion marker still referenced storage-adapter v0.1 while index used v0.2. Both fixed; mobile-bundle regression assertions added.\n- CI on earlier HEAD `17b1d611` identified three test assertion/mock failures; two were corrected, then a case-sensitive assertion corrected. Latest quality run is pending on the current checkpoint SHA; previous failure details were test-only assertions, not runtime implementation failures.\n- The migration temporary backup is plaintext in localStorage during the migration window. Encryption feature gate and Capacitor native flags remain OFF. Physical-device crash/recovery/quota tests and Core replay validation remain release gates.\n
## Salvare checkpoint — Stage B SQLite encryption (2026-11-25, continuare)

- HEAD nou: `53adc4f0d5f297e7a00b8b7df3b982390d0d13fa`.
- PR #55 rămâne draft, deschis, fără merge/deploy.
- CI pe HEAD anterior `a2128c679fd594c75e9b704dab520501ad3f90cd`: Cloud API SUCCESS; Quality și Mobile build erau încă în progres la verificare.
- Audit suplimentar Stage B: bootstrap fail-closed, snapshot read-back, conversion verify, KV read-back, recovery transactional și cleanup după Core import/validation.
- Teste regresie adăugate: backup corupt trebuie să blocheze DB open fără să altereze backup; cleanup nu trebuie să șteargă legacy key schimbat după snapshot; cloud opt-out rămâne intact.
- Aceste teste noi sunt încă în CI; nu le marca validate până la run complet SUCCESS.
- Feature gate și config encryption rămân OFF. Nu activa criptarea înainte de validare Android/iOS pe dispozitive reale și scenarii de crash/restore.
- Următorul pas: verifică CI pentru HEAD nou, remediază eventuale eșecuri, apoi continuă Stage C cu plan/test harness pentru validare native și audit de dependențe reproducibile.

## Checkpoint continuare — CI regression fix (2026-11-25)

- HEAD: `0db890e39dada8832ffcb7e700d09111ea298b2c`.
- CI a descoperit o eroare exclusiv în assertion-ul testului pentru backup corupt: fixture-ul era `'{broken-json'`, dar testul compara cu un șir care avea o acoladă suplimentară. Assertion-ul a fost corectat; logica bootstrap-ului nu a fost schimbată.
- Cloud API pentru HEAD nou: SUCCESS.
- Quality Suite: în curs.
- Android debug APK + iOS simulator build: în curs.
- Run-urile de pe commitul precedent au fost superseded/cancelled după noul commit; nu sunt considerate failures ale buildului final.
- Criptarea rămâne gated OFF.


## Checkpoint — full CI pass + launch checklist reconciliation (2026-11-25)

- Verified all three current workflow runs on HEAD `d3bd4e543bc18f5beef3b166e0d6269f32aeaa17`: **Cloud API SUCCESS, Mobile build SUCCESS (Android debug APK + iOS simulator app), Quality Suite SUCCESS**. No cancelled workflow is being used as validation evidence.
- PR #55 remains open, draft, mergeable, and not merged. No production deploy or store release.
- Updated `LAUNCH-READINESS-CHECKLIST.md` to reflect that RevenueCat client, webhook, entitlement and usage-metering code are implemented in this branch; external project configuration and sandbox validation remain outstanding.
- Latest documentation commit: `0026ba9486c2cb2ebaa650c75209f8bc9a84620c`; its CI must be rechecked before treating the documentation-updated HEAD as the final validated SHA.
- Priority next: (1) poll CI for documentation commit; (2) inspect and reconcile dependency reproducibility—the mobile toolchain is pinned by install command but is not fully represented in the project lockfile; (3) create a release build pipeline without secrets; (4) continue physical-device validation planning, encryption gate remains OFF; (5) only then external staging/Supabase/RevenueCat setup.
- Do not ask the user for secrets in chat, do not enable encryption, merge, deploy, or publish without explicit approval.


## Checkpoint 25 nov 2026 — continuare după CI verde
- HEAD anterior verificării: `fa8f49d7fea0531459ac6c525f456d5b1d773204`.
- Cloud API, Quality Suite, Android debug APK și iOS Simulator build au trecut SUCCESS pe același SHA.
- Actualizat launch checklist cu această verificare și cu blocker-ul de reproducibilitate al toolchain-ului nativ.
- Auditul `test-mobile-build.js` confirmă testele existente pentru allowlist-ul bundle-ului, absența server/.env/test files, config mobil, wiring pluginuri, Work-first layout și regresii pentru draft/audio/reminders.
- **Următorul blocker tehnic:** dependențele Capacitor/native sunt instalate cu scriptul `mobile:install-toolchain` prin `npm install --no-save --no-package-lock`; versiuni directe sunt pin-uite, dar lockfile-ul nu fixează întregul graf tranzitiv. Nu modifica manual lockfile. Soluția trebuie generată și verificată cu npm într-un mediu real, apoi `npm ci` + toate workflow-urile.
- PR #55 rămâne draft; fără merge/deploy/publicare.


## Checkpoint — CI permissions hardening
- Audit workflows: Quality și Mobile declară `permissions: contents: read`.
- Cloud API workflow nu declarase permissions explicite; actualizat să folosească `permissions: contents: read` (least privilege).
- Commit: `e968af9f957e68148090024090702c5bbd4c80ed`.
- Pe commitul `cd739aee`, Cloud API, Quality Suite și Mobile Build (Android debug + iOS simulator) au trecut SUCCESS.
- Commitul de hardening va fi verificat de CI; următorul audit se concentrează pe reproducibilitatea dependențelor, deployment/release și testele native.


---
## Checkpoint — 25 noiembrie 2026

### CI verificat
Repo: `davidlucian-ioan/Aplicatie`, branch `feature/openai-provider-integration`, PR #55 draft.
Commit testat `aa2b368361d0e953a55dd8af08f0ff2553ad3e63`:
- Quality Suite SUCCESS — run `45702294884`
- Cloud API SUCCESS — run `45702295443`
- Android debug APK + iOS Simulator SUCCESS — run `45702294870`
Cancels de concurrency sunt superseded, nu failures.
Checklist-ul de lansare a fost actualizat în commit `63975777d7157926ccc01e04f8045f75ad074c2b`.

### Lucru recent
- Workflow Cloud API: explicit `permissions: contents: read`.
- Mobile bundle regression test: scană string-uri/pattern-uri pentru OpenAI key, Supabase service-role, RevenueCat webhook secret și fixtures server-only.
- Launch readiness checklist reflectă CI verde și blockerii reali.
- CI produce Android debug APK și iOS Simulator app, nu release builds semnate.
- Toolchain Capacitor/pluginuri este instalat prin `npm install --no-save --no-package-lock`; versiuni directe pin-uite, dar tranzitivele nu sunt lock-uite. Nu fabrica manual lockfile; generează-l cu npm într-un mediu real, apoi validează `npm ci`.
- Workflow vechi `.github/workflows/import-collector-v11.yml` are `contents: write`, checkout cu credentials persistente și commit automat. Necesită audit; nu a fost modificat.

### Blockere de lansare
**P0 beta:** Supabase real + Auth + migration/RLS/RPC + staging; Cloud API HTTPS/secrets/CORS/monitoring/spend limits; OpenAI provider și cost config; RevenueCat products/entitlement/webhook + sandbox purchase/restore/renew/cancel/refund/expiry/billing issue/grace/account recovery; Privacy/Terms finalizate (operator/contact/retention/subprocessors/GDPR); test account deletion; testare fizică Android/iOS (migration, upgrade/restart, storage full, recording/background/interruption/Bluetooth/playback/notifications); manual acceptance.

**P1 store:** lockfile/toolchain reproducibil; Android signed AAB + Play App Signing; iOS signed archive/IPA + provisioning/TestFlight; bundle secret audit complet; listing/icon/screenshots/privacy labels/support/deletion URLs; monitoring, cost alerts, backup/restore, rollback.

**Limitări:** fără sync multi-device/cloud backup; SpeechRecognition nu e universal/offline garantat; background recording nu e garantat înainte de validarea native; AI doar propunere + confirmare; SQLite encryption gate OFF (temporary plaintext snapshot în localStorage, teste fizice/crash/quota/key lifecycle/replay necesare); RevenueCat Restore Behavior Keep with original App User ID până transfer handling validat.

### Next steps autonom
1. Poll CI pe HEAD actual.
2. Auditează workflow import `contents: write` (branch trigger, archive handling, permissions/credential persistence) și hardening safe.
3. Continuă audit toolchain/release reproducibility.
4. Verifică allowlist/bundle și workflow permissions.
5. Doar schimbări safe, non-destructive și testabile; CI și checkpoint după progres.
6. Fără merge/deploy, activare encryption/billing, signing secrets sau publicare fără aprobare.

Checkpoint-ul trebuie actualizat după progres semnificativ și înainte de limita chatului.


## Continuare — audit workflow cu contents:write (25 nov 2026)

- HEAD: `570b694a189a5c587cab5f1044d37003976571b0`.
- PR #55 rămâne draft; nu merge/deploy.
- Workflow-ul legacy de import v0.7 a fost harden-uit:
  - permisiunea globală este `contents: read`; `contents: write` este limitată la job-ul care efectuează commit/push;
  - branch-ul țintă este verificat explicit înainte de push;
  - ZIP-ul este verificat înainte de extragere pentru path-uri absolute, traversal (`..`), backslash și symlink-uri;
  - checkout curățat (`clean: true`) și commit doar dacă există modificări staged.
- Commit workflow: `fb2b3f700fda0d8bd1ced4a6237c74ac9f32a061`.
- Workflow Quality Suite a fost extins să pornească și la modificarea workflow-ului de import, astfel încât următoarele schimbări să primească CI: commit `570b694a189a5c587cab5f1044d37003976571b0`.
- La checkpoint, run-urile pentru HEAD nou nu apăruseră încă. Nu considera această modificare CI-validated până nu apare și trece Quality Suite.
- Auditul a confirmat că workflow-ul de import este branch-scoped, trigger-ul nu urmărește commit-urile produse în `collector-v11/`, iar push-ul este către branch-ul sursă dedicat, nu `main`.

### Următorii pași
1. Confirmă Quality Suite SUCCESS pe HEAD `570b694a...`; dacă eșuează, examinează logurile și repară.
2. Verifică din nou CI complet pe PR #55 după următoarele modificări care ating codul mobil/cloud.
3. Continuă lockfile/toolchain reproducibility și pipeline de release semnat (fără secrete), fără a crea/folosi signing secrets.
4. Păstrează gate-urile: encryption OFF, PR draft, fără merge/deploy/billing real/publicare.


## Checkpoint — audit profesional SWOT + checklist (25 nov 2026)

- HEAD auditat: `d13b023b96e84dbdb0357f6b0978dd5382faccea`.
- PR #55 OPEN/DRAFT; fără merge, deploy sau release.
- CI same HEAD: Cloud API SUCCESS, Mobile Build SUCCESS (Android debug + iOS simulator), Quality Suite IN PROGRESS. Acest HEAD nu este încă full-green.
- Audit profesional consolidat salvat în `collector-v11/PRE-LAUNCH-SWOT-AUDIT-2026-11-25.md`. Include checklist verificat, SWOT, risk register, sprint priority și Definition of Done.
- Confirmări recuperate din repository și context anterior: Stage B encryption/migration code implemented but gate OFF; RevenueCat/entitlement/usage metering code implemented but not configured live/sandbox; Work/Think, audio native, reminders, SQLite, Supabase client, Cloud API și OpenAI provider în branch; sync multi-device și signed store builds lipsesc.
- Prioritate: Quality Suite green pe HEAD; apoi lock native toolchain/lockfile reproducible; apoi hardware/data-safety validation; external staging/billing; signed release + legal/store.
- Nu se activează encryption, billing live, deploy, merge sau publicare fără aprobarea utilizatorului.


## Checkpoint — product strategy workshop (25 nov 2026)

- Workshop simulat cu PM, IT/Architecture, QA, Finance și representative end user; nu sunt interviuri reale.
- Raport: `collector-v11/PRODUCT-STRATEGY-WORKSHOP-2026-11-25.md`.
- Decizie: Collector se poziționează ca personal collection operating system, universal, customizable, voice/photo-first capture, local-first, AI-assisted but user-confirmed. Diferentiatorul principal: captură în secunde + record trust + collection-native insights, nu chatbot și nu spreadsheet.
- Nu adăugăm major features până la P0 stability/release gates. Prioritate: CI/lockfile, hardware validation, data safety, onboarding, staging, billing sandbox, signed release/legal.
- P1 după stabilitate: Quick Capture, templates, smart search, duplicate detection, locations/containers, dashboard, import/export, bulk actions.
- P2/P3 candidate add-ons: AI enrichment w/source/confidence, collection assistant grounded in user records, advanced analytics, share pages, wishlist/budget, QR/NFC, collection packs, verified community data, market-data integrations, marketplace, shared collections, automations, scoped AI memory, API, offline AI, AR shelf mapping.
- Monetizare recomandată de testat: Free core + Pro convenience/advanced analytics/sync once built + optional AI credits only if unit economics require; Collection Packs later. No final prices before usage/cost testing.
- Competitor review done: iCollect Everything, Libib, Sortly, Notion/Airtable, Kolekto. Their baseline means generic catalog/custom fields/AI lookup are not enough; Collector's capture UX, local-first trust, universal templates, history/relationships and grounded AI must be distinctive.
- Next task: continue P0 implementation, starting toolchain reproducibility; separately design/prepare beta discovery interviews and UX acceptance tasks. No merge/deploy/publish without explicit approval.


## Product clarification from user — Collection Intelligence is standard/core

- Collection Intelligence is **not an add-on**. It is a core promise: Collector is an intelligent recorder + app-wide memory of what the user captured, said, changed, created and confirmed, retrievable later.
- Memory scope includes recordings/transcripts/summaries, collection/item changes, notes, reminders, decisions, confirmed AI actions and activity history, with source provenance.
- Proposed architecture discovery: append-only Activity/Event Ledger + derived Knowledge/Memory Index + temporal/source-grounded retrieval. Do not duplicate Core state; references to authoritative records and source IDs. Distinguish user-confirmed facts, direct user statements, inferred suggestions and system events.
- Recall answers must cite in-app source records/time/audio segments; show evidence and jump-to-source; if evidence is missing, state uncertainty. User controls review/correction/pin/exclude/delete/export; deletion propagates to derived index.
- Basic searchable memory/history is standard for all tiers; AI processing may have transparent usage limits, but don't paywall basic recall.
- Examples: “What did I do with this collection this month?”, “When did I move this item?”, “What did I say last time?”, “What reminders did I create?”, “Summarize everything about X with source moments.”
- Strategy document updated to reflect this. Next: inspect current event/data structures and design canonical memory ledger/retrieval without altering D-001–D-044 before impact review.


## Monetization strategy correction — trial-led paid subscription (26 Nov 2026)

User clarified the commercial direction: **not Free forever**. The strategy is to offer a generous full experience for a limited free trial so the user forms a recurring habit and experiences the lasting value of Collector's intelligent recorder and app-wide memory, then converts to a long-term paid subscription.

- Initial hypothesis: 30-day full trial; consider 60–90-day early-adopter campaigns as experiments, not default.
- During trial: Work capture, Collection Intelligence/recall, AI, reminders, history, insights and organization in one coherent experience, with fair-use/cost caps.
- After trial: preserve user data, ownership/access and export. A Basic fallback may retain local/basic access; advanced AI processing, premium insights and cost-intensive convenience can be subscription-gated. Exact Basic-vs-Pro boundary needs an audit and decision.
- Collection Intelligence remains CORE product positioning. Avoid selling it as a separate add-on; subscription pays for ongoing premium processing/advanced capability, not access to user's data.
- Subscription hypothesis: one primary Pro tier, monthly + discounted annual; pricing only after unit economics/conversion tests.
- Habit-loop design: capture -> organize -> retrieve/recall -> repeated usefulness. Trial conversion should be based on demonstrated value, contextual prompts, not manipulative nags.
- Measure activation (collection + 3 items + voice capture + successful recall), active days, capture/recall frequency, trial-to-paid, annual conversion, churn/refunds, AI/cloud cost and gross margin.
- **Impact audit required:** reconcile current RevenueCat, entitlements, usage metering, onboarding, paywall, trial/expiry, restore purchases, backend access and launch checklist before implementation. Trial must be store/server-authoritative and sandbox-testable. Do not activate live billing or deploy without approval.
- Strategy doc updated: `collector-v11/PRODUCT-STRATEGY-WORKSHOP-2026-11-25.md`.
- Next step: audit the actual branch implementation and update a gap matrix, then safely correct docs/tests/code as warranted. Do not assume current billing code matches this model.


## Monetization impact audit — initial repo/document review (26 Nov 2026)

- Updated the Product Strategy business-model section to remove the contradictory Free-forever recommendation and align with trial-led subscription.
- Launch checklist's P2 statement was updated to trial-led 30-day hypothesis, 60–90-day campaign experiments, one Pro monthly/annual hypothesis, Basic fallback definition and post-expiry data/export protection.
- The checklist documents RevenueCat client + webhook/entitlement/meters as implemented in PR #55, but external products/entitlement/offering/webhook and store sandbox lifecycle are still launch gates. **This is documentation evidence only; I have not yet inspected the actual billing code, paywall, onboarding, entitlement enforcement, or expiry behavior.** Connector code search returned no results, and direct git clone was unavailable in this environment; no code changes are made based on guesses.
- Next: inspect actual billing implementation and tests; map entitlement states (trial, active, grace/billing issue, cancelled-but-active, expired, restored, account recovery); verify trial authority and premium gates; create sandbox test matrix; then correct onboarding/paywall/expiry UX. Preserve data and avoid manipulative expiry messaging. No live billing/deploy/release.


## Trial support impact audit — existing billing foundation reviewed (26 Nov 2026)

- Read `collector-v11/MONETIZATION-AND-COST-MODEL.md`, `cloud-api/billing-service.js` and `cloud-api/migrations/001_billing_and_ai_usage.sql` directly.
- Existing backend checks active `pro` entitlement + expiry before AI usage, and SQL/webhook handles initial purchase, renewal, cancellation semantics, billing issue/grace, expiry/refund-related states as documented. Trial from store can likely map to active Pro entitlement while trialing; confirm with sandbox, not assumptions.
- No explicit trial-tier entitlement is needed as a first hypothesis; use one Pro entitlement with introductory offer if RevenueCat/store configuration supports the chosen trial and lifecycle. Store offer configuration and eligibility are external and unverified.
- Remaining product gaps: actual onboarding/paywall copy and trial disclosure, introductory trial setup, trial-expiry UX, Basic post-trial local/data/export behavior, trial quotas/fair-use, and sandbox lifecycle coverage.
- Updated monetization/cost model document with this impact audit: commit `1ec0eeab061a4a9801ec0c66435ba05eebcc11e0`.
- **No application code changed** because mobile paywall/onboarding and store configuration have not yet been directly inspected; avoid guessing paths/behavior. Next action is source-level audit of purchase/paywall UI and its tests, then implement the lowest-risk corrections and regression tests.
- Keep P0 launch priorities; trial monetization is now an explicit release requirement. No live billing/deploy/merge/publish.


## Continued trial-led billing implementation audit + first correction (26 Nov 2026)

### Verified source state
- PR #55 remains open and draft, targets `main`; latest inspected head is `8f5fcfce2dcda75af378c4d78a315119a527e755`. No merge/release.
- Directly inspected `collector-v11/subscriptions.js`, `collector-v11/test-subscriptions.js`, and relevant `app.js` subscription and AI-status UI.
- Existing subscriptions UI uses labels `Plan Free` and `Collector Pro activ`, but did not distinguish an active store introductory trial from a paid Pro subscription.
- RevenueCat active Pro entitlement can expose `periodType`; app now maps `periodType === 'TRIAL'` into explicit `isTrial` state and shows **Trial Collector Pro activ** with expiry when available. Paid Pro continues to show normal active label.
- Replaced subscription/AI-status UI's misleading `Plan Free` label with **Collector Basic**, explicitly explaining that local data and functions remain available and Pro offers AI/cloud. This is terminology alignment only; exact Basic capabilities and premium gates are not yet finalized.
- Added regression tests for trial entitlement and paid entitlement classification.

### Commits
- `3b7e048a81cd50af89970b5c974e716c73350ac6` — expose trial entitlement state
- `b8c20ad4080854c603531b2129dc9e0dbd5f468f` — trial vs paid entitlement tests
- `8f5fcfce2dcda75af378c4d78a315119a527e755` — align subscription labels to trial-led model

### Validation status
- GitHub status/workflow lookup for latest head returned no checks yet (empty results); therefore these changes are **not CI-validated** as of checkpoint.
- PR #55 metadata confirms draft status and explicitly requires full CI on latest HEAD plus external sandbox validation.

### Next actions
1. Run/await CI on latest head; if workflows don't trigger, investigate rather than claim validation.
2. Audit test/build effects and check whether RevenueCat SDK's actual entitlement `periodType` value is available in the pinned SDK/store sandbox; current classification is defensive and only marks `TRIAL` exact.
3. Add clear trial disclosure/offer terms to paywall/onboarding only after package metadata and platform offer details are verified; don't invent dates/prices/renewal terms.
4. Define post-trial Basic capability boundary and verify app local access/export are not disabled by entitlement expiry.
5. Continue P0 launch blockers and prepare store sandbox matrix. No production configuration, live transactions, deployment or merge.


## Continuare verificare trial UI + CI (26 nov 2026)

- Reconfirmat PR #55: OPEN, DRAFT, target `main`, mergeable; HEAD verificat `ee2660bca84a1685fa5c68a6fe009efb4c4a40b4` (635 commits / 73 files). Nu se face merge.
- CI pentru HEAD: Cloud API SUCCESS; Collector Quality Suite și Mobile Build sunt încă `in_progress`. Nu se declară validare completă până la ambele finalizate pe același SHA.
- Audit suplimentar al UI de abonament din `app.js`: există status Trial/Pro, Basic fallback, offering package buttons, restore și refresh. **Gap**: lista ofertelor afișează title + priceString, fără disclosure verificat pentru intro trial (durată, eligibility, preț după trial, auto-renew). Nu adăugăm copy de trial până când metadata reală din Store/RevenueCat este expusă și testată; evităm afirmații false despre eligibilitate sau preț.
- UI cere cont cloud recuperabil și email-confirmat înainte de cumpărare; Restore este disponibil după inițializarea entitlement-ului. Confirmarea pe store sandbox rămâne neefectuată.
- Următoarea direcție: monitorizează CI pe SHA exact; apoi audit și test pentru post-expiry Basic, offering metadata/trial disclosure și restore/account recovery. P0 rămâne physical-device validation, lockfile reproducibil, encryption migration gate, staging, legal/privacy și signed builds.
- Nicio configurare live, tranzacție reală, deploy, merge sau publicare.


## Trial classification edge-case tests (26 nov 2026)

- Added two regression tests in `collector-v11/test-subscriptions.js`: unknown/missing `periodType` must not be misclassified as trial; an inactive entitlement with `periodType=TRIAL` must not be reported as an active trial.
- Commit: `7b1701835630beaaf164b2c6d992c2be07d88548`.
- Await CI for this exact/new HEAD; tests are authored but not yet validated by workflow.


## Continuare: audit transparență AI și post-trial (26 nov 2026)

- CI la checkpoint anterior `cf43dc4`: Cloud API SUCCESS, Mobile Build SUCCESS, Quality Suite IN_PROGRESS; nu consideram quality validat până la final.
- Audit UI confirmă că AI trimite text + context allowlisted (max 150 entități, 100 definiții atribut), fără jurnalul de evenimente și fără audio. Totuși, această limitare nu era explicată suficient de clar înainte de utilizare.
- Actualizat disclosure în toate cele 3 entry points (native/index, server și double-click): audio original rămâne local; când utilizatorul alege AI, text și context limitat sunt trimise la Collector Cloud/provider; jurnalul complet și audio nu sunt trimise; rezultatul e propunere și salvarea necesită confirmare.
- Test nou în `test-ai-ui-wiring.js` verifică disclosure-ul în toate entry points.
- Commits UI: `31f48350`, `6e343a12`, `219f9482`; test: `e86fff0273e99de9045e095c59bfa81d25d29b02`.
- Următorul audit: post-expiry Basic, trial disclosure din metadata Store/RevenueCat, restore/account recovery și P0 release readiness. External sandbox/store configuration nu este verificată și nu se afirmă.


## Checklist actualizat și CI exact (26 nov 2026)

- Refreshed `LAUNCH-READINESS-CHECKLIST.md`: latest CI results are explicitly distinguished from older successful SHA; the AI disclosure item and trial metadata/post-expiry tests are now gates.
- Latest PR branch HEAD after documentation update: awaiting re-fetch/CI. Code HEAD with UI/test changes `e86fff0273e99de9045e095c59bfa81d25d29b02`: Cloud API + Quality Suite were in progress, Mobile Build pending at last observation.
- Commit checklist: `efd4100333cf8fac8279215825281228814933bb`.


## Continuare verificare directă GitHub — 26 nov 2026 (ora locală)

- PR #55 verificat direct: OPEN, DRAFT, base `main`, mergeable; branch `feature/openai-provider-integration`.
- HEAD verificat înaintea acestui checkpoint: `74bd2f847cedf65128027cdb936922ad6d91c22b`.
- CI pe exact acest SHA: **Cloud API SUCCESS** (tests + container build); **Quality Suite IN_PROGRESS** (unit/Core/AI, generated invariants, benchmark, Chromium, Firefox complete; WebKit running); **Mobile Build PENDING** (no jobs yet). Nu se declară validare completă.
- Audit local-only/post-expiry din cod: UI afișează Basic și afirmă că datele și funcțiile locale rămân disponibile; local Core/storage nu este gated de entitlement. Cloud AI are gate de entitlement/server. Încă lipsesc testele end-to-end explicite pentru expirarea entitlement-ului și export/recovery în Basic.
- RevenueCat offerings actual: aplicația afișează doar titlu + `priceString`; API-ul expune `introPrice` și `subscriptionPeriod` pe produs, dar disclosure trial/eligibility/renewal nu este implementat. Nu se afișează text de trial presupus. Eligibilitatea intro/trial este platform-dependentă; Android nu poate fi dedusă din metadata generală. Sandbox/store dashboard nu a fost accesat.
- Toolchain: `package-lock.json` există și este lock pentru numai Playwright + fast-check. Native Capacitor/plugin deps sunt instalate de script cu versiuni exacte, însă `--no-package-lock` înseamnă că rezoluția tranzitivă nu este locked. CI folosește `npm ci` pentru deps proiectului, apoi această instalare separată. Reproducibilitatea completă rămâne blocker.
- SQLite encryption: Stage B este implementat, dar gate dezactivat; conversia plaintext crash-safe și device validation nu sunt complete. Nu se activează encryption flag fără migrare verificată.
- External blockers confirmate: Supabase staging/config și migrare RLS/RPC; RevenueCat products/offering/webhook + sandbox; Cloud deploy/secret config; physical Android/iOS tests; signed store builds; privacy/legal/store disclosures.

### Următoarele priorități
1. Await/recheck CI pentru SHA exact; dacă run-urile sunt blocate/terminate, rerun fără a confunda commiturile.
2. Adaugă test de contract care dovedește Basic local access + export în entitlement absent/expirat, și AI cloud deny post-expiry.
3. Implementă disclosure de termeni numai din product/store metadata reale (trial duration, eligibility, renewal price, auto-renew) cu fallback sigur când metadata/eligibility lipsește.
4. Reproduce toolchain-ul nativ cu manifest/lockfile complet; nu considera versiuni directe pin-uite suficiente.
5. Test recovery/restore, apoi staging și device tests.

Nicio tranzacție, configurare live, deploy, merge sau publicare efectuată.


## Post-trial entitlement regression hardening — 26 nov 2026

- Added two Cloud API regression tests in `cloud-api/test-cloud-api.js`:
  1. An expired Pro record with `is_active=true` is reported as Basic; subscription expiry is not exposed as active; usage is not queried.
  2. An expired Pro record cannot call the AI provider; API returns `403 subscription_required`.
- Commit: `b8cc0bb599588d51069860d17deb631c785b8bee`.
- Direct code audit confirmed server AI-status logic checks expiry timestamp against current time, and SQL reservation function also rejects expired entitlement. The tests are authored but **not yet CI-validated**; current GitHub run lookup for this commit returned no workflow runs/status checks yet.
- PR HEAD now `b8cc0bb599588d51069860d17deb631c785b8bee`; PR remains open/draft. No merge/deploy/live billing.


## Basic local-access/export E2E regression — 26 nov 2026

- Added Playwright regression in `collector-v11/e2e/collector-flows.spec.cjs`: on browser platform with no RevenueCat entitlement, create a local entity, confirm local event/entity state persists, then export JSON and assert the backup includes entity, journal events, schema v7.
- Commit: `9a4f5f5dc653a725c6856d61af3144bec83abd14`.
- This validates local Basic path in browser/no entitlement; it does **not** simulate RevenueCat expiration on native device or post-trial native purchase lifecycle. CI/device execution pending.


## Import/restore malformed-backup hardening — 26 nov 2026

- Added Playwright E2E covering malformed JSON and a JSON file without a valid Collector schema; both imports must fail closed and preserve the existing local journal, entity projection, and schema version.
- Existing valid-backup restore E2E already checks that import restores the backup and discards entities added after that snapshot; existing incompatible-projection test also checks no mutation on rejection.
- Commit: `22e38631191325599bf1c6a207dd96ad73cc481d`.
- Test authored; exact-HEAD CI validation pending. This does not yet validate encrypted SQLite/native recovery, audio file restoration, or crash-interrupted restore on physical devices.


## Backup JSON transparency — audio excluded — 26 nov 2026

- Export JSON now includes `format: collector-backup.v1`, `audioIncluded: false`, and a Romanian metadata note; the Audit screen explicitly warns that audio recordings are not included or transferred by JSON export/import.
- Added E2E assertions for the backup metadata.
- Commits: `5fa4537a0e1ee7ab55e4c7746c2559ccbda697ac` (export metadata), `dc2399be28a3e44cdce2829dfc79299a8bbb4094` (UI warning), `554562509d351197a9fcb21e023278bcdd2acbbd` (regression).
- Audio file export/backup and restore remains a product gap; this change is disclosure only, not an audio-backup feature. CI validation pending.

- Follow-up E2E also asserts the Audit UI visibly warns that JSON backups exclude audio. Commit: `1bd2283eb94e7197d0edb0d58a82a17e60595435`.


## Continuare — 5 hardening tasks — 26 nov 2026

### 1. Native audio metadata index integrity
- `audio-store.js` now validates native audio index rows on read: non-empty ID/path/URI/timestamp, managed path allowlist, numeric non-negative size, and unique IDs. Invalid metadata fails closed and is not overwritten.
- Regression tests cover unsafe path and duplicate ID, preserving index bytes.

### 2. Clear-all destructive operation guard
- Added a test that a malformed/unsafe index makes audio clear-all abort before deleting even a valid audio file. Index remains available for recovery.

### 3. SQLite migration snapshot validation
- Recovery KV snapshots reject empty keys and duplicate keys before restoration; tests verify the encrypted database is not opened/mutated and the malformed backup remains untouched.

### 4. Transactional SQLite recovery failure
- Mock SQLite now models transaction rollback. Added test injecting a recovery write failure; expected: rollback restores prior rows and verified migration backup remains preserved.

### 5. Native toolchain version drift guard
- Added `verify-mobile-toolchain.js` and npm script `mobile:verify-toolchain`; Android and iOS CI run it after toolchain installation. Test covers exact versions, missing package, and version mismatch.
- This is a direct-dependency drift guard, **not** a complete transitive lockfile. Toolchain remains installed using `--no-package-lock`; full reproducibility still requires generated/committed lock coverage and a clean `npm ci` validation. I did not fabricate a lockfile.

Commits for this round: `06d9516`, `0dc1183`, `9d3a094`, `e6235aa`, `c0fbc04`, `ec47115`, `734187e`, `2043cb1`, `b75fba2`, `b10277a`, `150813b`, `7da742b`.

Authored tests and workflow checks are not yet validated by CI on this round's latest HEAD. PR #55 remains draft; no merge/deploy/store release performed.

- Follow-up assertion adjustment: unsafe audio index is rejected by shared `readIndex()` validation before the destructive-operation-specific validation; test accepts either fail-closed error and still asserts no files/index are deleted. Commit `75462f5a17c2b8586bafd910818ace844ecf5db4`.

## Continuare — următorul set de hardening și backup — 26 nov 2026

### Recovery audio native
- native-audio-recorder.js validează checkpoint-ul la citire: ID nevid, format AAC și path exact derivat din ID/safeName. Un checkpoint cu path traversal e respins înainte de filesystem și păstrat.
- Test regression adăugat.

### Backup/restore audio separat de journal JSON
- Implementate API native exportBackup() / importBackup() și expuse prin CollectorAudioStore.
- Format collector-audio-backup.v1; include fișierele audio base64 + metadata, separate de backupul Core.
- Importul este additive, duplicate IDs sunt skip, schema/base64/MIME/size/path validate; limite: max 100 înregistrări, 50 MB/fișier, 100 MB total. Fișierele sunt scrise înainte de metadata commit; la commit failure, fișierele noi sunt șterse. Export preflight și filesystem stat verifică dimensiunile.
- UI Audit: export și import backup audio; avertismentul despre audio omis în JSON Core rămâne explicit. Audio backup este disponibil pentru storage nativ, nu pentru fallback web.
- Teste authored pentru round-trip, duplicate, malformed base64, size limits și rollback; CI pending. Teste pe telefon necesare pentru filesystem Capacitor, storage quota și fișiere mari.

### Release bundle audit
- Adăugat verify-release-bundle.js, script npm și gate în Android/iOS CI după mobile build; scanează fișiere private/ascunse și pattern-uri de secrete server-side.
- iOS CI verifică acum explicit toolchain direct-version pins, la fel ca Android.
- Teste authored pentru fișier privat și marker de secret; CI pending.

### Basic/offline regression
- E2E adăugat: entitate locală, draft Work persistent după reload, preview Core local, fără commit implicit al notei și fără request AI; buton AI disabled în Basic/offline. CI pending.

### Lockfile/toolchain
- Full transitive lockfile still not generated. Direct version verifier remains; mobile:install-toolchain uses --no-package-lock. Need a clean environment with npm and generated lockfile; do not claim fully reproducible native builds.

Commits acest set: 2cc00fb, 8e05c76, 8507b0c, 18c8668, 286336f, f2ff143, 0acd95a, 66d0d4a, 7b547fa, c1686ad, a9a923b, 416175b, 5c4e9da, cf17753, b6d1ee4, dc881cf, 9e81a63, 9eae62f, a13bcdd, ca838f3.

No merge, deploy, store release or device-level validation performed. Tests are authored but pending CI on final HEAD.
- Final follow-up: audio import additionally validates ID length and parseable creation timestamp before filesystem writes. Commit `0728ae3e1162b3c34b4f63461601fd2c94248854`.

- Final fail-closed change: malformed audio-backup records now abort import rather than being silently skipped; only duplicate IDs already present are skipped. Regression authored. Commit `766752a` and test `ec17d4a`.


## Decizii corecte și audit funcțional — 26 nov. 2026

Sursa de adevăr: `PRODUCT-DECISIONS-2026-11-26.md`. Deciziile de mai jos trebuie păstrate în toate continuările:
- Collector este AI personal memory + recorder hands-free. AI nu este addon; trial full experience, apoi Small €5 / Medium €15 / Large €30 lunar, toate cu AI. Utilizatorul nu plătește separat provider API. Tier quotas se dimensionează pe cost măsurat, nu inventate.
- Audio/text trebuie interpretat semantic, structurat, corelat cu memoria existentă și redat într-o propoziție naturală; transcript/audio original rămân accesibile. Recall factual trebuie să trimită la sursă și timestamp. TTS este parte din UX-ul hands-free.
- AI detectează reminders explicite și creează notificare locală: ex. „Vineri trebuie să cumpăr materialele pentru proiect, să nu uit.” Creează task cu acțiune/context/date, confirmă numai după scheduling reușit. Ambiguitate/negare/„poate” nu creează reminder automat. Default time configurabil pentru date fără oră.
- Reminder status/completion, snooze și source-link trebuie să fie recuperabile în memoria Collector.

### Audit cod, HEAD 88343f122a28644714e92832f6df332949b7a564
- AI provider schema și prompt nu conțin reminder/task/memory extraction; operațiile actuale sunt Core CRUD/notes.
- Work AI UI are preview/confirm generic, dar nu un preview combinat de semantic summary + reminder side effect.
- reminders.js are native schedule/list/cancel/snooze/clear și rollback, dar este separat de AI; lipsește natural-language date resolution, completion, source link.
- Subscription implementation este un singur entitlement `pro`, offerings RevenueCat și server active-Pro gate. Nu există mapping Small/Medium/Large și tier budgets implementate/validate. Trial/store intro eligibility și UX nu sunt validate în sandbox.
- Pipeline audio→transcript→AI interpretation→memory→natural sentence/TTS playback nu este complet.

### Next implementation queue (prioritate Work)
1. Entitlement/capability matrix + tier/product mapping + server quota enforcement (trial full; all paid tiers AI).
2. AI structured contract pentru summary, memory facts, tasks/reminders, temporal fields/timezone/confidence/source refs; server validation.
3. Reminder intent flow: clear intent/date → preview → local schedule → persisted source link/idempotency → success confirmation; ambiguous/no/negated intents ask/skip.
4. Reminder complete/follow-up și Activity ledger.
5. Voice pipeline: transcription, natural-language summary/playback, TTS, retry/interruption and preserve original.
6. Memory recall MVP source-grounded with jump-to-source.
7. UI Work polish; Think later.

Nu marca niciunul din punctele de mai sus ca implementat până când code/tests/CI confirmă. CI pentru latest HEAD trebuie verificat separat; documentare nu este validare.


## Reminder intent safety module — 26 Nov 2026

Implemented (not yet end-to-end integrated):
- Added `ai/reminder-intent.js` as a validation boundary for AI reminder suggestions: explicit intent/certainty required; negated/no-intent skip; uncertain/ambiguous clarify; title length validation; ISO date validation; timezone-aware local date/time conversion; configurable default time for date-only; past dates rejected; DST gap round-trip rejected; source/context/idempotency metadata carried forward.
- Added `test-reminder-intent.js` for explicit date-only, timezone time conversion, uncertain/non-explicit, negated, ambiguous date, past, invalid date/time/title and DST-gap cases.
- Important: this module does NOT call native notifications and is not wired to OpenAI provider, Work UI or Reminder service yet. No claim of actual automatic reminder creation until integration, idempotency persistence, scheduling rollback and CI/device tests are complete.
- Current commit: module `099d7fc`, tests `77f6861`. Next: extend AI structured schema/prompt to emit bounded reminder suggestions, integrate validation with explicit preview/confirm and native schedule service, then link source and lifecycle status.


## Structured AI memory/reminder contract — 26 nov 2026

- Provider OpenAI Structured Outputs extins cu câmpuri strict-schema: `semantic_summary`, `memory_facts` (max 20), `reminder_suggestions` (max 5; intent/certainty/explicit/negated/title/date/time/timezone/context/clarification).
- Promptul cere să nu inventeze date/ore și să marcheze tentative/negări, fără auto-execuție.
- Outputul providerului normalizează aceste câmpuri în `semanticSummary`, `memoryFacts`, `reminderSuggestions`; operațiile Core rămân pe calea preview/confirm separată.
- Test provider extins: schema strictă, output normalize și reminder structure.
- DST reminder resolver hardened: spring gap și fall-back overlap (oră ambiguă) sunt respinse pentru clarificare, nu aleg automat una.
- Commits: `47a3b5b6` provider schema; `600855e3` tests; `477c904e` DST overlap; `057c2934` test.
- Latest HEAD: `057c2934edc80272d44484e88b31702f8a7a40c0`; CI lookup momentan returnează zero runs/status, deci **nevalidat**.
- Limita: reminder suggestions sunt doar output structurat; încă nu sunt conectate la Work UI, persist/source ledger sau native notification scheduling. Nu se confirmă reminder utilizatorului până la integrare.
- Next: integrare safe preview pentru semantic summary + reminder suggestions în Work, scheduling idempotent, source-link, lifecycle complete/snooze și testele de eșec/permisiuni.

## Checkpoint 2026-11-26 — Work AI reminders + CI repair

Branch feature/openai-provider-integration, PR #55 către main, rămâne draft și nu este merged.

### CI blocker găsit și reparat
- La HEAD-ul anterior 07ada1d14ce896fe5623e38ea00520e8bb8b9e12, Quality Suite și ambele build-uri mobile eșuau în npm test, cu două regresii:
  1. regex-ul de validare MIME pentru importul backup audio din audio-store.js avea slash-escape dublat și producea SyntaxError la încărcarea testului;
  2. test-mobile-build.js încă verifica vechea comandă CI fără mobile:verify-toolchain, deși workflow-ul a fost deja actualizat.
- Fix-uri:
  - 855368790a2ed68cda3e8f286bec8972a54bc63d — regex audio MIME corectat;
  - 625f015f8c2c7f0536b77eda92a2dcad602eac03 — testele mobile aliniate cu verificarea toolchain-ului.
- Aceste fix-uri au fost urmate de integrarea reminderelor și vor fi validate împreună la HEAD-ul final al batch-ului.

### Work AI — implementare
- OpenAI Structured Outputs include deja semantic_summary, memory_facts, reminder_suggestions.
- Work UI afișează acum sumarul semantic și faptele candidate; faptele sunt marcate explicit ca nesalvate, nu se scriu automat în jurnal.
- Sugestiile reminder sunt prezentate ca preview, nu ca acțiune executată.
- La click, aplicația trece sugestia prin CollectorReminderIntent.validateReminderSuggestion, folosește timezone local dacă modelul nu furnizează unul, default 09:00 pentru date fără oră, respinge ambiguitățile/DST/past și cere confirmare înainte de side effect.
- Scheduling este expus prin serviciul de notificări native, cu verificarea permisiunii, rollback la eșec și cheie de idempotency.
- Reminders păstrează sourceId, contextul Work și idempotencyKey; UI arată contextul-sursă.
- Reminder lifecycle: scheduled, completed, cancelled; „✓ Gata” anulează notificarea nativă și păstrează starea finalizată în istoricul local; snooze creează o notificare nouă și marchează originalul cancelled.
- Validatorul este inclus în allowlist-ul mobile build și încărcat în index.html.

### Teste noi/actualizate
- test-reminders.js: idempotency/source context și completion lifecycle; actualizat pentru păstrarea statusurilor.
- test-ai-work-integration.js: verifică wiring-ul UI pentru summary/memory/reminder preview, confirmare, idempotency și sursă.
- test-mobile-build.js: verifică faptul că reminder-intent validator este livrat în bundle mobil.
- test-reminder-intent.js: existent — explicit/negat/ambiguu, dată/oră, timezone, DST și past-date.

### Limite încă reale
- Audio original nu este încă transcris prin pipeline-ul cloud; AI primește în continuare textul din Work, inclusiv dictarea browserului, nu fișierul audio.
- Reminder sourceId referă un Work turn și stochează contextul textual, dar nu există încă jump-to-source către o înregistrare audio/transcript persistată.
- memory_facts sunt doar candidate în UI; persistence/recall indexat și răspunsuri cu citare/jump la sursă nu sunt implementate.
- TTS nu este încă conectat pentru summary/recall.
- Entitlements comerciale Trial/Small/Medium/Large nu sunt implementate. Backend-ul încă folosește gate-ul Pro și bugetul existent; nu configura produse sau limite live fără validare și aprobare.

### Următoarea continuare
1. Verifică workflow-urile Quality Suite, Cloud API și Mobile pe HEAD-ul actual; nu considera pending/cancelled ca pass.
2. Dacă CI găsește regresii, repară și retestează înainte de a adăuga funcționalități.
3. După CI, următorul bloc este audio → transcription → interpretation → memory/source record → TTS, apoi retrieval grounded.
4. Entitlements Trial/Small/Medium/Large: definește capabilități și măsurători/usage budgets, dar fără inventarea limitelor și fără billing live.
5. PR #55 rămâne draft; nu merge în main, nu deploy, nu release fără aprobare explicită.


## Checkpoint autonom — 2026-11-26 (09:xx, reminder concurrency + CI regression)
- HEAD checkpoint: `c4437dae170e02d110077d511156dd826baafb06` (verify live branch SHA before relying on it).
- Fixed the remaining audio backup test fixture: its malformed record now uses an unsupported MIME type so it actually exercises the metadata validator; the previous fixture was valid and caused “Missing expected rejection”.
- Reminder service mutations now use a serialized promise queue for create, cancel/complete status changes, and clear-all. This closes a race where simultaneous AI reminder requests with the same idempotency key could both schedule separate native notifications.
- Added regression test for concurrent reminder creation with the same idempotency key: one reminder/notification should be created, the second result should return the existing record.
- Cloud API CI was successful on prior failing-fix HEAD; latest HEAD CI is running. Quality Suite + Android/iOS verification must complete before claiming this batch green.
- Do not merge/deploy, configure live billing, or release without explicit approval.
- Next: validate CI. Then inspect Work memory facts/semantic summary behavior and implement source-grounded persistence/recall carefully; improve voice capture→transcription→AI→spoken response without sending audio unless user action/policy explicitly allows.


## Checkpoint Work — AI-first voice session + reminder concurrency (2026-11-26)
- Latest code checkpoint before this documentation commit: `5004557ed137f01987aff43659c6d8caa9617404`.
- Continuous voice session now sends the final recognized transcript directly to `runAICommand()` instead of forcing it into `Observație:` and running the deterministic local parser. The AI proposal still goes through Core preview and explicit user confirmation; no auto-save/execution was introduced.
- Added static regression test ensuring continuous voice session routes through AI and does not call the local parser.
- Reminder create/status/clear mutations serialized through a promise queue; concurrent duplicate idempotency keys no longer race into duplicate native schedules. Added concurrency regression.
- Corrected the audio-backup malformed fixture that had accidentally been valid (unsupported MIME now tests the intended metadata rejection).
- CI was running on the previous checkpoint; verify latest HEAD workflows before calling this batch validated. Cloud API success had been observed on the preceding batch.
- Remaining voice pipeline gap: native/browser audio recordings are retained locally, but they are not automatically transcribed/attached to an AI memory record; live dictation is browser SpeechRecognition and platform/browser availability varies. Next work should design a reliable, explicit audio-transcription path and durable source-grounded memory storage, without silently uploading recordings.


## Checkpoint reminder timezone validation — 2026-11-26
- Latest code HEAD before this documentation update: `f8282f85b34d1b691d6747eb42dc443d16abfd01`.
- Reminder-intent validator now converts invalid/non-IANA timezone exceptions into a user clarification instead of allowing a thrown Intl RangeError to break scheduling.
- Regression test added for invalid timezone string.
- Reminder queue hardening, audio backup fixture correction, and continuous voice-session AI routing remain included in this branch.
- CI for this latest HEAD must be checked; no runs were returned at the moment of this checkpoint.


## Work memory save — 2026-11-26
- Code checkpoint before documentation commit: `7c2e77f31b0091ab3ab4a72a0bd36bcaa8a59b47`.
- AI semantic summary and memory-fact candidates now have an explicit “Salvează în memorie” action. The user sees the summary/facts and source text; the action previews an append-only `event.note` through Core and requires explicit confirmation before execution.
- Stored note includes sourceId, candidate facts, summary, and a bounded excerpt of the original transcript in its description/payload. AI candidates are not persisted automatically.
- Static regression verifies memory save uses Core preview, explicit confirmation, and per-turn idempotency.
- Important product gap remains: no dedicated retrieval/recall interface that searches stored source notes and returns grounded answers with source navigation. This is the next memory MVP after CI validation.


## Decizie de produs — Structured AI Memory (2026-11-26)
- Direcția confirmată: audio este input temporar, nu memoria permanentă. AI extrage entități, aliasuri, atribute, relații, evenimente, timp, task-uri/reminders și confidence/provenance.
- După commit durabil verificat, audio temporar poate fi șters automat conform politicii; la eșec rămâne recuperabil. Retenția audio permanentă este opt-in, nu default.
- Recall reconstruiește răspunsurile din graful de entități + relații + evenimente + atribute + task-uri, cu evidence/source IDs și link/jump către surse. Vector search este opțional ulterior, nu înlocuiește date structurate.
- Nu se face merge automat la identități ambigue; AI propune, Core validează și aplică, iar acțiunile cu impact necesită confirmare.
- Specificația completă: `AI-STRUCTURED-MEMORY-AUDIO-MINIMIZATION-v0.1.md`.
- Următorul workstream: contract extraction + validator, entity resolution, Core command builder, retrieval și lifecycle audio cu testare idempotency/failure.


## Structured Memory implementation checkpoint — 2026-11-26
- Added versioned bounded extraction validator `ai/structured-memory.js` and browser module `ai/structured-memory-browser.js`: validates entity keys, facts, relations, field limits and references; exact name/alias resolution only; ambiguity is surfaced, not merged; explicit existing IDs must exist and match type.
- Added command builder for Core operations: entity.create, alias attribute.set, fact attribute.set, relation.create and event.note. Commands use capture-scoped idempotency and stable entity IDs; all operations remain behind Core preview and explicit UI confirmation.
- OpenAI strict Structured Outputs schema now includes `structured_memory` (summary, entities, typed facts, relations, confidence, clarification); server provider maps it to camelCase interpretation. Work UI validates/resolves it and uses the structured-memory command instead of raw model operations when non-empty.
- Added local structured recall utility `ai/structured-recall.js`: entity/attribute search, linked relations/events, temporal filtering, bounded evidence list; no synthesis or unsupported claims in retrieval layer. Exports wired into AI index.
- Added tests `test-ai-structured-memory.js` and `test-ai-structured-recall.js`, provider schema/return test and UI wiring regression.
- Current implementation is groundwork/MVP; not yet complete: transcript/audio deletion lifecycle, persisted alias/temporal semantics improvements, recall UI and AI synthesis/source jumps, automatic user-consented capture mode, and end-to-end provider integration tests remain.


## CI stabilization checkpoint — 2026-11-26 09:44
- Implementation batch completed; stop pushing further commits to let Actions stabilize.
- Latest code commit before this checkpoint: `0b8d8973a170f9549fa8d3f4eb0251a9f7ec07de` (alias operation duplicate removed from browser builder).
- Quality workflow runs were cancelled by branch concurrency during rapid commits; the GitHub API does not permit rerunning cancelled runs. Latest mobile/cloud jobs are being observed. Do not claim quality tests passed until a non-cancelled run on the final commit completes.


## Work handoff — recall UI + E2E stabilization (2026-11-26)

- HEAD at checkpoint: `6b5abb5c010346499c491ba55140194ca8bafd8c` (verify CI again after this checkpoint commit).
- Verified PR #55 remains open, draft, not merged. Branch is `feature/openai-provider-integration`.
- CI at `ad101ebf`: Cloud API PASS, Android debug APK PASS, iOS Simulator build PASS; Collector Quality Suite FAIL due 3 Chromium E2E failures (2 stale/incorrect assertions and voice-session test expecting cloud AI in CI).
- Fixed E2E assertions: use Playwright expect matcher correctly; align export assertion with current Romanian UI wording; voice test now validates capture then uses local deterministic Core preview as a CI-safe fallback. These commits are in the branch; validate latest CI before relying on them.
- Added Work Recall panel: local structured retrieval across entity names/types/attributes/aliases, related relations, linked events, event attributes; bounded to 30 events/100 evidence. It states evidence-only retrieval and no audio search; no generative synthesis has been wired yet.
- Added browser adapter `ai/structured-recall-browser.js`, test `test-ai-structured-recall-browser.js`, and evidence/source navigation to Events (event rows now have source IDs). Query uses only current local structured state; if no evidence, UI explicitly says it cannot reconstruct the context.
- CSS added for recall results/source highlight.
- Important: source navigation and AI-grounded synthesis remain partial; Work Recall currently presents evidence rather than a natural-language AI answer. Next: test UI recall end-to-end, refine retrieval ranking/temporal parsing, and connect evidence-only context to a server-side synthesis endpoint with citations/source IDs and strict insufficient-evidence behavior.
- Audio lifecycle is still not implemented end-to-end: audio recordings remain locally stored; there is no transcription/interpretation pipeline that commits structured memory and verifies persistence before deleting source audio. Do not claim automatic deletion. Next audio milestone is a recoverable state machine and disclosed transcription route; after commit verification, deletion must be attempted and itself verified, with failure/retry metadata.
- Current CI runs triggered by these commits were in progress at checkpoint; quality had cancelled older runs because commits were pushed rapidly. Check HEAD-associated workflow runs.


## Continuare Work Recall — E2E și entry points (2026-11-26)
- Recall panel + browser adapter + source navigation sunt acum incluse în toate cele 3 HTML entry points (`index.html`, `index-server.html`, `Deschide-prin-dublu-click.html`), nu doar în index-ul principal.
- E2E pentru recall creează o entitate, caută din Work, verifică evidence și navighează la event source. Testul navighează explicit în Work înainte de query.
- E2E assertions corectate: audit verifică text stabil din jurnal; Work draft status folosește Playwright `expect`.
- `test-ai-structured-recall-browser.js` acoperă adapter browser. Unicode normalization regex a fost corectată.
- Current HEAD before this checkpoint: `25b13d4f33d6e1fe939cd7b5ba596ee4f31d96a5`. CI triggered by rapid pushes may cancel earlier runs; let the current HEAD workflows finish before another code push. Do not claim Quality Suite pass until the exact HEAD is green.
- Audio remains a launch-critical unfinished feature: raw recordings are still saved locally and no complete transcription → structured extraction → Core commit → persistence verification → audio deletion pipeline exists. Existing audio is not automatically deleted. The product principle requires temporary source audio to be deleted only after structured persistence is verified, with recovery on any failure. Implement and test this before release.


## Audio lifecycle groundwork + E2E fixes (2026-11-26)
- Added `audio-processing-lifecycle.js`: dependency-injected state machine with captured → processing → interpreted → validated → persisted → persistence_verified → audio_deletion_pending → audio_deleted → completed; stable idempotency key per recording; checkpoints after phases; retry/recovery; refuses deletion unless persistence verifier returns strict `true`; confirms deletion by reading audio back and requiring absence.
- Added `test-audio-processing-lifecycle.js` covering success, persistence failure retention, verifier false, deletion not confirmed, retry with stable key, and recovery list.
- This is groundwork only—not yet wired into app UI/server or transcription/extraction provider. Existing recording workflow remains manual/local and original audio retention is unchanged until integration is complete.
- Diagnosed prior Quality Suite failures: recall source event selector was ambiguous because event IDs appear in Recall, Event list, History, and Audit; scoped it to `#eventList`. Work-layout test expected 3 panels, updated to 4 after adding Recall panel.
- The prior run at `9780847d` failed E2E with those two issues; subsequent fix commits triggered new runs. Check exact current HEAD and CI after the checkpoint.

- Lifecycle recovery hardening: nonterminal checkpoints are now discoverable even if process crashed before marking recoveryRequired; the `audio_deletion_pending` checkpoint can safely finalize after a crash that happened after file removal but before `audio_deleted/completed` was persisted. Added tests for both crash windows. Corrected lifecycle test fixture retry behavior and deletion assertion.


## Audio transcription milestone (2026-11-26)
- Added server-side `POST /api/ai/transcribe`: accepts raw audio bytes (25 MB limit), validates supported MIME, enforces same local-origin allowlist/rate limiting, requires server API key, calls OpenAI transcription with `gpt-4o-mini-transcribe` by default (override `OPENAI_TRANSCRIPTION_MODEL`), returns text only. API key never reaches browser.
- Browser provider exposes `transcribe(blob)`; validates empty/oversized audio, uses auth token for native cloud calls.
- Work recordings now include **Transcrie + AI**: loads local blob/native URI, transcribes, places result into Work draft, and prompts the user to inspect then explicitly run AI interpretation/preview/commit. Original audio is intentionally retained (not deleted by this partial feature).
- Tests cover browser provider payload/guards and server endpoint origin, MIME, and missing-key guards.
- This is a manual, user-triggered transcription-to-draft step only. It does NOT yet automatically extract structured memory, execute Core, verify persistence, or delete audio. Next milestone: connect transcription + structured extraction + idempotent Core commit to lifecycle checkpoints and independently verify committed records before deletion; failures must retain source and recovery state.

## Bulk continuare — 5 taskuri + impact (2026-11-26)

### Task 1 — Recall source navigation (fix)
- Diagnosticul CI: testul Recall căuta evenimentul după ID în filtrul generic de text; filtrul nu este lookup pe ID, astfel rândul sursă rămânea ascuns.
- Fix: la deschiderea sursei se curăță filtrul activ și se caută rândul exact prin selector stabil `#eventList > [data-event-id]`.
- UI oferă status fallback dacă evenimentul nu poate fi găsit în lista vizibilă.
- Impact: Recall nu mai depinde de textul filtrului curent; navigarea poate reseta filtrul utilizatorului (comportament intenționat, documentat în regresie).

### Task 2 — Lifecycle concurrency protection
- Procesarea simultană a aceluiași ID audio share-uiește promisiunea in-flight; evită două interpretări, două commit-uri sau două ștergeri concurente.
- Lock per ID, eliberat în `finally`; alte înregistrări pot procesa în paralel.
- Impact: reduce duplicate AI calls/cost, race-uri în checkpoint și risc de delete concurent.

### Task 3 — Regression test concurrency
- Test nou: două apeluri `process('a1')` în `Promise.all` trebuie să termine complet și să execute interpretarea și ștergerea o singură dată.
- Impact: contractul de idempotency/concurrency este acum testat, nu doar presupus.

### Task 4 — Transcription timeout coverage
- Timeout de 60 secunde rămâne activ până după citirea/parsing-ul corpului răspunsului upstream; anterior era curățat imediat după primirea headerelor.
- Impact: limitează blocarea serverului și consumul resurselor în cazul unui răspuns OpenAI care livrează headers dar întârzie body.

### Task 5 — CI failure triage
- La HEAD `02f5356a`, Core, invariants, benchmark și Cloud API/mobile au trecut; Quality a eșuat numai în Chromium E2E: Recall source event hidden.
- Fixul este aplicat și regresia adăugată. CI trebuie reevaluat pe commiturile bulk noi; nu declara green înainte de rerun.

### Implicații / ce rămâne obligatoriu
- Lifecycle audio există ca modul testat, dar încă NU este conectat end-to-end la recorder → transcription/interpretation → extraction → Core commit → independent persistence verification → delete. Audio nu se șterge automat în fluxul actual.
- Integrarea trebuie să utilizeze AudioStore real, checkpoint durable și Core port real; verificarea persistence trebuie să citească înapoi din DB/jurnal, nu doar să accepte rezultatul returnat de commit.
- Înainte de auto-delete: failure injection pentru provider timeout, extraction invalid, commit rejected, duplicate commit, verificare absentă, delete failure și crash între persistence verification și delete.
- Task următor prioritar: inspectarea API-urilor reale Core/AudioStore și proiectarea adaptorului lifecycle, apoi implementare în bulk cu teste de failure/recovery; nu activa ștergerea până la verificarea end-to-end.

## Bulk continuare — următoarele 5 taskuri (2026-11-26)

1. **Fix CI test orchestration pentru Recall**: testul nu mai încearcă să completeze un filtru de pe o pagină ascunsă. Navighează în Events, aplică filtrul, revine în Work și deschide evenimentul sursă; verifică resetarea filtrului și vizibilitatea exactă a evenimentului.
2. **Recovery pentru delete-response lost**: dacă audioStore.remove șterge sursa dar aruncă o eroare (răspuns/checkpoint pierdut), retry cu audio absent și checkpoint persistenceVerified poate recupera doar după re-verificarea independentă a persistenței.
3. **Fail-closed checkpoint identity**: procesarea refuză checkpoint-uri cu ID sau idempotencyKey care nu corespund recording ID-ului; previne asocierea accidentală a datelor/checkpoint-urilor între înregistrări.
4. **Regresii lifecycle**: teste pentru delete-success-then-throw + recovery, checkpoint identity mismatch și audio missing fără verificare de persistență; toate verifică că nu se declară completed fără dovadă.
5. **Documentare + rerun CI**: adaugă această rundă și implications în checkpoint. CI este rerulat pe HEAD bulk; nu se declară green până la final.

### Implicații
- Recovery poate confirma un delete care s-a întâmplat, dar numai cu re-verificarea structurii persistate; fără audio și fără dovadă, lifecycle rămâne fail-closed.
- Checkpoint identity guard reduce riscul de cross-recording processing și commit-key reuse.
- Testul Recall are acum pași reali în UI și verifică resetarea filtrului, evitând false-negative din cauza locatorilor ascunși.
- Această notă descria starea anterioară și este supersedată de implementarea manuală actuală: Work conectează Transcrie + AI la Core, cu preview și confirmare explicită. După commit verificat independent, audio-ul se elimină implicit dacă preferința nu este Keep; nu există procesare/retry unattended în background.

### Corectarea testelor din această rundă
- CI a expus două defecte în testele noi, nu în codul lifecycle: fixture-ul returna Map-ul audio dar testul încerca să înlocuiască `audio.remove` (metoda reală aparține store-ului); iar testul pentru missing source cu checkpoint failed trebuia să folosească `retry:true` conform contractului.
- Fixture-ul expune acum store adapter; testele interceptează metoda corectă și folosesc explicit retry. Aceste corecții sunt incluse în commitul următor și CI trebuie reevaluat.


## Checkpoint 2026-11-26 — continuation after CI review

### Verified repository state at handoff
- Repository: `davidlucian-ioan/Aplicatie`; branch: `feature/openai-provider-integration`; PR #55 remains open, draft, not merged.
- Before the latest hardening batch, HEAD `88c08475` had **all three workflows green**: Cloud API, Quality Suite and Mobile Build (Android debug APK + iOS simulator).
- New hardening commits after that green HEAD: `21f25c1d` (audio deletion cancellation ordering), `883ef4a8` (regression test), `e59cf81c` (cleanup transcript after lost audio-delete response), `e48f88b6` (regression coverage), plus CI workflow trigger changes. Latest branch HEAD at that checkpoint: `c9276158`; workflows were queued/in progress. A subsequent documentation checkpoint is `65bb3530`: Cloud API passed, while Quality and Mobile were pending. Verify CI against the latest HEAD before marking these changes validated.

### Implemented in this continuation
1. Audio-delete cancellation no longer clears the temporary transcript before user confirmation.
2. If audio is already absent during verified deletion recovery, the transcript checkpoint is cleared before completion; this covers the lost-response/crash boundary.
3. Regression coverage asserts confirmation precedes transcript removal and the deletion-pending checkpoint, and checks absent-source transcript cleanup.
4. CI duplicate runs were reduced: feature branches run PR workflows rather than duplicate push workflows; main still runs on push. Quality now also supports manual dispatch.

### Next priorities
1. Wait for and inspect the latest-head Quality, Cloud API and Mobile results; fix any failure rather than weaken assertions.
2. Review the audio pipeline's remaining crash boundaries and verify the real app path versus lifecycle-engine tests; keep no-background-processing policy.
3. Implement evidence-grounded natural-language Recall synthesis with citations/source IDs and uncertainty handling; no answer may invent beyond retrieved Core evidence.
4. Finish task/reminder lifecycle (open/completed/snoozed/cancelled), offline retry UX, and native device acceptance.
5. Complete subscription/trial/quota and sandbox validation, Supabase isolation, privacy/export/delete, encryption and store release checks.

### Release boundary
Do not merge PR #55, deploy production, enable billing or claim store readiness without explicit approval and external/device validation.


## CI follow-up — 2026-11-26

At commit `65bb3530`, Cloud API was successful; Quality Suite and Mobile Build were pending. This is not the final head because this checkpoint is being updated; check the current PR head and its workflow runs before claiming validation.


## Bulk batch — 10 prioritare implementate (2026-11-26)

Repository: `davidlucian-ioan/Aplicatie`  
Branch: `feature/openai-provider-integration`  
PR #55: remains **open / draft / not merged**. Do not merge into `main`.

### Implemented

1. **Reminder record validation** — validates IDs, notification IDs, titles, dates, status values and uniqueness; malformed persisted reminder lists fail closed and are not overwritten.
2. **Verified reminder persistence** — reminder metadata must be acknowledged by storage and read back byte-for-byte before a native notification is scheduled.
3. **State-aware idempotency** — a repeated key returns an existing scheduled reminder only when it is in a known-safe state; cancelled/completed/uncertain intents cannot silently be treated as scheduled.
4. **Serialized snooze transaction** — creation of replacement reminder and cancellation of original are serialized; failed replacement rollback is surfaced.
5. **Reminder state rollback** — completion/cancellation now use verified persistence and attempt to restore the previous metadata and native notification if the state write fails.
6. **Verified clear-all** — notification cancellation is followed by acknowledged metadata deletion and readback of key absence; failure attempts to restore metadata and notifications.
7. **Uncertain scheduling recovery** — if native schedule fails and compensating cancel also fails, the reminder is retained with `scheduleUncertain`, shown as requiring verification, and duplicate creation with the same idempotency key is blocked. A later successful completion/cancellation clears the uncertainty marker.
8. **Namespaced Recall evidence IDs** — entities, relations and events use type-prefixed source IDs; attributes and event attributes also have stable source IDs to avoid collisions.
9. **Recall server safety and contract** — only bounded allowlisted evidence reaches OpenAI; Recall mode instructs the model to answer solely from that evidence, never mutate Core, and return source IDs. The server-side provider filters citations against exact IDs in the supplied evidence.
10. **Recall UI synthesis** — Think/Recall can request an AI natural-language answer from local structured evidence only; it displays only source IDs present in the local retrieval result and allows navigation to cited events.

Regression tests were added for reminder persistence/rollback/idempotency/concurrent snooze/uncertain notification recovery, Recall evidence IDs/sanitization/source validation, and Recall UI wiring.

### Latest CI checked before this documentation checkpoint

Pre-documentation code HEAD: `cad2e9f1f283759fe676538655164fe0dc651578`.

- Collector Cloud API: **PASS**.
- Android debug APK: **PASS**.
- iOS Simulator build: **PASS**.
- Quality Suite: Node/Core tests, generated invariants, generated Core sequences, coverage and Replay benchmark: **PASS**.
- Chromium E2E: **PASS**.
- Firefox E2E: **PASS**.
- WebKit E2E: **IN PROGRESS** at the last check.

The documentation-only commit below changes no runtime code; confirm the new HEAD's Quality/Mobile workflow runs before calling the final CI state green.

### Still not launch-complete

- Reminder completion/snooze are still local reminder metadata; they are not yet a canonical Core task/event ledger linked to Activity/Memory.
- Offline retry queue and crash-safe user-facing recovery need further implementation and E2E tests.
- Recorder-to-AI-to-Core processing is still user-triggered; do not enable unattended/background processing.
- Recall synthesis has code-level source-ID filtering, but a real OpenAI call, evidence quality evaluation and full UI E2E validation remain outstanding.
- TTS/voice playback is not implemented.
- Tiered subscription pricing, store sandbox purchase/restore/renew/refund tests, Supabase production isolation, device validation, encryption/privacy review and signed store builds remain release gates.

### Next priority order

1. Finish latest-head WebKit E2E and verify all CI on the current PR head.
2. Design and implement the canonical task/reminder ledger in Core, including source-event links, open/completed/snoozed/cancelled lifecycle and Recall visibility.
3. Add offline processing/retry queue UX with explicit user control; preserve audio on every uncertain state.
4. Test Recall against real provider responses and add failure/unsupported-answer E2E cases.
5. Implement TTS only after source navigation and evidence behavior are stable.
6. Complete pricing/tier/entitlement, external service, security, device and store acceptance.

Release boundary unchanged: no merge, production deployment, live billing activation or store-readiness claim without explicit approval and external/device validation.


## Batch 5 taskuri — integrare reminder lifecycle în Core (26 Nov 2026)

Branch-ul curent: `feature/openai-provider-integration`.  
PR #55: **open / draft / not merged**. Nu a fost făcut merge în `main`.

### Implementat
1. Reminderul este persistat inițial cu `scheduleState: pending`; nu este jurnalizat ca programat până când notificarea nativă nu confirmă succesul.
2. La pornire, Collector recuperează programările rămase `pending` folosind același notification ID. Eșecurile cu rezultat incert sunt marcate `uncertain`, nu raportate drept succes.
3. Lifecycle-ul `scheduled`, `completed`, `cancelled` și `schedule_uncertain` este transmis către Core prin Core Port, cu idempotency key stabil și confirmare de persistare/readback.
4. Evenimentele care nu pot fi jurnalizate sunt păstrate în `coreOutbox`, cu retry la pornire și acțiune manuală în lista de reminders. Outbox-ul este eliminat numai după confirmarea Core și event ID.
5. Recall poate găsi evenimentele reminderelor prin note Core și referințe de sursă. Contextul/transcriptul brut nu este copiat în jurnal; se păstrează doar referința sourceId, titlul, termenul, lifecycle-ul și descrierea evenimentului.
6. Ștergerea obișnuită a reminderelor cere sincronizarea Core. Ștergerea integrală explicită a datelor locale are un contract separat: anulează notificările și poate elimina outbox-ul local odată cu restul jurnalului local, fără să depindă de disponibilitatea Core.

### Teste adăugate/actualizate
- Persistare `pending` înainte de efectul nativ și emiterea evenimentului Core doar după succes.
- Recovery după crash în jurul programării, inclusiv outcome incert.
- Retry idempotent al outbox-ului Core și păstrarea event refs.
- Lifecycle distinct pentru create/snooze/complete/cancel.
- Blocarea clear-all obișnuit cât timp există evenimente Core nesincronizate.
- Ștergerea completă explicită fără dependență de Core.
- Recall visibility, integrare Core Port și limite de confidențialitate.

### CI pentru HEAD runtime `a09f47d9`
- Cloud API: **PASS**.
- Node/Core, invariants, phase-2 property sequences, coverage și Replay benchmark: **PASS**.
- Chromium E2E: **PASS**.
- Firefox E2E: **PASS**.
- WebKit E2E: **RUNNING** la ultima verificare.
- Android debug APK: **RUNNING** la ultima verificare.
- iOS Simulator build: **PASS**.

Build-urile WebKit și Android nu sunt declarate PASS până când Actions nu confirmă finalizarea. Commitul de checkpoint de mai jos este documentar; runtime code HEAD rămâne `a09f47d9`.

### Limite cunoscute / următorul pas
- Reminder events sunt în jurnalul Core ca evenimente `event.note` cu payload structurat; încă nu există o proiecție canonicală dedicată Task/Reminder în DB Core.
- Offline outbox-ul este local și retry-on-start/manual; nu există job unattended/background.
- Recall visibility este testată pe date structurate locale; apel OpenAI real și E2E UI de provider rămân deschise.
- Mai rămân TTS, abonamentele Small/Medium/Large, store sandbox, Supabase/producție, privacy/encryption review, device acceptance și signed store builds.

Nu activa background processing, billing live sau deployment și nu scoate PR #55 din draft fără decizie explicită.


## Checkpoint — canonical Reminder Task lifecycle (26 Nov 2026)

- PR #55 remains open/draft/unmerged. Branch: `feature/openai-provider-integration`; no changes to `main`.
- CI on preceding HEAD `a2295f4e` was fully green: Quality Suite including Chromium/Firefox/WebKit, Android debug APK, iOS Simulator and Cloud API. The new commits after that HEAD require fresh CI confirmation.
- Implemented canonical Core entities for reminder tasks using replayable `task` entities and `attribute.set` journal events. Stable task identity is `task:reminder:<reminderId>`; attributes include task kind, reminder ID, due time, source ID, status, schedule state and transition timestamps.
- Supported task statuses: `open`, `completed`, `snoozed`, `cancelled`. Scheduling uncertainty is represented separately as `scheduleState=uncertain`.
- Snooze is distinguishable from cancellation and links the old task to the successor reminder/task and its due timestamp. Local reminder history now displays completed, snoozed and cancelled outcomes separately.
- Recall returns typed task evidence including status, due date, source reference and successor identifiers. Raw transcript/source context is not copied into Core.
- A terminal lifecycle received before the first successful schedule event can still create a terminal task, covering compensated schedule recovery.
- Tests cover task creation, CorePort commit/replay, completion, terminal-state validation, invalid source, ID collision, successor metadata, local snooze outbox lifecycle and Node/browser Recall parity.
- Remaining: run CI on the current HEAD; implement general non-reminder task creation/dependencies/assignment/priority/recurrence and dedicated UI; physical-device notification and audio acceptance; real-provider Recall acceptance.
- Release boundary unchanged: no merge, production deployment, live billing or Store-readiness claim.


## Checkpoint continuare — Recall tasks + CI complet verde (26 nov 2026)

### Starea exactă a codului
- Repo: `davidlucian-ioan/Aplicatie`
- Branch: `feature/openai-provider-integration`
- Runtime code HEAD verificat: `563ac92649ed0d5441efd76b2fe101f570694d69`
- PR #55: open, draft, unmerged. Nu modifica `main`, nu face deployment și nu activa billing live.
- CI pe runtime HEAD:
  - Quality Suite run #45891930716 — PASS, inclusiv E2E Chromium, Firefox și WebKit.
  - Cloud API run #45891930813 — PASS.
  - Mobile build run #45891930564 — PASS, Android debug APK și iOS Simulator package.

### Ce s-a implementat în această continuare
- Reminder lifecycle este reprezentat ca entitate Core canonică `task` cu identitate stabilă `task:reminder:<reminderId>`; starea este derivată din evenimente de jurnal și reconstruibilă prin replay.
- Task status: `open`, `completed`, `snoozed`, `cancelled`. Starea native scheduling e separată: programată, incertă sau settled. O programare incertă nu este afișată drept notificare activă.
- Snooze este un lifecycle distinct, nu o anulare: task-ul vechi reține successor reminder/task ID și noul termen.
- Recall returnează task-uri tipizate, le prioritizează în evidence list și nu le dublează ca entități generice.
- Server-side context sanitizer permite doar câmpuri bounded din task evidence; câmpurile arbitrare, transcriptul și payload-urile audio sunt eliminate.
- Recall UI afișează status, termen, sursă, successor și marchează explicit `scheduleState=uncertain`.
- Recall AI rămâne read-only; modelului îi sunt trimise doar dovezile recuperate, iar sursele răspunsului sunt validate contra ID-urilor exacte din rezultat.

### Teste noi sau actualizate
- Creare task canonică, status transitions, CorePort commit/replay și verificarea attribute history.
- Refuz pentru ID collisions, surse incompatibile și tranziții terminale invalide.
- Snooze lineage și recovery când programarea nativă a fost compensată înainte de primul sync.
- Recall Node/browser parity, task prioritization, fără duplicare în lista de entități.
- Sanitizer server-side pentru task evidence, stripping de câmpuri arbitrare și UI wiring pentru status/termen/schedule uncertainty.

### Ce rămâne pentru lansare
1. Test Recall cu provider OpenAI real și autentificare cloud; testele curente folosesc provider mock și sanitizer server-side.
2. Acceptance pe telefoane fizice: microfon, background/foreground, restart, notificări și snooze în OS.
3. Task manager general (nu doar reminder-backed): creare, dependențe, priorități, assignment, recurrence și UI dedicat.
4. TTS, sincronizare multi-device/offline și backend production isolation.
5. Subscription tiers/entitlements, sandbox Apple/Google, privacy/encryption review, monitorizare și build-uri release semnate.


## Checkpoint continuare — General Task Manager MVP + CI verde (27 nov 2026)

### Repository și verificare
- Repo: `davidlucian-ioan/Aplicatie`
- Branch: `feature/openai-provider-integration`
- Runtime code HEAD verificat: `d5f2daa90d193543539c0ef80345862d144ab52a`
- PR #55: open/draft/unmerged. `main` nu a fost modificat; nu s-a făcut merge, deployment sau activare billing live.
- CI pe runtime HEAD:
  - Quality Suite run #45908220359 — PASS; Node/Core/AI tests, generated invariants, Core phase-2 sequences, Replay benchmark, Chromium, Firefox și WebKit E2E.
  - Cloud API run #45908220402 — PASS; authenticated Cloud API tests și deployable container build.
  - Mobile run #45908220494 — PASS; Android debug APK și iOS Simulator package.

### General Task Manager implementat
- Task-urile generale sunt entități Core canonic separate de reminders: `taskKind=user`, ID stabil `task:user:<taskId>`.
- Work recunoaște intenția AI `task` și creează task prin validare, Core preview și confirmare explicită. Task-ul poate avea un termen opțional; ora nu este inventată. Numai `intent=reminder` programează o notificare nativă.
- Think afișează task-urile active cu status, termen, prioritate și blockers; acțiuni: începe, pune în așteptare, finalizează, anulează.
- Dependențele pot fi adăugate din Think, prin selectarea unui prerequisite general. Core respinge auto-dependența, edge duplicat, cicluri și dependențe către reminder-only entities. Finalizarea este blocată de prerequisite-urile nefinalizate.
- Recall include task-uri generale și reminders într-o colecție tipizată. Task evidence expune status, due date/time, priority, source reference și blockedBy; datele sunt allowlisted/bounded înainte de transmiterea către AI.

### Validare și protecția datelor
- CI complet verde pe runtime HEAD, inclusiv browser E2E în Chromium/Firefox/WebKit și build-uri Android/iOS Simulator.
- Testele live Recall există în `cloud-api/live-recall-acceptance.js`, rulate manual cu `npm run acceptance:recall:live`. Cer opt-in explicit, HTTPS, token Supabase, entitlement Pro, provider/billing configurate și buget minim disponibil înaintea unui singur apel Recall read-only.
- **Testul cu provider OpenAI real nu a fost executat**: nu este configurat un proiect Supabase de producție/secretele/entitlement-ul necesare în acest mediu. CI verifică traseul cu provider mock; nu afirmăm live-provider acceptance.

### Ce rămâne
1. Test Recall live cu backend real, utilizator Pro și buget autorizat; testul smoke este deja pregătit și protejat.
2. Teste pe telefoane fizice: audio, background/foreground, restart, notificări și snooze OS.
3. Extindere Task Manager: editare task, assignment, recurrence, prioritizare mai bogată și istoric dedicat.
4. TTS, sincronizare multi-device/offline și backend production isolation.
5. Store sandbox Apple/Google, privacy/encryption review, cost ceilings, monitorizare și build-uri release semnate.
6. Review final de produs/securitate înainte de a scoate PR-ul din Draft.

### Limită de release
Nu face merge în `main`, nu activa billing live și nu publica build-uri Store fără revizuire și aprobare explicită.


## Task Manager — editare task-uri generale (27 nov. 2026)

- Think task board adaugă acțiunea **Editează** pentru task-urile generale.
- Editarea permite titlu, termen dată, oră explicită, timezone IANA pentru deadline-uri cu oră și prioritate.
- Comanda `task.edit` trece prin validare, Core preview și confirmare explicită; modificările sunt journaled și replayable (`entity.rename` + `attribute.set`).
- Eliminarea deadline-ului scrie valori `null` pentru dată/oră și elimină timezone-ul; nu inventează valori implicite.
- Teste unitare pentru validare și clearing au fost adăugate. CI pe commitul următor trebuie să confirme complet testele, Cloud API și build-urile mobile.
