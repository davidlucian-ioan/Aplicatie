# Collector AI Foundation — Audit Faza 0

**Bază auditată:** Collector MVP v11 + AI Foundation scaffold Faza 1  
**Contract analizat:** `collector.command.v1`  
**Data:** 24 noiembrie 2026  
**Scop:** verificarea contractului față de `engine.js`, hardening Core Port și delimitarea condițiilor pentru conectarea unui provider AI real.

## 1. Rezumat executiv

Scheletul AI este separat de motor și testele existente trec. Totuși, contractul `collector.command.v1` nu poate fi conectat direct la `engine.js` în forma actuală. Este necesar un Core Port explicit care să adapteze comanda AI la envelope-ul de eveniment și la structura operațiilor acceptate de motor.

**Verdict Faza 0: validare parțială.** Principiile arhitecturale sunt compatibile cu Core, dar contractul de transport și maparea comenzilor trebuie completate înainte de write path.

## 2. Ce există efectiv în Core

`engine.js` expune funcții pure/de domeniu, nu un API pentru AI:

- `emptyState()` și `normDb(raw)`;
- `commit(db, event)`;
- `replay(events, attributeDefs)`;
- `validateImport(raw)`;
- `balances(db)`, `totalFinance(db)`;
- `locationPath(db, locationId)`, `activeLocation(db, entityId)`;
- `identify(db, type, criteria)`;
- `contextIsActive(db)`, `correctionDelta(...)`.

`commit` primește **starea curentă și un eveniment complet**, aplică toate operațiile pe o copie și returnează noua stare. Nu persistă singur datele.

În aplicația actuală, `app.js` deține starea `db` și o persistă în `localStorage`. `ensureAICorePort()` expune către fluxul local de preview/confirmare numai `getState`, `persistState` și `publishState`; `ai/core-port-browser.js` este încărcat separat, iar scrierea publică starea numai după persistența reușită.

## 3. Maparea obligatorie a comenzii AI

| Câmp AI | Câmp Core | Regulă |
|---|---|---|
| `command.idempotencyKey` | `event.intentKey` | Mapare obligatorie pentru deduplicare end-to-end |
| `command.operations` | `event.operations` | Operațiile trebuie să folosească structura reală Core |
| `command.source` | `event.source` | Proveniența mesajului; nu reprezintă identitatea actorului |
| `command.certainty` | `event.certainty` și/sau datele operației | Păstrează incertitudinea utilizatorului |
| `command.turnId` | `event.payload.turnId` | Metadată de trasabilitate |
| ID generat de adapter | `event.id` | Core cere un ID de eveniment |
| tip de eveniment stabilit de adapter | `event.type` | UI-ul și istoricul folosesc tipuri de evenimente |
| identitate autorizată de aplicație | `event.actor` | Nu se preia orbește din outputul modelului |
| timestamp controlat de Core | `event.timestamp` | Core stabilește momentul înregistrării |

### Forma operației

Core așteaptă:

```json
{
  "operation": "stock.change",
  "data": {
    "populationId": "population-id",
    "locationId": "location-id",
    "action": "add",
    "quantity": 5,
    "disposition": "active"
  }
}
```

Câmpurile specifice unei operații se află în `operation.data`. Exemplul ilustrativ din AI Foundation v0.1 pune `quantity` la rădăcina operației; această formă nu este acceptată de `engine.js` și trebuie corectată în documentația contractului.

### Rezolvarea țintelor

`targets` cu criterii descriptive nu sunt suficiente pentru execuție. Înainte de a construi operațiile, stratul de citire trebuie să rezolve candidatele la ID-uri Core stabile. Dacă rămân mai multe candidate, Decision Gate cere clarificare. Nu se trimit criterii ambigue direct în `engine.commit`.

## 4. Preview, execute și idempotency

- **Preview:** Core nu are încă o funcție `preview`. Se poate simula fără persistență apelând `engine.commit` pe un snapshot și folosind starea returnată numai pentru calculul impactului. Testul nou confirmă că starea inițială nu este modificată.
- **Execute:** adapterul construiește evenimentul Core, apelează `engine.commit`, apoi persistă noua stare prin portul aplicației. Starea din UI nu trebuie înlocuită înainte ca persistența să reușească.
- **Idempotency:** `engine.commit` deduplică prin `event.id` și `event.intentKey`/`meta.processedIntentKeys`. Prin urmare, `idempotencyKey` trebuie mapat la `intentKey`; simpla prezență a câmpului în comanda AI nu produce deduplicare.
- **Rezultate:** excepțiile Core trebuie convertite în `rejected`; duplicatul în `duplicate`; o simulare reușită în `preview_ok`. Nu se declară succes înainte de persistența reușită.

## 5. Limite de contract care trebuie rezolvate înainte de write path

