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

### M0 — Audit de compatibilitate și contracte (următorul pas)
1. Inventarierea accesului direct la localStorage, IndexedDB, MediaRecorder, SpeechRecognition, notificări și APIs de browser.
2. Definirea StorageAdapter și a testelor de contract pentru adapter.
3. Definirea contractelor de autentificare, sincronizare, outbox și entitlements.
4. Identificarea dependențelor care nu funcționează în WKWebView/Android WebView.
5. Menținerea testelor Core actuale ca gate obligatoriu.

### M1 — Shell nativ
1. Adăugarea Capacitor 8 și configurarea appId stabil.
2. Proiecte Android/iOS și pipeline de build.
3. Splash/icon/permissions și navigație responsive.
4. Smoke tests pe Android și iOS.
5. Fără modificări în comportamentul Core în această etapă.

### M2 — Funcții native și persistență
1. SQLite adapter și migrare sigură v7.
2. Înregistrare audio nativă și redare/export.
3. Notificări locale și permisiuni.
4. Gestionarea stărilor background/foreground, întreruperilor și bateriei.
5. Teste de pierdere/revenire a conexiunii și restart al aplicației.

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

## Starea reală la 2026-11-24
- OpenAI provider este implementat pe branch-ul `feature/openai-provider-integration`, PR draft #55.
- CI pentru commitul `0d97ada1` a trecut atât pe push, cât și pe pull_request.
- Integrarea AI reală cu o cheie API nu a fost încă testată.
- Nicio implementare Capacitor/native/backend comercial nu a fost făcută încă.
- Următoarea activitate tehnică este M0: auditul compatibilității și introducerea StorageAdapter fără regresii.
