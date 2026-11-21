# Collector AI Foundation — Audit Faza 0

**Bază auditată:** Collector MVP v11 + AI Foundation scaffold Faza 1  
**Contract analizat:** `collector.command.v1`  
**Data:** 21 noiembrie 2026  
**Scop:** verificarea contractului propus față de `engine.js` și fluxul actual din `app.js`, fără conectarea unui provider AI real și fără activarea write path-ului.

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

În aplicația actuală, `app.js` deține starea `db` în memorie și o persistă în `localStorage`. Nu există încă un port public stabil de citire/scriere pentru AI.

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

1. `validateCommand` verifică doar existența câtorva câmpuri și tipul numelui operației. Nu validează schema `data`, ID-urile țintelor sau allowlist-ul operațiilor.
2. `requiresConfirmation` nu este impus de `decision-gate.js` sau `orchestrator.js`. Opțiunea `{ execute: true }` execută orice propunere validă structural. Confirmarea trebuie impusă de politica Core/aplicației, nu lăsată la discreția modelului.
3. `CoreAdapter.read` nu validează forma datelor returnate.
4. Nu există încă un `CorePort` care să expună controlat citirea stării, preview-ul și persistarea.
5. În `app.js`, funcția curentă `commit` atribuie `db = result.db` înainte să verifice succesul `localStorage.setItem`. La eșecul persistenței, starea din memorie poate rămâne diferită de starea persistentă. Portul nou trebuie să persiste cu succes înainte de publicarea noii stări în UI.
6. Comenzile AI trebuie limitate la operațiile Core permise. Faptul că motorul respinge operațiile necunoscute nu înlocuiește allowlist-ul de securitate.

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
- [ ] schema `collector.command.v1` este actualizată cu forma Core reală;
- [ ] allowlist-ul operațiilor AI și politica de confirmare sunt definite;
- [ ] Core Port read/preview/execute este proiectat și testat cu persistența aplicației;
- [ ] testele negative confirmă că un model nu poate ocoli confirmarea sau autorizarea.

**Concluzie:** nu conectăm încă providerul AI și nu activăm write path-ul. Următoarea lucrare este să actualizăm contractul și să implementăm un Core Port controlat, cu preview fără persistare și execute cu idempotency, validare și persistență atomică.
