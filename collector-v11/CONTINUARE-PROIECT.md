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
