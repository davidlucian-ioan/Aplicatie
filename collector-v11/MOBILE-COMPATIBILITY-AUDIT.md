# Collector — audit de compatibilitate mobilă M0

Data: 2026-11-24
Branch inspectat: `feature/openai-provider-integration`
Scop: inventarierea dependențelor de browser înainte de integrarea Capacitor.

## Constatări verificate în cod

| Zonă | Stare actuală | Consecință pentru aplicația mobilă |
|---|---|---|
| UI | HTML/CSS/JS fără framework; Work și Think sunt ecrane distincte, cu modulele administrative în aceeași navigație | Shell-ul Capacitor reutilizează UI-ul; adaptarea fină touch/safe-area și testarea pe dispozitive rămân necesare |
| Work / Think | Navigația principală are Work și Think; Work include înregistrare și formular de alarme | Cerința de bază este implementată; alarmele necesită build nativ și testare pe dispozitive |
| Baza de date | `app.js` folosește StorageAdapter asincron; pe mobil este selectat SQLite, pe web localStorage | Adapterul nativ este implementat; migrarea legacy v7 și validarea pe dispozitive sunt încă de verificat |
| Core | `engine.js` este JavaScript independent de UI și lucrează pe starea transmisă | Poate rămâne comun între web, Android și iOS; păstrăm testele curente |
| Core Port | `app.js` creează BrowserCorePort cu un store bazat pe starea din memorie și `persistRaw` | Trebuie păstrată interfața de store, dar implementarea persistării devine adapter |
| Audio metadata/data | `audio-store.js` folosește încă IndexedDB și ArrayBuffer | Migrarea în Filesystem nativ cu metadate SQLite este următorul pas |
| Microfon | Web fallback: `getUserMedia`/`MediaRecorder`. Mobil: `@capgo/capacitor-audio-recorder` AAC | Recorder nativ implementat; permisiunile Android/iOS sunt configurate. Background iOS activat; Android necesită foreground service pentru sesiuni lungi |
| Dictare | `SpeechRecognition` / `webkitSpeechRecognition` | API neuniform între WebView-uri; nu poate fi considerat suport garantat. Planificăm bridge/plugin nativ sau provider cloud opțional |
| Ecran activ | `navigator.wakeLock` și `visibilitychange` | Wake Lock este best-effort; înregistrarea trebuie proiectată pentru lock/background și restricțiile OS |
| Import/export | File input, Blob, URL.createObjectURL și download link | Fluxurile native Files/Share Sheet rămân de implementat; exportul actual este orientat browser |
| AI | Browser provider comunică cu endpoint relativ same-origin | În mobil va apela un API HTTPS public; cheia OpenAI rămâne numai în backend |
| Notificări | `reminders.js` folosește Local Notifications 8.3.1 în build-urile native | Programarea și permisiunile sunt implementate; testarea hardware și comportamentul la restart/Doze/Focus rămân necesare |
| Backend | `server.js` ascultă implicit pe 127.0.0.1, citește .env local, fără autentificare multi-user | Exclusiv dezvoltare locală; nu se expune și nu se folosește drept backend comercial |

## Contracte recomandate înainte de integrarea SQLite

1. `initialize()` deschide și pregătește backend-ul de stocare.
2. `readRaw(key)` și `writeRaw(key, value)` expun persistență asincronă; `removeRaw` și `flush` completează contractul.
3. Adapterul web folosește localStorage; adapterul mobil folosește SQLite cu parametri SQL legați.
4. Pe mobil, `readRaw` citește legacy localStorage doar dacă cheia nu există în SQLite; datele legacy nu sunt șterse automat.
5. Core validează/replay-ează schema v7 înainte ca snapshot-ul verificat să fie rescris în SQLite.
6. Scrierile sunt serializate; erorile de persistență sunt propagate, nu mascate.
7. UI/Core nu cunosc detalii despre backend-ul de stocare.

## Ordinea sigură de implementare