1. Rezolvat în cod: `validateCommand` verifică forma obiectelor, `operation.data`, lungimea și numărul operațiilor, `idempotencyKey`, `turnId`, `payload`, `certainty` și `requiresConfirmation`. Validarea structurală este completată de allowlist-ul Core Port și de validarea de domeniu din Core.
2. Rezolvat în orchestrator: propunerea nu poate executa direct. Se păstrează comanda exactă în context și `confirm()` execută numai comanda aferentă aceluiași `turnId`, cu `confirmed: true`. `idempotencyKey` este înlocuit cu un identificator venit din gateway-ul de încredere, nu din output-ul modelului.
3. Rezolvat: `CoreAdapter.read` verifică cererea și clonează rezultatul; read requests sunt limitate la `entities`, `balances`, `finance`, `events`, iar istoricul are limită 1–100.
4. Core Port există în variante Node și browser. Ambele au allowlist/risk policy aliniate, preview fără persistare, execute cu idempotency, persistență înainte de publicare și serializare a scrierilor concurente.
5. Corecție de audit: implementarea curentă `app.js` persistă candidatul prin `persistRaw(result.db)` înainte de `db = result.db`; vechea observație că UI-ul era actualizat înaintea persistenței nu mai descrie codul curent. Core Port respectă aceeași ordine.
6. Allowlist explicit: `entity.create`, `entity.rename`, `attribute.set`, `attribute.define`, `relation.create`, `relation.close`, `relation.move`, `stock.change`, `stock.adjust`, `finance.record`, `event.note`, `event.attribute.set`, `relation.attribute.set`. Operațiile cu impact ridicat cer confirmare; operațiile în afara allowlist-ului sunt respinse înainte de Core.
7. Răspunsurile despre datele operaționale nu mai pot folosi textul generat înainte de citire: dacă există `readRequest`, Orchestrator citește întâi Core și solicită `provider.respond` cu rezultatul. Fără această metodă, întoarce datele Core fără a prezenta răspunsul inițial ca fapt.

## 6. Operații recunoscute de `engine.js`

`entity.create`, `entity.rename`, `entity.rename.correct`, `attribute.set`, `attribute.correct`, `attribute.define`, `relation.create`, `relation.close`, `relation.create.correct`, `relation.move.correct`, `relation.close.correct`, `relation.attribute.set`, `relation.attribute.correct`, `event.attribute.set`, `event.attribute.correct`, `stock.reverse`, `relation.move`, `stock.change`, `stock.adjust`, `finance.adjust`, `finance.record`, `event.invalidate`, `event.note` și aliasurile `create`, `set_attribute`.

Aceasta este inventarierea implementării actuale, nu recomandarea de a expune toate operațiile AI-ului. Allowlist-ul AI trebuie stabilit separat, cu operațiile de corecție și invalidare tratate ca acțiuni cu risc ridicat.

## 7. Teste

A fost adăugat `test-ai-core-contract.js`, care verifică:

1. forma reală `{ operation, target, data }` și aplicarea unei operații compuse;
2. maparea `idempotencyKey` → `event.intentKey` și deduplicarea;
3. atomicitatea: o operație invalidă anulează întreaga comandă compusă fără să modifice starea inițială;
4. respingerea formei greșite în care `quantity` este plasat în afara `data`.

Rezultat în arhiva auditată după adăugarea testelor:

- 18 teste totale;
- 18 trecute;
- 0 eșuate.

## 8. Criterii de ieșire din Faza 0

Faza 0 poate fi închisă numai după ce:

- [x] exporturile Core au fost inventariate;
- [x] separarea AI/Core/UI a fost verificată în scaffold;
- [x] forma reală a operațiilor și envelope-ul evenimentului au fost identificate;
- [x] maparea idempotency a fost testată;
- [x] atomicitatea operațiilor compuse a fost testată;
- [x] schema `collector.command.v1` este actualizată cu forma Core reală;
- [x] allowlist-ul operațiilor AI și politica de confirmare sunt definite;
- [x] Core Port read/preview/execute este implementat și are teste pentru persistență, concurență și parity Node/browser;
- [x] testele negative verifică propunerea fără execuție, confirmarea explicită, expirarea/anularea propunerii, read scope și respingerea operațiilor nepermise.

**Concluzie actualizată:** principalele blocaje de contract și Core Port au fost rezolvate în branch-ul `feature/ai-foundation-core-contract`, iar testele de regresie au fost adăugate. Faza 0 rămâne în așteptarea CI pentru branch-ul curent. Nu există încă provider real și nu este activată interpretarea AI în UI. Următoarea fază este provider adapter + gateway server-side, după alegerea providerului și stabilirea politicii de date.


## 9. Implementare hardening 2026-11-24 — branch `feature/ai-foundation-core-contract`

- Contractele de input, interpretare, read request, comandă și rezultat Core au validare strictă și limite explicite.
- Orchestratorul nu mai execută printr-un flag generic `execute`. Păstrează propunerea și confirmă numai comanda exactă pentru `turnId)-ul afișat.
- ID-ul de idempotency este generat din `requestId` furnizat de gateway-ul de încredere; modelul nu îl poate alege sau reutiliza arbitrar.
- Întrebările despre starea Collector sunt grounding-first: Core read precede orice sumarizare. Textul modelului generat înainte de retrieval nu este prezentat drept fapt.
- Core Port Node și Browser serializează scrierile, returnează `rejected` pentru erorile Core, `unavailable` pentru eșec de persistare, și `committed` cu warning dacă UI publication eșuează după persistarea durabilă.
- Browser și Node au allowlist și high-risk policy verificate prin test de parity.
- Teste noi: validarea contractului, confirmarea exactă, anulare/expirare, grounding după retrieval, erori Core, concurență, eșec de persistare și parity browser/Node.
- Rezultatele CI pentru noul branch sunt încă pending; testele nu sunt declarate PASS până la confirmarea GitHub Actions.
