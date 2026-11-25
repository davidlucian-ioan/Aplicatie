# Collector — punct unic de continuare

Ultima actualizare: 2026-11-24
Versiune de lucru: v0.8 — OpenAI Provider Integration (branch separat)

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
