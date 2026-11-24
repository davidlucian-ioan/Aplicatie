# Collector — audit de compatibilitate mobilă M0

Data: 2026-11-24
Branch inspectat: `feature/openai-provider-integration`
Scop: inventarierea dependențelor de browser înainte de integrarea Capacitor.

## Constatări verificate în cod

| Zonă | Stare actuală | Consecință pentru aplicația mobilă |
|---|---|---|
| UI | HTML/CSS/JS fără framework; `index.html` și `index-server.html` au aceeași navigație clasică | Capacitor poate reutiliza interfața, dar UX-ul trebuie refăcut pentru Work/Think și touch |
| Work / Think | Nu există `data-page="work"` sau `data-page="think"` în niciunul dintre cele două fișiere HTML inspectate | Cerința de produs nu este încă reflectată în codul actual; trebuie implementată, nu doar presupusă |
| Baza de date | `app.js` citește/scrie direct `localStorage` prin `loadDb()` și `persistRaw()` | Este necesar un StorageAdapter și un startup asincron/cached pentru SQLite |
| Core | `engine.js` este JavaScript independent de UI și lucrează pe starea transmisă | Poate rămâne comun între web, Android și iOS; păstrăm testele curente |
| Core Port | `app.js` creează BrowserCorePort cu un store bazat pe starea din memorie și `persistRaw` | Trebuie păstrată interfața de store, dar implementarea persistării devine adapter |
| Audio metadata/data | `audio-store.js` folosește IndexedDB și salvează bytes ca ArrayBuffer | Pe mobil recomandăm fișiere în storage privat nativ + metadate SQLite; migrare/export sigur |
| Microfon | `navigator.mediaDevices.getUserMedia` și `MediaRecorder` | Necesită permisiuni native, testare pe dispozitive și tratarea întreruperilor/background |
| Dictare | `SpeechRecognition` / `webkitSpeechRecognition` | API neuniform între WebView-uri; nu poate fi considerat suport garantat. Planificăm bridge/plugin nativ sau provider cloud opțional |
| Ecran activ | `navigator.wakeLock` și `visibilitychange` | Wake Lock este best-effort; înregistrarea trebuie proiectată pentru lock/background și restricțiile OS |
| Import/export | File input, Blob, URL.createObjectURL și download link | Necesită fluxuri native pentru Files/Share Sheet și permisiuni/URI |
| AI | Browser provider comunică cu endpoint relativ same-origin | În mobil va apela un API HTTPS public; cheia OpenAI rămâne numai în backend |
| Notificări | Nu a fost identificată implementare de notificări locale în HTML/JS inspectat | Alarmele native sunt încă de construit cu Local Notifications și permisiuni |
| Backend | `server.js` ascultă implicit pe 127.0.0.1, citește .env local, fără autentificare multi-user | Exclusiv dezvoltare locală; nu se expune și nu se folosește drept backend comercial |

## Contracte recomandate înainte de integrarea SQLite

1. `StorageAdapter.load()` întoarce snapshot-ul verificat al bazei.
2. `StorageAdapter.save(snapshot, metadata)` persistă atomic și confirmă succesul.
3. `StorageAdapter.export()` furnizează formatul canonic pentru backup.
4. `StorageAdapter.import(candidate)` validează prin Core/replay înainte de înlocuire.
5. Adapterul oferă serializare a scrierilor și tratarea explicită a erorilor/quota.
6. UI/Core nu cunosc detalii despre localStorage, IndexedDB sau SQLite.
7. Adapterul web existent rămâne temporar pentru testare/regresie; adapterul mobil SQLite este implementarea de producție pe dispozitiv.

## Ordinea sigură de implementare

1. Scrie teste de contract pentru StorageAdapter și teste de regresie pentru load/migrare/import/export.
2. Extrage persistența din `app.js` fără schimbarea formatului schema v7.
3. Rulează întregul set de teste Core/AI/E2E și compară exporturile/replay înainte și după.
4. Adaugă Capacitor 8 și shell-urile native fără a schimba Core.
5. Adaugă SQLite și migrare verificată din localStorage/IndexedDB unde există date.
6. Înlocuiește MediaRecorder/SpeechRecognition doar după testele reale pe Android și iOS.
7. Adaugă notificări native și fluxul de background.
8. Separat, construiește backend cloud multi-tenant și sincronizarea.

## Limitări ale auditului

Acesta este un audit static al fișierelor de pe branch, nu un test pe dispozitive reale. Nu certifică suportul efectiv pentru microfon, speech, background execution, SQLite sau notificări pe iOS/Android. Acestea cer build-uri native și teste hardware.
