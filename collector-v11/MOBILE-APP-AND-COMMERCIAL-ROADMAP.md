# Collector — aplicație mobilă și lansare comercială

Ultima actualizare: 2026-11-24
Stare: shell mobil și funcții native de bază implementate; Android debug APK validat în CI la commitul a00989d0; iOS Simulator build încă în coada CI. Nu este încă versiune semnată sau pregătită de store.

## Obiectiv de produs

Collector trebuie să fie o aplicație instalabilă și comercializabilă prin:
- Google Play pentru Android (AAB de producție).
- Apple App Store pentru iPhone (build iOS semnat și distribuit prin App Store Connect).

Utilizarea normală nu trebuie să depindă de un PC, de un server pornit acasă sau de o conexiune la aceeași rețea Wi-Fi. PC-ul poate fi folosit doar ca unealtă de dezvoltare/build.

## Decizie tehnică propusă: Capacitor 8

Aplicația existentă este construită în HTML/CSS/JavaScript fără framework UI și are deja un Core JavaScript testat. Pentru a păstra investiția și a evita rescrierea prematură a Core-ului, ruta recomandată este Capacitor 8:
- reutilizează UI-ul și logica JavaScript existentă;
- generează proiecte native Android și iOS;
- permite integrarea API-urilor native prin pluginuri și cod Swift/Kotlin;
- permite evoluția treptată către UX nativ unde este justificat.

Nu transformăm Collector într-un simplu site împachetat: trebuie integrate funcțiile native reale, persistența mobilă robustă, ciclul de viață al aplicației și experiența specifică telefonului.

Documentație oficială:
- https://capacitorjs.com/docs
- https://capacitorjs.com/docs/getting-started
- https://capacitorjs.com/docs/android
- https://capacitorjs.com/docs/ios

## Arhitectură țintă

### 1. Aplicația mobilă
- Un singur produs și un singur set de reguli Core pentru Android și iOS.
- Păstrăm ecranele Work și Think ca separare principală de experiență.
- Work: înregistrare rapidă, comenzi hands-free, alarme/notificări, acțiuni frecvente și stare clară de înregistrare.
- Think: analiză, grafice, configurare, audit, import/export și administrare.
- Interfață adaptată pentru touch, safe areas, tastatură, ecrane mici și accesibilitate.
- Deep links, icon, splash screen, permisiuni explicate contextual și comportament corect la revenirea din background.

### 2. Date locale și offline
- Core rămâne event-sourced și autoritatea pentru validare, preview, atomicitate și replay.
- Introducem o interfață StorageAdapter, fără acces direct la localStorage din Core.
- Web/test: adapterul actual poate rămâne pentru compatibilitate.
- Mobile: SQLite ca stocare persistentă principală pentru jurnal și proiecții; audio în fișiere locale cu metadate în baza de date.
- Migrare versionată și verificată din schema actuală v7; nu ștergem și nu suprascriem date dacă verificarea/replay eșuează.
- Comenzile offline intră într-un outbox cu idempotency keys și se sincronizează când revine conexiunea.

### 3. Backend de producție
Serverul actual `server.js` este un server local de dezvoltare și NU este backend-ul comercial final.
Backend-ul de producție va avea:
- API HTTPS public, autentificare și sesiuni sigure;
- utilizatori, spații de lucru și izolare strictă între conturi/tenants;
- sincronizare incrementală pentru jurnalul de evenimente, cu idempotency și reconciliere;
- stocare cloud pentru backup/sync și audio doar dacă utilizatorul activează funcția;
- rate limits, audit, observabilitate, backup/restore și politici de retenție;
- endpoint OpenAI server-side; cheia OpenAI nu ajunge niciodată în aplicația mobilă;
- verificarea abonamentelor și a drepturilor premium pe server, nu doar în UI.

### 4. Conturi, planuri și plăți
- Separăm datele locale gratuite de serviciile cloud/premium, după definirea planurilor comerciale.
- Pentru funcții digitale/abonamente vândute în aplicație, integrarea trebuie să respecte Apple In-App Purchase și Google Play Billing, cu excepțiile regionale aplicabile.
- Evaluăm un serviciu de entitlement/receipt validation (de ex. RevenueCat) înainte de alegerea finală; nu legăm Core de un furnizor de billing.
- Restaurare achiziții, anulare/management abonament, perioadă de probă dacă va exista, upgrade/downgrade și acces cross-platform.
- Nu fixăm încă prețuri, niveluri de abonament sau model freemium fără decizie de produs.

Surse oficiale:
- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Google Play Payments policy: https://support.google.com/googleplay/android-developer/answer/9858738
- Apple Developer Program: https://developer.apple.com/programs/

