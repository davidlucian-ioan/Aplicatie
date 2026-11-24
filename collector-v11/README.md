# Collector MVP v11

Aplicația executabilă Collector v11. Documentele canonice de produs și deciziile sunt în rădăcina repository-ului.

## Pornire Windows

Dublu-click pe `Porneste-Collector.bat`, apoi deschide `http://localhost:8000/index-server.html`. Lasă fereastra serverului deschisă.

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
