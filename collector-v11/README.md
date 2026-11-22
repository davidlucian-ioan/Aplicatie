# Collector MVP v11

Aplicația executabilă Collector v11. Documentele canonice de produs și deciziile sunt în rădăcina repository-ului.

## Pornire Windows

Dublu-click pe `Porneste-Collector.bat`, apoi deschide `http://localhost:8000/index-server.html`. Lasă fereastra serverului deschisă.

## Teste

Necesită Node.js 22 sau mai nou.

Instalează dependențele:
```bash
npm ci
npx playwright install chromium
```

Rulează separat fiecare nivel:
```bash
npm test
npm run test:properties
npm run test:e2e
```

Sau rulează tot setul:
```bash
npm run test:all
```

Testele Playwright folosesc un server local temporar pe portul 4173 și un profil de browser izolat. Nu citesc profilul personal și nu folosesc datele operaționale ale utilizatorului. Rapoartele și capturile de diagnostic sunt scrise în `test-results/` și `playwright-report/`.

În CI, dacă lockfile-ul lipsește pe branch-ul de implementare, workflow-ul îl generează și îl comite înainte de testare. După aceea instalarea se face reproductibil cu `npm ci`.

Limitele min/max ale atributelor sunt intervale recomandate: măsurătorile reale în afara intervalului se pot înregistra cu avertisment. AI Foundation folosește un provider mock; nu există încă provider AI real conectat.
