# Collector MVP v11

Aplicația executabilă Collector v11. Documentele canonice de produs și deciziile sunt în rădăcina repository-ului.

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

Limitele min/max ale atributelor sunt intervale recomandate: măsurătorile reale în afara intervalului se pot înregistra cu avertisment. Providerul cloud OpenAI este integrat prin serverul local; cheia API rămâne exclusiv pe server. Vezi [OPENAI-INTEGRATION.md](OPENAI-INTEGRATION.md).

## Aplicație mobilă comercială

Direcția de produs confirmată este distribuția prin Google Play și Apple App Store. Shell-ul Capacitor, bundle-ul mobile, StorageAdapter SQLite, Work/Think și reminders native sunt implementate în branch-ul de lucru. Backend-ul cloud, autentificarea, sincronizarea, billing-ul, audio nativ complet și build-urile semnate rămân de realizat. Vezi [MOBILE-APP-AND-COMMERCIAL-ROADMAP.md](MOBILE-APP-AND-COMMERCIAL-ROADMAP.md).
