# Collector — strategie de testare v1

**Bază:** Collector MVP v11, cu hardening Core faza 2 în branch `feature/core-phase2-hardening`  
**CI Core faza 2:** 61/61 teste Node, 2/2 suite property-stock, 4/4 suite property-Core și 7/7 teste Playwright trecute, PR #7 și run #45032860362  
**Scop:** protejarea regulilor Core, a jurnalului de evenimente, a importului și a interfeței pe măsură ce aplicația evoluează.

## 1. Situația actuală

- Testele automate rulează cu Node.js Test Runner: `npm test` → `node --test test-*.js`.
- CI actual raportează 61 teste Node, două suite property-based pentru stoc, patru suite property-based pentru Core și șapte fluxuri E2E Chromium.
- Există teste pentru Core Port, orchestrator, parser, corecții, replay legacy, import și politica intervalelor de atribute.
- Unele fișiere de test folosesc verificări `assert` executate ca scripturi, nu cazuri `node:test` separate. Pentru raportare mai precisă, acestea pot fi convertite treptat în cazuri denumite.
- `test-ai-ui-wiring.js` verifică integrarea statică a scripturilor; nu pornește un browser real.
- Branch-ul de hardening păstrează dependențele fixate `@playwright/test` 1.65.1 și `fast-check` 4.11.0 și extinde comenzile cu `test:core-properties`, `test:coverage` și `benchmark:replay`. Node 22 este versiunea CI și versiunea documentată pentru testare.

## 2. Cele patru niveluri recomandate

### Nivel A — teste unitare și de contract (la fiecare Pull Request)

Păstrăm Node.js Test Runner și adăugăm cazuri denumite, deterministe.

**Core și jurnal**
- Același ID de eveniment trimis de două ori nu aplică efectul de două ori.
- Același `intentKey` trimis cu ID diferit nu dublează evenimentul.
- Eveniment fără ID, fără operații sau cu operație necunoscută este respins.
- O comandă cu mai multe operații, în care ultima e invalidă, nu lasă efectele primelor operații în stare.
- Ordinea din jurnalul append-only este ordinea autoritativă pentru Replay; timestamp-ul este metadată temporală și nu reordonează evenimentele. Timestamp-urile invalide sunt respinse la commit și raportate la Replay.
- Replay repetat produce aceeași proiecție semantică.

**Stoc, populații și relații**
- Adăugare, vânzare, pierdere, mutare și corecție; verifică simultan soldul sursă, destinație și dispoziție.
- Cantitate zero, negativă, text invalid, Infinity și locație inexistentă sunt respinse fără modificarea stării.
- Mutarea repetată sau retrimiterea aceleiași intenții nu dublează cantitatea.
- Corectarea unei mutări după o altă mutare sau după o vânzare nu schimbă incorect locația curentă.
- Închiderea și redeschiderea unei relații păstrează cronologia.
- Relațiile duplicate și ciclurile în ierarhia locațiilor sunt respinse.
- Asocierea unui individ identificat la o populație nu dublează soldul dacă acel membru există deja.

**Atribute și date financiare**
- Tip numeric, text, boolean, dată și JSON; valori lipsă și valori invalide.
- Interval recomandat: 5.2 și 7.0 sunt înregistrabile cu avertisment pentru 5.5–6.5; intervalul inversat este respins.
- Corectarea unei valori istorice, inclusiv când există măsurători ulterioare.
- Tranzacție financiară invalidă, entitate asociată inexistentă, monedă și ajustare.
- Costul și venitul rămân legate de evenimente; mutarea stocului nu modifică istoricul financiar.

**Import, migrare și persistență**
- Export → import → replay trebuie să păstreze aceeași stare semantică.
- Import cu jurnal incomplet, evenimente neconfirmate, replay cu erori sau proiecții modificate este respins.
- Import invalid nu înlocuiește datele locale existente.
- JSON trunchiat, structură necunoscută și versiuni vechi de schemă sunt tratate controlat.
- Eșecul localStorage / spațiu insuficient nu publică o stare nouă parțială.

### Nivel B — testare bazată pe proprietăți și secvențe (model-based / property-based)

Aceasta este metoda suplimentară cu cea mai mare valoare pentru Core-ul event-sourced.

Folosim `fast-check` în două suite. `property-stock-sequences.test.js` generează adăugări, vânzări și mutări între B1 și B2. `property-core-sequences.test.js` generează lanțuri de mutări, corecții cu vânzări ulterioare, cicluri de ierarhie și operații compuse atomice. Suitele verifică invarianta după fiecare comandă și păstrează seed/path pentru reproducere.

**Proprietăți obligatorii**
1. **Replay equivalence:** starea obținută prin aplicarea evenimentelor și starea reconstruită din jurnal sunt echivalente semantic.
2. **Non-negative stock:** soldul activ nu devine negativ pentru nicio combinație de adăugări, vânzări, mutări și corecții acceptate.
3. **Atomicity:** o operație compusă respinsă nu schimbă jurnalul sau proiecțiile.
4. **Idempotency:** repetarea aceleiași intenții nu schimbă cantitățile și nu adaugă un efect nou.
5. **Conservation on move:** mutarea transferă cantitatea între locații; totalul populației rămâne constant.
6. **Correction traceability:** fiecare corecție referă un eveniment existent și replay-ul păstrează rezultatul corectat.
7. **Import safety:** orice import acceptat reproduce proiecțiile; orice import respins lasă datele locale nemodificate.