1. Finalizează CI-ul Android/iOS cu pluginul SQLite și rulează testele de contract.
2. Testează migrarea v7 pe dispozitive fizice; verifică închiderea/revenirea aplicației și datele persistente.
3. Mută audio din IndexedDB în Filesystem nativ și definește suportul de înregistrare în background.
4. Testează dictarea și permisiunile microfonului pe iOS/Android.
5. Testează notificările locale, anularea și livrarea după restart/Doze/Focus.
6. Completează build-urile reproductibile cu dependențe și lockfile.
7. Separat, construiește backend cloud multi-tenant, autentificare, sincronizare și endpoint AI public.

## Extensii mobile implementate ulterior
- `storage-adapter.js` folosește SQLite nativ și păstrează adapterul web pentru browser; Core rămâne comun.
- `audio-store.js` migrează înregistrările IndexedDB către fișiere private native și index SQLite.
- `native-audio-recorder.js` folosește pluginul AAC nativ, copiază fișierul final în storage persistent și curăță segmente temporare.
- `configure-native-projects.js` adaugă permisiunea microfonului, UIBackgroundModes audio și PrivacyInfo.xcprivacy în resursele Xcode.
- `auth-client-entry.js` bundlează Supabase JS și Secure Storage; sesiunea anonimă este creată numai când URL-ul și anon key sunt configurate.
- `cloud-api/` verifică tokenuri Supabase, limitează cererile, apelează OpenAI server-side și permite ștergerea contului.

## Limitări ale auditului

Acesta este un audit static al fișierelor de pe branch, nu un test pe dispozitive reale. Nu certifică suportul efectiv pentru microfon, speech, background execution, SQLite sau notificări pe iOS/Android. Acestea cer build-uri native și teste hardware.


## Progres de implementare după audit — 2026-11-24

- Work și Think sunt acum ecrane distincte în navigația principală; pagina Work conține înregistrarea și formularul de alarme.
- `app.js` nu mai citește/scrie direct `localStorage`; folosește adapter asincron.
- `storage-adapter.js` oferă adapter Web Storage și adapter SQLite nativ prin `@capacitor-community/sqlite@8.1.1`. La prima pornire nativă, datele vechi rămân citibile din localStorage până când Core le validează și scrie snapshot-ul în SQLite; sursa legacy nu este ștearsă.
- Operațiile de scriere și confirmările AI sunt serializate înainte de persistare.
- `reminders.js` folosește Local Notifications 8.3.1; programarea Android este inexactă pentru a evita permisiunea specială de alarmă exactă.
- `build-mobile.js` produce un bundle allowlist și include plugin bridges native doar când pachetele sunt instalate.
- `.github/workflows/collector-mobile-build.yml` generează build Android debug și iOS Simulator; un build anterior cu Capacitor și Local Notifications a trecut pe ambele platforme.
- Build-ul cu SQLite pe branch-ul curent este în curs de verificare; auditul rămâne static și nu înlocuiește testarea pe telefoane fizice.
- Audio rămâne în IndexedDB și folosește MediaRecorder; migrarea în Filesystem nativ și înregistrarea în background sunt încă de făcut.


## Actualizare recorder / launch review — 2026-11-25

- Recorder nativ: AAC prin plugin Capacitor, fișierul final copiat în Filesystem privat, metadate în indexul SQLite. Checkpoint-ul sesiunii este persistat înainte de start și poate fi prezentat pentru recuperare la următoarea pornire.
- Recorder web: sesiunea și fiecare fragment MediaRecorder sunt salvate incremental în IndexedDB (recording_sessions + recording_chunks); recuperarea reconstituie Blob-ul în ordinea secvenței, îl salvează ca înregistrare obișnuită și apoi curăță checkpoint-ul.
- Recuperarea după terminarea forțată a procesului nativ rămâne best-effort: depinde de URI-ul expus de plugin sau de fișierul privat copiat înaintea întreruperii. Necesită testare pe hardware real.
- Android background recording nu are încă un foreground service explicit documentat/validat. UI avertizează că browserul/OS poate suspenda captura; nu promite înregistrare garantată în background.
- Build-ul Android a întâmpinat HTTP 429 de la Maven Central în run #670. Workflow-ul a fost harden-uit cu retries limitate pentru 429/5xx și max-workers=2; verdictul pe noul HEAD este obligatoriu.
- SQLite at-rest encryption este încă dezactivată; decizia și migrarea pentru criptare sunt restante. Import/export nativ și share sheet trebuie verificate separat de build.
