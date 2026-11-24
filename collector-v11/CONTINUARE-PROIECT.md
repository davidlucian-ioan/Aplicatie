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