### 5. Conformitate și pregătire pentru store
Înainte de lansare:
- Privacy Policy publică și URL de suport;
- termeni de utilizare și informații comerciale clare;
- GDPR: export, ștergere cont/date, minimizare, retenție, consimțământ și drepturi;
- Apple privacy details și Google Play Data safety completate corect;
- permisiuni pentru microfon/notificări solicitate doar la nevoie și explicate;
- flux complet de creare cont, autentificare, logout și ștergere cont;
- cont/demo pentru App Review dacă aplicația cere autentificare;
- screenshots, icon, descrieri, categorii, rating de vârstă și metadate;
- testare pe dispozitive reale, crash reporting și proces de suport;
- verificarea regulilor de plată pentru fiecare storefront/țară în care se distribuie.

## Etape de implementare

### M0 — Audit de compatibilitate și contracte
**Stare: în mare parte implementat**
- Audit static și contract de stocare asincron.
- `app.js` folosește acum StorageAdapter, fără apeluri directe `localStorage.getItem/setItem`.
- Adapter web și adapter nativ SQLite; pe mobil, SQLite este sursa principală, iar localStorage este citit doar ca sursă legacy până când Core validează și rescrie schema v7.
- Scrierile sunt serializate; operațiile UI și confirmările AI folosesc aceeași coadă de mutații.
- Teste de contract pentru web/SQLite, concurență, rollback și fallback de migrare.

### M1 — Shell nativ
1. Inventarierea accesului direct la localStorage, IndexedDB, MediaRecorder, SpeechRecognition, notificări și APIs de browser.
2. Definirea StorageAdapter și a testelor de contract pentru adapter.
3. Definirea contractelor de autentificare, sincronizare, outbox și entitlements.
4. Identificarea dependențelor care nu funcționează în WKWebView/Android WebView.
5. Menținerea testelor Core actuale ca gate obligatoriu.

### M1 — Shell nativ
**Stare: implementat în cod; Android debug build trecut, iOS build în așteptare CI; validarea pe dispozitive fizice rămâne deschisă**
1. Capacitor 8.6.2 și `capacitor.config.json`; `appId` curent `ro.collector.mobile` este provizoriu până la confirmarea identității comerciale.
2. Bundle web allowlist (`build-mobile.js`) care include numai active runtime, fără server, chei, teste sau documente interne.
3. Work și Think sunt acum ecrane distincte în UI.
4. Pluginul Local Notifications 8.3.1 este integrat în shell; reminder-ele sunt salvate local și programate nativ, fără permisiune specială pentru alarme exacte pe Android (se folosește programare inexactă).
5. Pipeline GitHub Actions construiește Android debug APK și iOS Simulator app. Pe commitul `a00989d0`, jobul Android a trecut și artifactul `collector-android-debug` a fost generat; jobul iOS era încă `queued` la ultima verificare. Suita de calitate și Cloud API au trecut.
6. Build-urile curente sunt pentru verificare, nu AAB/IPA semnate pentru distribuție.

### M2 — Funcții native și persistență
**Stare: implementate în cod, cu validare hardware încă necesară**
1. Adapter SQLite nativ și migrare v7 implementate; testele automate de contract trec. Rămâne validarea pe dispozitive reale și la reluarea aplicației din background.
2. Audio nativ AAC, stocare privată Filesystem și metadate SQLite implementate; migrarea IndexedDB păstrează sursa până la persistarea noii copii.
3. Permisiuni microfon Android/iOS și mod audio background iOS configurate. Înregistrarea lungă Android în background încă necesită validare și posibil foreground service.
4. Notificări locale native implementate; trebuie testate livrarea după restart, Doze și Focus pe dispozitive reale.
5. Import/export nativ prin Files/Share Sheet și recuperare după erori rămân de finalizat.

### M3 — Backend multiutilizator și sincronizare
1. Serviciu Node cloud separat de serverul local — schelet Docker/API creat în `cloud-api/`.
2. Validarea tokenurilor Supabase și rate limit per utilizator — implementate în backend.
3. Client Supabase Auth anonim în build-ul mobil, cu sesiune păstrată prin Secure Storage; tokenul nu este hardcodat — implementat în cod, dar necesită proiect Supabase real și setarea variabilelor.
4. Endpoint server-side OpenAI și ștergere cont cloud — implementate; ștergerea cere `SUPABASE_SERVICE_ROLE_KEY` exclusiv pe server.
5. Nu există încă proiect Supabase configurat/deploy și endpoint public. Sync incremental, tenancy/workspaces, backup și conflict handling nu sunt implementate.

