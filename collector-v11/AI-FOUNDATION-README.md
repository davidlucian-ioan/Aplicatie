# Collector AI Foundation — Faza 1 (Mock)

Această implementare adaugă un strat AI izolat, fără provider extern și fără acces direct la baza de date.

## Structură

- `ai/contracts.js` — validarea contractelor și a comenzilor versionate.
- `ai/context-manager.js` — context conversațional cu expirare după 30 de minute.
- `ai/decision-gate.js` — separă răspunsul, propunerea, clarificarea și extensia de model.
- `ai/provider-mock.js` — provider determinist pentru teste; nu interpretează limbaj natural.
- `ai/core-adapter.js` — port controlat către Core; nu importă `engine.js` și nu primește DB.
- `ai/orchestrator.js` — coordonează pipeline-ul și raportează succes numai după confirmarea Core.
- `test-ai-foundation.js` — teste pentru separarea responsabilităților și fluxurile de bază.
- `Collector-AI-Foundation-v0.1.md` — specificația arhitecturală completă.

## Cerințe

Node.js 18 sau mai nou. Nu sunt necesare dependențe npm externe.

## Testare

```bash
npm test
```

## Utilizare în cod

```js
const {
  ContextManager,
  MockProvider,
  CoreAdapter,
  Orchestrator
} = require('./ai');

const provider = new MockProvider([
  { intent: 'clarify', question: 'La ce locație te referi?' }
]);

// corePort trebuie implementat de aplicația gazdă și expune numai operațiile permise.
const coreAdapter = new CoreAdapter(corePort);
const orchestrator = new Orchestrator({
  provider,
  contextManager: new ContextManager(),
  coreAdapter
});

const result = await orchestrator.handle({
  text: 'Mută populația acolo',
  userId: 'local-user'
});
```

## Limitări explicite

1. `MockProvider` nu este un model AI și nu interpretează text liber. Răspunsurile sunt injectate în teste.
2. `CoreAdapter` definește un port, dar nu este încă legat de `engine.js`. Contractul logic din specificație trebuie validat și implementat în Core înainte de activarea write path-ului real.
3. `execute` este dezactivat implicit: orchestratorul returnează o propunere dacă nu primește explicit `{ execute: true }` de la stratul de aplicație.
4. `preview` și `execute` trebuie să repete validările în Core. AI-ul nu este autoritatea pentru atomicitate, invariante, idempotency sau persistare.
5. Memoria permanentă, provider cloud/local, voce și autentificare nu sunt implementate în această fază.

Această fază este un schelet executabil și testat al pipeline-ului, nu o integrare AI completă.

## Integrare locală Core Port în UI — v0.3

- `ai/core-port-browser.js` este implementarea browser a limitei Core Port.
- `index.html`, `index-server.html` și `Deschide-prin-dublu-click.html` o încarcă înainte de `app.js`.
- Introducerea rapidă folosește parserul determinist existent, apoi `preview()` și o confirmare explicită înainte de `execute()`.
- Store-ul folosește `localStorage`; starea din UI este publicată numai după persistența reușită.
- Teste dedicate: `test-ai-browser-core-port.js` și `test-ai-ui-wiring.js`.
- Furnizorul AI/LLM nu este conectat. Nu prezenta parserul determinist drept AI conversațional.
