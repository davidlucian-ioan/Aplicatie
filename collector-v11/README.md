# Collector MVP v11

Aplicația executabilă Collector v11. Documentele canonice de produs și deciziile sunt în rădăcina repository-ului.

## Recovery audio și procesare AI

Checkpoint-urile de procesare audio sunt persistente și au reindexare de recovery pentru crash-uri. Work conectează acțiunea manuală „Transcrie + AI” cu interpretarea OpenAI, extragerea memoriei structurate, rezolvarea entităților, preview Core, confirmare explicită și recitire independentă a jurnalului. După commit verificat, draftul/transcriptul temporar este eliminat, iar audio-ul original este șters automat și verificat independent; utilizatorul poate activa „Păstrează audio-ul original” înainte de procesare. La ambiguitate, eșec AI, lipsă de confirmare, eșec de checkpoint sau eșec de persistență, originalul rămâne pentru recovery. Memoria durabilă se reconstruiește din entități, atribute, relații și evenimente Core; audio-ul nu este sursa permanentă de adevăr. O înregistrare fără checkpoint poate fi eliminată manual cu confirmare. Cheia idempotentă este stabilă pe ID-ul înregistrării, independent de textul transcrierii. Detalii: [Audio lifecycle recovery](./AUDIO-LIFECYCLE-RECOVERY-v0.2.md).

## Aplicație mobilă

Collector este în curs de portare ca aplicație instalabilă Android și iOS. Utilizatorul final nu are nevoie de PC sau de un server pornit acasă. Work și Think sunt ecranele principale; datele mobile folosesc SQLite nativ, iar alarmele folosesc notificări locale.

Build-urile de verificare sunt generate de [Collector mobile build](../.github/workflows/collector-mobile-build.yml). Acestea sunt APK debug și iOS Simulator, nu încă pachete semnate pentru magazine.

## Pornire locală — doar dezvoltare

Dublu-click pe `Porneste-Collector.bat`, apoi deschide `http://localhost:8000/index-server.html`. Acesta este doar serverul local de dezvoltare; nu este necesar pentru utilizarea aplicației mobile.

## Cerințe pentru testare

Necesită Node.js 22 sau mai nou. Din acest folder:

```bash
npm ci
npx playwright install chromium
```

## Comenzi de testare

```bash
npm test
npm run test:properties
npm run test:core-properties
npm run test:coverage
npm run benchmark:replay
npm run test:e2e
```

Sau rulează tot lanțul cu:

```bash
npm run test:all
```

- `test`: teste unitare și de regresie Core/AI Foundation.
- `test:properties`: generare de secvențe stoc și verificarea invariantelor Replay.
- `test:core-properties`: corecții, mutări, relații, cicluri și atomicitate, cu secvențe generate.
- `test:coverage`: raport Node.js coverage informativ; nu există încă prag blocant.
- `benchmark:replay`: măsoară Replay pentru 100, 1.000 și 10.000 de evenimente sintetice mixte; nu are prag absolut de eșec.
- `test:e2e`: teste Chromium reale pentru fluxurile utilizatorului.

Testele Playwright folosesc un server temporar pe portul 4173 și un profil de browser izolat. Nu citesc profilul personal și nu folosesc date operaționale reale. Rapoartele se scriu în `test-results/` și `playwright-report/`.

CI rulează toate nivelurile la fiecare Pull Request și păstrează raportul de coverage și benchmark-ul Replay ca artifact GitHub Actions.

Audio lifecycle checkpoints, verificarea commit-ului, recovery înainte de retranscriere și politica de retenție sunt documentate în [AUDIO-LIFECYCLE-RECOVERY-v0.2.md](AUDIO-LIFECYCLE-RECOVERY-v0.2.md). Fluxul manual Audio → transcriere → OpenAI → structured memory → Core preview → confirmare → recitire independentă este conectat. Procesarea automată în fundal, retry-ul automat și playback-ul TTS nu sunt activate.

Status implementare AI și gaps de lansare: [AI-PIPELINE-STATUS-v0.4.md](AI-PIPELINE-STATUS-v0.4.md).

Limitele min/max ale atributelor sunt intervale recomandate: măsurătorile reale în afara intervalului se pot înregistra cu avertisment. Providerul cloud OpenAI este integrat prin serverul local; cheia API rămâne exclusiv pe server. Vezi [OPENAI-INTEGRATION.md](OPENAI-INTEGRATION.md).

## Aplicație mobilă comercială

Direcția de produs confirmată este distribuția prin Google Play și Apple App Store. Shell-ul Capacitor, bundle-ul mobile, StorageAdapter SQLite, Work/Think, reminders native, Cloud API, autentificarea Supabase, RevenueCat și metering AI au implementări în branch. Configurarea proiectelor reale, aplicarea migrărilor Supabase, deploy-ul backend, testele RevenueCat sandbox, sincronizarea multi-device, privacy review și build-urile semnate rămân nevalidate/nefinalizate. Audio-ul nativ are recorder și stocare implementate, dar mai necesită testare pe dispozitive reale. Vezi [MOBILE-APP-AND-COMMERCIAL-ROADMAP.md](MOBILE-APP-AND-COMMERCIAL-ROADMAP.md) și [LAUNCH-READINESS-CHECKLIST.md](LAUNCH-READINESS-CHECKLIST.md). Drafturile interne pentru confidențialitate și termeni sunt în PRIVACY-POLICY-DRAFT-RO.md și TERMENI-UTILIZARE-DRAFT-RO.md; nu sunt gata de publicare.

## Funcții mobile implementate în branch

- Shell Capacitor 8 pentru Android/iOS.
- Work/Think, notificări native, recorder AAC nativ și SQLite pentru date/metadata audio.
- Sesiune Supabase anonimă prin Secure Storage; Cloud API separat cu autentificare și OpenAI server-side.
- Configurarea proiectului Supabase și deploy-ul backend-ului rămân necesare înainte ca AI cloud să fie disponibil în build-ul mobil.
- Vezi [planul comercial mobil](MOBILE-APP-AND-COMMERCIAL-ROADMAP.md) și [auditul compatibilității](MOBILE-COMPATIBILITY-AUDIT.md).
