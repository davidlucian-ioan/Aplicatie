# Collector — strategie de testare v1

**Bază:** codul integrat în `main/collector-v11/`, snapshot v0.7  
**Baseline CI verificat:** 38/38 teste trecute în GitHub Actions, run #44956048507  
**Scop:** protejarea regulilor Core, a jurnalului de evenimente, a importului și a interfeței pe măsură ce aplicația evoluează.

## 1. Situația actuală

- Testele automate rulează cu Node.js Test Runner: `npm test` → `node --test test-*.js`.
- Sunt 38 de teste raportate cu succes în CI.
- Există teste pentru Core Port, orchestrator, parser, corecții, replay legacy, import și politica intervalelor de atribute.
- Unele fișiere de test folosesc verificări `assert` executate ca scripturi, nu cazuri `node:test` separate. Pentru raportare mai precisă, acestea pot fi convertite treptat în cazuri denumite.
- `test-ai-ui-wiring.js` verifică integrarea statică a scripturilor; nu pornește un browser real.
- În `main` sunt incluse dependențele fixate `@playwright/test` 1.65.1 și `fast-check` 4.11.0; lockfile-ul npm este comis. Comenzile disponibile sunt `test:properties`, `test:e2e` și `test:all`.

## 2. Cele patru niveluri recomandate

### Nivel A — teste unitare și de contract (la fiecare Pull Request)

Păstrăm Node.js Test Runner și adăugăm cazuri denumite, deterministe.

**Core și jurnal**
- Același ID de eveniment trimis de două ori nu aplică efectul de două ori.
- Același `intentKey` trimis cu ID diferit nu dublează evenimentul.
- Eveniment fără ID, fără operații sau cu operație necunoscută este respins.
- O comandă cu mai multe operații, în care ultima e invalidă, nu lasă efectele primelor operații în stare.
- Ordinea evenimentelor și timestamp-urile egale nu produc o stare diferită între commit și replay.
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

Folosim `fast-check` pentru a genera secvențe reproductibile de operații valide și invalide. Testul din `property-stock-sequences.test.js` generează adăugări, vânzări și mutări între B1 și B2; după fiecare pas verifică soldurile, atomicitatea operațiilor respinse, echivalența Replay și siguranța `validateImport`. Un test separat verifică idempotency pentru aceeași intenție.

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

Testele E2E folosesc Playwright într-un Chromium real, cu profil nou pentru fiecare caz și un server static Node local pe portul 4173. Nu folosesc browserul sau localStorage-ul personal. Patru fluxuri E2E rulează la fiecare PR.

**Fluxuri E2E implementate și confirmate în CI**
- Creează locațiile B1 și B2, populația Fancy, mută 3 exemplare, vinde 2, apoi reîncarcă pagina și verifică soldurile și dispoziția `sold`.
- Configurează intervalul pH 5.5–6.5, salvează valoarea reală 5.2 cu avertisment, confirmă și verifică persistența după refresh.
- Anulează un preview și verifică faptul că jurnalul nu crește.
- Încearcă importul unui JSON cu proiecții incompatibile și verifică faptul că datele existente rămân intacte.

**Fluxuri rămase pentru etape ulterioare**
- Replay prin interfață și comparație completă cu jurnalul.
- Export + import valid end-to-end.
- Protecția UI față de HTML/script în nume și descrieri.
- Operații offline și recuperarea după eșecul localStorage.

**Implementare**
- Folosește un context de browser nou pentru fiecare test; nu folosi profilul sau localStorage-ul browserului personal.
- Adaugă atribute stabile `data-testid` doar elementelor necesare testelor; preferă selectori după rol și etichetă pentru controalele accesibile.
- Pornește serverul local din CI pe un port dedicat.
- La eșec, păstrează screenshot, trace și eventual video ca artifact GitHub Actions.

**Cadru implementat:** Chromium la fiecare Pull Request și rulare nocturnă. Firefox și WebKit rămân pentru etapa următoare.