### M4 — Monetizare
**Stare: neimplementată; modelul tehnic și estimarea sunt documentate în `MONETIZATION-AND-COST-MODEL.md`.**
1. Propunere de produs: Free păstrează Core local, Work/Think, audio și notificări locale; Pro deblochează AI cu buget lunar și serviciile cloud după implementarea sync/backup.
2. Recomandare de evaluat: RevenueCat ca strat de achiziții cross-platform; webhook semnat către Cloud API și entitlement verificat server-side. Core rămâne independent de furnizorul de billing.
3. Adaugă identitate recuperabilă/cont link-uit; autentificarea anonimă actuală nu este suficientă pentru restaurare robustă între dispozitive.
4. Adaugă tabele persistente pentru subscriptions/entitlements, ai_usage, usage_budgets și billing_webhook_events; webhook-urile trebuie idempotente.
5. Măsoară tokenii și costul efectiv înainte/după fiecare cerere AI; plafon lunar și spend caps. Rate limit-ul actual de 20/minut este doar temporar și nu este un buget lunar.
6. Integrează Google Play Billing + Apple StoreKit prin RevenueCat; teste sandbox pentru achiziție, restore, upgrade/downgrade, refund, anulare și expirare.
7. Prețurile/planurile din documentul de cost sunt ipoteze, nu decizii aprobate. Calibrează quota și prețul după pilot și costurile reale.

### M5 — Lansare
1. TestFlight și Google Play internal/closed testing.
2. Remedierea crash-urilor și a problemelor de UX.
3. Completarea documentelor și metadatelor store.
4. Submit spre review și lansare graduală.
5. Monitorizare și plan de rollback.

## Reguli care nu se negociază
- Nu rescrie Core și nu modifica deciziile D-001–D-044 fără analiză de impact.
- AI rămâne propunere/interpretare; Core validează; utilizatorul confirmă.
- Nicio comandă AI nu se execută automat.
- Nicio cheie API, secret de server sau credențial privat în bundle-ul mobil.
- Izolare multi-tenant verificată pe server; nu presupune că UI ascunde datele altui utilizator.
- Nu declara aplicația pregătită pentru store doar pentru că se compilează.
- Nu publica și nu merge în main fără aprobarea explicită a utilizatorului.
- Nu solicita utilizatorului să repete context deja salvat în documentația proiectului.

## Riscuri tehnice deja identificate
- `server.js` ascultă local și nu este backend comercial; `cloud-api/` este scheletul separat de producție, dar nu este încă deployat.
- Audio și notificările au implementări native; comportamentul real pe dispozitive și în background nu este încă certificat.
- Nu există încă sync multi-device, billing, privacy policy finală sau testare end-to-end pe cont Supabase real.
- Dependențele Capacitor sunt instalate în CI cu versiuni fixate, dar nu sunt încă declarate în `package.json`/`package-lock.json`; reproducibilitatea instalării locale și a buildului trebuie îmbunătățită înainte de release.
- Build-ul iOS necesită Xcode/macOS sau un serviciu CI macOS; build-ul Android necesită Android SDK/Gradle. Acestea sunt cerințe de dezvoltare/publicare, nu cerințe pentru utilizatorul final.

## Audit M0 — constatări din cod
- Audit static salvat în `MOBILE-COMPATIBILITY-AUDIT.md`.
- Constatările din auditul inițial de mai sus sunt istorice și au fost remediate parțial ulterior: Work/Think, StorageAdapter/SQLite, recorder AAC/Filesystem, notificări locale și client auth sunt acum în branch.
- Auditul rămâne static și nu înlocuiește testarea pe dispozitive fizice sau validarea backendului deployat.
- `server.js` local nu este backend comercial; backendul separat este `cloud-api/`.

## Configurare build mobil și cloud
- Variabile publice injectate în build: `COLLECTOR_API_BASE_URL`, `COLLECTOR_SUPABASE_URL`, `COLLECTOR_SUPABASE_ANON_KEY` (GitHub Actions repository variables).
- Variabile server-side: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `COLLECTOR_ALLOWED_ORIGINS`.
- `SUPABASE_ANON_KEY` este publică și poate fi în bundle; `SUPABASE_SERVICE_ROLE_KEY` și `OPENAI_API_KEY` nu trebuie niciodată incluse în aplicație.
- Supabase trebuie configurat pentru anonymous sign-ins. Clientul creează o sesiune anonimă, iar utilizatorul poate șterge contul cloud din ecranul Audit; după ștergere, cloud rămâne dezactivat până la reactivare explicită.

