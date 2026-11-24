# Collector — aplicație mobilă și lansare comercială

Ultima actualizare: 2026-11-24
Stare: direcție de produs confirmată; implementarea mobilă nu a început încă.

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
**Stare: implementat; validarea SQLite este în curs**
1. Capacitor 8.6.2 și `capacitor.config.json`; `appId` curent `ro.collector.mobile` este provizoriu până la confirmarea identității comerciale.
2. Bundle web allowlist (`build-mobile.js`) care include numai active runtime, fără server, chei, teste sau documente interne.
3. Work și Think sunt acum ecrane distincte în UI.
4. Pluginul Local Notifications 8.3.1 este integrat în shell; reminder-ele sunt salvate local și programate nativ, fără permisiune specială pentru alarme exacte pe Android (se folosește programare inexactă).
5. Pipeline GitHub Actions construiește Android debug APK și iOS Simulator app. Un build anterior cu Capacitor + Local Notifications a trecut pe ambele platforme; build-ul actual cu SQLite este încă în verificare.
6. Build-urile curente sunt pentru verificare, nu AAB/IPA semnate pentru distribuție.

### M2 — Funcții native și persistență
1. Validare pe dispozitive reale a adapterului SQLite și a migrării v7; testarea reluării conexiunii la revenirea din background.
2. Mutarea fișierelor audio din IndexedDB în stocare nativă Filesystem și metadate în SQLite.
3. Verificarea MediaRecorder/microfonului pe iOS și Android; suportul actual pentru audio în background nu este încă garantat.
4. Teste pentru notificări, restart, permisiuni și comportament Android Doze/iOS Focus.
5. Import/export nativ prin Files/Share Sheet și recuperare după erori.

### M3 — Backend multiutilizator și sincronizare
1. Serviciu backend cloud separat de serverul local.
2. Autentificare, tenancy și autorizare.
3. Sync incremental cu idempotency și conflict handling.
4. Backup, export și ștergere cont.
5. OpenAI proxy cu cote/limitare pe utilizator și protecția datelor.

### M4 — Monetizare
1. Definirea planurilor și limitelor comerciale.
2. Billing nativ Android/iOS și validare server-side a chitanțelor/entitlements.
3. Restaurare achiziții și acces cross-platform.
4. Teste sandbox pentru achiziții, anulare, refund și expirare.

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
- `app.js` folosește direct localStorage pentru baza de date; necesită abstractizare înainte ca SQLite să fie sursa mobilă.
- `audio-store.js` folosește IndexedDB; în versiunea mobilă trebuie stabilit storage nativ pentru fișiere audio și metadate.
- UI-ul actual folosește browser SpeechRecognition/MediaRecorder; suportul diferă între WebView-uri și necesită implementare/testare nativă.
- `server.js` ascultă pe 127.0.0.1, folosește .env local și nu are autentificare multiutilizator; nu poate fi expus ca backend de producție.
- Nu există încă autentificare, sincronizare multi-device, billing, privacy policy sau account deletion.
- Build-ul iOS necesită Xcode/macOS sau un serviciu CI macOS; build-ul Android necesită Android SDK/Gradle. Acestea sunt cerințe de dezvoltare/publicare, nu cerințe pentru utilizatorul final.

## Audit M0 — constatări din cod
- Audit static salvat în `MOBILE-COMPATIBILITY-AUDIT.md`.
- UI-ul actual încă nu conține navigația Work/Think; aceasta rămâne o cerință de implementat, nu o funcție existentă în branch.
- `app.js` folosește direct localStorage; `audio-store.js` folosește IndexedDB; înregistrarea depinde de MediaRecorder/getUserMedia; dictarea depinde de SpeechRecognition/webkitSpeechRecognition; export/import folosește Blob/URL/File input; wake lock este best-effort.
- Nu a fost identificată implementare de notificări locale.
- `server.js` este exclusiv local și nu poate fi backend comercial.

## Starea reală la 2026-11-24
- OpenAI provider este implementat pe branch-ul `feature/openai-provider-integration`, PR draft #55; nu s-a făcut încă un apel cu o cheie API reală.
- Capacitor 8.6.2 shell, configurarea Android/iOS, build allowlist, Work/Think și reminders native sunt implementate.
- StorageAdapter asincron și adapter SQLite nativ sunt implementate; build-ul CI curent verifică integrarea SQLite pe ambele platforme.
- Un build Android debug și un build iOS Simulator cu Capacitor + Local Notifications au trecut anterior; nu sunt build-uri semnate sau pregătite de store.
- Nu există încă backend cloud multiutilizator, autentificare, sincronizare, billing, ștergere cont sau privacy policy.
- Nu există încă testare pe dispozitive fizice. Audio folosește încă MediaRecorder + IndexedDB.
- Nu declara aplicația gata de vânzare/store. Următorul pas: obține CI verde pe SQLite, apoi mută audio în Filesystem nativ și verifică microfonul/notificările pe dispozitive reale.