Generatorul folosește ID-uri și timestamp-uri deterministe. `fast-check` raportează seed-ul și calea secvenței la eșec; acestea pot fi reluate cu `FC_SEED` și `FC_PATH`. CI rulează 250 secvențe la fiecare PR și 2.500 într-o rulare nocturnă. Rularea PR verificată: [#45017768617](https://github.com/davidlucian-ioan/Aplicatie/actions/runs/45017768617).

### Nivel C — teste reale în browser cu Playwright

Testele E2E folosesc Playwright într-un Chromium real, cu profil nou pentru fiecare caz și un server static Node local pe portul 4173. Nu folosesc browserul sau localStorage-ul personal. Șapte fluxuri E2E rulează la fiecare PR.

**Fluxuri E2E implementate și confirmate în CI**
- Creează locațiile B1 și B2, populația Fancy, mută 3 exemplare, vinde 2, apoi reîncarcă pagina și verifică soldurile și dispoziția `sold`.
- Configurează intervalul pH 5.5–6.5, salvează valoarea reală 5.2 cu avertisment, confirmă și verifică persistența după refresh.
- Anulează un preview și verifică faptul că jurnalul nu crește.
- Replay prin interfață și reconstruirea proiecțiilor fără avertismente.
- Export + import valid end-to-end și verificarea că datele adăugate după backup dispar după restaurare.
- Protecția UI față de markup HTML/script în nume și descrieri.
- Import invalid fără înlocuirea datelor existente.
- Eșec simulat al scrierii localStorage: operația nepersistată nu ajunge în starea activă și nu reapare după o salvare ulterioară și refresh.

**Fluxuri rămase pentru etape ulterioare**
- Acoperire offline extinsă: comportamentul aplicației când localStorage rămâne indisponibil, recuperarea după restaurarea spațiului și limitele operațiilor fără conexiune. Scenariul atomic de eșec unic al scrierii localStorage este adăugat în PR #9.

**Implementare**
- Folosește un context de browser nou pentru fiecare test; nu folosi profilul sau localStorage-ul browserului personal.
- Adaugă atribute stabile `data-testid` doar elementelor necesare testelor; preferă selectori după rol și etichetă pentru controalele accesibile.
- Pornește serverul local din CI pe un port dedicat.
- La eșec, păstrează screenshot, trace și eventual video ca artifact GitHub Actions.

**Cadru implementat în PR #8:** Chromium, Firefox și WebKit la fiecare Pull Request; Chromium rămâne și în rularea nocturnă. Prima matrice cross-browser a trecut 7/7 teste în fiecare browser (run #90).

### Nivel D — coverage, mutații și performanță

- **Coverage:** raportul Node instrumentează `engine.js`, modulele AI încărcate și suitele Node. Testul Playwright `app-ui-coverage.spec.cjs` folosește V8 precise coverage prin CDP în Chromium, navighează toate cele 10 vederi și produce `test-results/app-ui-coverage.json`. Indicatorul este byte coverage pe intervalele funcțiilor executate, nu branch coverage; este informativ, fără prag blocant. Firefox/WebKit continuă să ruleze suita E2E normală, iar testul CDP este sărit explicit acolo. Valorile relevante pentru codul de producție sunt `engine.js`: 96,85% line / 91,46% branch / 96,08% functions; `core-port.js`: 81,70% / 75,00% / 75,00%; `contracts.js`: 75,61% / 44,83% / 100%; `core-port-browser.js`: 86,27% / 54,55% / 91,67%. Agregatul `all files` include fișiere de test și nu este indicator de acoperire a producției. Nu există încă prag blocant.
- **Mutation testing:** StrykerJS 10.1.1 rulează nocturn pe `engine.js`, folosește `npm test`, produce rapoarte HTML/JSON și păstrează pragul de blocare la 0. Baseline inițial (run #45231376855): 60,10% mutation score, 1.309 mutanți omorâți, 873 supraviețuitori, 6 timeout-uri, 15m57s. Supraviețuitorii se concentrează în special în `stock.change`, `stock.adjust/reverse`, `attribute.set/define`, `relation.create` și corecțiile relațiilor, precum și `finance.record/adjust`. Acesta este un baseline pentru prioritizarea testelor, nu un prag de calitate și nici dovada că toți supraviețuitorii sunt defecte reale.
- **Performance:** benchmark-ul Replay folosește evenimente sintetice din șase operații (note, stock, finance, attribute.set, relation.attribute.set și entity.rename), la 100, 1.000, 10.000 și 50.000 evenimente; include o încălzire, mediană de execuții repetate, verificări de proiecții și un indicator orientativ de variație heap. Baseline PR #13 (runner Linux x64 / Node 22.23.5 / AMD EPYC 9V74): 100 = 0,398 ms; 1.000 = 4,137 ms; 10.000 = 18,892 ms; 50.000 = 111,344 ms. Heap delta median orientativ: 190.672 B / 322.456 B / 16.488 B / 24.677.704 B; valorile sunt zgomotoase și nu sunt GC-normalizate. Rularea PR finală din 22.11.2026 a măsurat 0,610 ms pentru 100 evenimente, 3,791 ms pentru 1.000 și 13,852 ms pentru 10.000 pe runner-ul GitHub Linux x64 / Node 22.23.5, CPU Xeon Platinum 8573C (run #45032860362). Aceste valori sunt un baseline pe runner, nu o garanție de performanță și nu au prag absolut.
- **Migrare:** păstrează fixtures JSON anonimizate pentru versiunile de schemă suportate. Fiecare versiune nouă trebuie să demonstreze upgrade fără pierderi și import sigur.

## 3. Structura CI recomandată

| Când | Ce rulează | Scop |
|---|---|---|
| Fiecare Pull Request | `npm test` + 250 secvențe stock + 150 secvențe Core + coverage informativ + benchmark Replay + Playwright Chromium/Firefox/WebKit | blochează regresiile înainte de merge și arhivează baseline-ul |
| Nocturn | 2.500 secvențe stock + 1.500 secvențe Core + Playwright Chromium + StrykerJS pe `engine.js` | caută secvențe rare și mutații nedetectate de teste |
| Înainte de release | coverage review + mutation testing pentru Core + test de backup/migrare | verifică rezistența și siguranța datelor |

Nicio etapă nu trebuie să folosească exportul operațional personal al utilizatorului. Testele folosesc exclusiv date sintetice și profile de browser izolate.

## 4. Ordinea de implementare

1. **Faza 1 închisă prin PR #6:** Playwright Chromium, patru fluxuri E2E și primele proprietăți stock/replay.
2. **Faza 2 integrată în `main` prin PR #7:** corecții după ordinea jurnalului, idempotency derivat din jurnal, validare strictă import/timestamp/schema, teste pentru relații și mutări, șapte fluxuri E2E, coverage informativ și benchmark Replay.
3. **PR #8:** Firefox/WebKit la fiecare PR și StrykerJS nocturn configurat. Baseline-ul de mutații se colectează după integrare și prima rulare nocturnă.
4. Rămân: baseline-ul inițial Stryker și analiza mutanților supraviețuitori, fixtures suplimentare pentru migrarea legacy key fără schemaVersion și validarea manuală separată din issue #4.

## 5. Ce nu trebuie confundat

- Testele unitare verifică reguli izolate.
- Testele property-based verifică multe secvențe și invarianta rezultată.
- Playwright verifică aplicația așa cum o folosește omul, în browser.
- Testarea manuală confirmă aspecte de utilizare și acceptanță pe care automatizarea nu le surprinde.
- Un rezultat verde în CI nu dovedește că toate scenariile posibile sunt corecte; dovedește doar că setul de teste executat a trecut.

## 6. Starea implementării

- **Faza 1 integrată în `main` prin PR #6.** Dependențe fixate `@playwright/test` 1.65.1 și `fast-check` 4.11.0.
- **Faza 2 integrată în `main` prin PR #7:** teste Core Node 61/61; property-stock 2/2; property-Core 4/4; Playwright Chromium 7/7. CI PR final verde: run #45032860362.
- **Coverage Node pe `engine.js`:** 96,85% line, 91,46% branch, 96,08% functions. Modulele AI au rezultate separate: `core-port.js` 81,70% line / 75,00% branch, `contracts.js` 75,61% / 44,83%, `core-port-browser.js` 86,27% / 54,55%. Raportul global „all files” include și fișierele de test, deci nu este un indicator de producție. `app.js` din browser nu este instrumentat de coverage-ul Node.
- **Replay benchmark:** 100 = 0,610 ms; 1.000 = 3,791 ms; 10.000 = 13,852 ms în runner Linux x64 / Node 22.23.5, CPU Xeon Platinum 8573C (run PR #45032860362). Nu există prag blocant.
- **Hardening Core:** Replay respectă ordinea din jurnal, nu sortează după timestamp; corecțiile de nume/atribute/relații folosesc ordinea de aplicare; ID/intentKey sunt deduplicate din jurnal; timestamp-urile commit/replay sunt validate; importul respinge viitoare schema versions, IDs/intentKeys duplicate, colecții malformate și drift de proiecții; migrarea v6 păstrează definițiile vechi de atribute.
- **În curs / restanțe:** StrykerJS rulează numai nocturn și baseline-ul/analiza mutanților sunt încă în așteptare. UI byte coverage în Chromium și benchmark-ul mixed-domain 100–50.000 sunt adăugate prin PR-ul următor. Testul offline și matricea Firefox/WebKit au trecut în PR #12.
- Validarea manuală din issue #4 rămâne separată și nu este considerată făcută doar pentru că E2E este verde.