## Starea reală la 2026-11-24
- OpenAI provider este implementat pe branch-ul `feature/openai-provider-integration`, PR draft #55; nu s-a făcut încă un apel cu o cheie API reală.
- Capacitor 8.6.2 shell, configurarea Android/iOS, build allowlist, Work/Think și reminders native sunt implementate.
- StorageAdapter asincron și adapter SQLite nativ sunt implementate; build-ul CI curent verifică integrarea SQLite pe ambele platforme.
- Un build Android debug și un build iOS Simulator cu Capacitor + Local Notifications au trecut anterior; nu sunt build-uri semnate sau pregătite de store.
- Nu există încă backend cloud multiutilizator, autentificare, sincronizare, billing, ștergere cont sau privacy policy.
- Nu există încă testare pe dispozitive fizice. Audio folosește încă MediaRecorder + IndexedDB.
- Nu declara aplicația gata de vânzare/store. Următorul pas: obține CI verde pe SQLite, apoi mută audio în Filesystem nativ și verifică microfonul/notificările pe dispozitive reale.


## Verificare CI actualizată — 2026-11-24 seara
- Commit verificat: `a00989d0b6bb40f409160449fd537a5e7b8af979` (PR draft #55).
- Workflow `Collector quality suite`: `success`.
- Workflow `Collector Cloud API`: `success`, inclusiv testele Node și build-ul Docker.
- Workflow `Collector mobile build`: Android debug job `success`; artifact `collector-android-debug` generat (3.9 MB). iOS Simulator job era încă `queued`, deci nu declarăm build iOS validat.
- APK-ul Android este debug-only, nu AAB semnat pentru Play Store. iOS Simulator app, chiar după build, nu va fi IPA semnat pentru App Store.
- Nu s-a făcut merge în `main`.


## Verificare build curent 0b751ee4 — 2026-11-24

- Commit: `0b751ee4c62a86c6daf5e8f07370fb1e3ff988f8`, branch `feature/openai-provider-integration`, PR #55 draft/deschis, fără merge în main.
- Quality Suite: SUCCESS; testele Core, invariants, benchmark și E2E Chromium/Firefox/WebKit au trecut. Mutation baseline nightly a fost skipped, nu este gate-ul acestei rulari.
- Cloud API: SUCCESS; testele și Docker build au trecut.
- Android debug APK: SUCCESS; artifact descărcat și verificat ca pachet Android valid (4,278,250 bytes). Este build de debug, nu AAB de producție.
- Scanare bundle APK: nu conține `server.js`; nu au fost găsite fișiere .env sau chei secrete în asset-urile inspectate. `collector-config.js` are câmpurile API/Supabase goale, astfel încât AI/cloud sunt dezactivate în acest APK. App ID `ro.collector.mobile` este încă provizoriu.
- iOS Simulator job: QUEUED la ultima verificare; nu există încă rezultat de build iOS.
- SQLite encryption este setată false pentru Android și iOS. Este un risc deschis înainte de lansarea comercială și trebuie evaluată criptarea at-rest.
- Dependențele Capacitor/plugin sunt instalate cu versiuni fixate în workflow, dar încă nu sunt gestionate complet prin package.json/package-lock.json.
- Nu există încă backend cloud deployat, proiect Supabase configurat, sesiune reală, apel OpenAI real, sync multi-device, billing, build semnat, privacy policy finală sau testare pe dispozitive fizice.
- Următorii pași: iOS runner; lockfile reproductibil; decizie și implementare criptare SQLite; deploy backend + Supabase; testare reală Android/iOS; apoi billing și pregătire store. Nu declara aplicația pregătită de store.


## Corelare abonament și costuri — 2026-11-24
- Auditul și estimarea sunt salvate în `MONETIZATION-AND-COST-MODEL.md`.
- Fundația existentă: Supabase Auth anonim, Cloud API autentificat, OpenAI server-side, context minimizat, Core local-first și audio local.
- Lipsesc complet billing, entitlement, restore purchases, usage metering lunar, quota/cost cap per utilizator, proiect Supabase real, deployment și sync/backup multi-device.
- Nu activa endpoint-ul AI public înainte de entitlement server-side și usage budget persistent.
- Estimare de bază pentru început: ~32 USD/lună pentru Render Starter + Supabase Pro, fără AI, taxe, domeniu și scalare. OpenAI la modelul curent: aproximativ 0,009–0,020 USD per solicitare în scenariile de tokeni documentate.
- Reduceri sigure: AI numai la cerere, context minim, STT/audio local, model mai economic doar după benchmark de contract/regresie, buget pe tokeni și plafon de cheltuieli. Nu reduce securitatea, validarea Core sau confirmarea utilizatorului.