### Nivel D — coverage, mutații și performanță

- **Coverage:** generează raport line/branch/function. Mai întâi măsoară baseline-ul actual; nu impune din prima un prag arbitrar. Apoi fixează praguri pentru Core, import și Core Port și ridică-le gradual.
- **Mutation testing:** StrykerJS modifică intenționat condiții precum verificarea soldului, idempotency și avertismentele de interval. Un test bun trebuie să detecteze aceste mutații. Rulează inițial nocturn, apoi pentru modulele critice.
- **Performance:** testează replay pentru 100, 1.000 și 10.000 evenimente, cu seturi deterministe. Înregistrează timpul și memoria înainte de a impune limite; urmărește regresiile în timp.
- **Migrare:** păstrează fixtures JSON anonimizate pentru versiunile de schemă suportate. Fiecare versiune nouă trebuie să demonstreze upgrade fără pierderi și import sigur.

## 3. Structura CI recomandată

| Când | Ce rulează | Scop |
|---|---|---|
| Fiecare Pull Request | `npm test` + 250 secvențe `fast-check` + Playwright Chromium | blochează regresiile înainte de merge |
| Nocturn | 2.500 secvențe `fast-check` + Playwright Chromium | caută secvențe și diferențe greu de prins rapid |
| Înainte de release | coverage review + mutation testing pentru Core + test de backup/migrare | verifică rezistența și siguranța datelor |

Nicio etapă nu trebuie să folosească exportul operațional personal al utilizatorului. Testele folosesc exclusiv date sintetice și profile de browser izolate.

## 4. Ordinea de implementare

1. **Închisă prin PR #6:** Playwright Chromium, patru fluxuri E2E, `fast-check` pentru secvențe stoc/replay, workflow CI, lockfile și instrucțiuni locale.
2. Extinde proprietățile pentru corecții, relații, atomicitate compusă și migrare.
3. Adaugă raport coverage și baseline fără prag blocant; stabilește praguri după măsurare.
4. Adaugă mutation testing, Firefox/WebKit și teste de performanță/migrare.

## 5. Ce nu trebuie confundat

- Testele unitare verifică reguli izolate.
- Testele property-based verifică multe secvențe și invarianta rezultată.
- Playwright verifică aplicația așa cum o folosește omul, în browser.
- Testarea manuală confirmă aspecte de utilizare și acceptanță pe care automatizarea nu le surprinde.
- Un rezultat verde în CI nu dovedește că toate scenariile posibile sunt corecte; dovedește doar că setul de teste executat a trecut.

## 6. Starea implementării

- **Baseline existent:** 38/38 teste automate, confirmate de CI înaintea acestei extinderi.
- **Integrat în `main` prin PR #6:** dependențele fixate `@playwright/test` 1.65.1 și `fast-check` 4.11.0; un fișier property-based pentru secvențe stock/replay; patru teste Playwright; server local de test; workflow GitHub Actions; lockfile, comenzi npm și instrucțiuni.
- **CI extins și verificat verde:** la PR rulează testele vechi, 250 secvențe generate și cele patru teste E2E Chromium; nocturn rulează 2.500 secvențe și E2E Chromium. Rularea de PR #45017768617 a trecut toate etapele.
- **Rezultate confirmate:** 38/38 teste existente, 2/2 teste property-based și 4/4 fluxuri Playwright trecute. Testul property-based principal execută 250 de secvențe la PR; noaptea sunt programate 2.500.
- **Nu sunt implementate încă:** coverage, mutation testing, Firefox/WebKit, testele extinse de migrare și performanță.
- Validarea manuală a interfeței rămâne separată în issue #4.

PR #6 este integrat în `main`: https://github.com/davidlucian-ioan/Aplicatie/pull/6. Commit de integrare: `9ad92b61d0ab1de9a3e1f93a30da626c97544ebe`.
