# Collector

Proiectul păstrează documentele conceptuale canonice în rădăcină: `Biblia`, `Decizio.md`, `Dictionar.md`, `Model-conceptual.md` și `Scenarii.md`.

## Aplicația executabilă

Sursa curentă Collector MVP v11 este în folderul **[`collector-v11/`](collector-v11/)**.

Pe Windows, deschide acel folder și fă dublu-click pe `Porneste-Collector.bat`. Browserul se deschide la `http://localhost:8000/index-server.html`. Lasă fereastra serverului deschisă cât timp folosești aplicația.

## Teste

Necesită Node.js 18 sau mai nou. Din `collector-v11/` rulează:

```bash
npm test
```

Strategia extinsă de testare (teste bazate pe secvențe, Playwright, coverage și verificări nocturne) este documentată în [TEST-STRATEGY-v1.md](docs/testing/TEST-STRATEGY-v1.md). Implementarea acestor niveluri este urmărită în [issue #5](https://github.com/davidlucian-ioan/Aplicatie/issues/5).

## Arhitectură și decizii

- [Registrul deciziilor D-001–D-044](Decizio.md)
- [AI Foundation](docs/architecture/Collector-AI-Foundation-v0.1.md)
- [Audit AI Foundation — Faza 0](docs/architecture/AI-FOUNDATION-PHASE0-AUDIT.md)
- [Stare proiect și punct de continuare](docs/architecture/PROJECT-STATE-AND-CONTINUATION-v0.7.md)

Notă: AI Foundation include în această etapă un provider mock; nu este conectat un furnizor AI real. Datele operaționale ale utilizatorului nu sunt incluse în repository.
