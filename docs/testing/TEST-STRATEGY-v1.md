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
- `package.json` nu are încă dependențe sau comenzi pentru teste E2E, coverage ori teste generate.

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

Folosim `fast-check` pentru a genera secvențe reproductibile de operații valide și invalide, cu seed salvat la fiecare rulare. Nu verificăm doar rezultatul unui exemplu; verificăm invarianta după fiecare pas.

**Proprietăți obligatorii**
1. **Replay equivalence:** starea obținută prin aplicarea evenimentelor și starea reconstruită din jurnal sunt echivalente semantic.
2. **Non-negative stock:** soldul activ nu devine negativ pentru nicio combinație de adăugări, vânzări, mutări și corecții acceptate.
3. **Atomicity:** o operație compusă respinsă nu schimbă jurnalul sau proiecțiile.
4. **Idempotency:** repetarea aceleiași intenții nu schimbă cantitățile și nu adaugă un efect nou.
5. **Conservation on move:** mutarea transferă cantitatea între locații; totalul populației rămâne constant.
6. **Correction traceability:** fiecare corecție referă un eveniment existent și replay-ul păstrează rezultatul corectat.
7. **Import safety:** orice import acceptat reproduce proiecțiile; orice import respins lasă datele locale nemodificate.

Generatorul trebuie să creeze ID-uri și timestamp-uri deterministe și să păstreze secvența care a eșuat. La eșec, CI salvează seed-ul și secvența de evenimente ca artifact, pentru reproducere locală.

**Cadru inițial:** 200 secvențe scurte la fiecare Pull Request; 2.000–5.000 secvențe într-o rulare nocturnă. Numărul poate fi ajustat după măsurarea duratei CI.

### Nivel C — teste reale în browser cu Playwright

Testarea existentă a UI-ului este în principal statică. Playwright ar simula un utilizator într-un Chromium real și ar verifica efectele vizibile și datele persistate.

**Fluxuri E2E prioritare**
- Aplicație nouă: creează entitate, locație și populație; adaugă 5 exemplare; vinde 2; verifică soldul 3.
- Mutare: transferă cantitatea între două locații; verifică sursa, destinația și istoricul.
- Atribut: configurează pH 5.5–6.5; salvează 5.2 cu avertisment; reîncarcă pagina și verifică valoarea.
- Confirmare: previzualizarea sau anularea nu persistă; numai confirmarea produce eveniment.
- Persistență: refresh-ul paginii nu pierde datele.
- Replay: proiecțiile reconstruite corespund jurnalului și nu apar avertismente.
- Backup: exportă JSON, golește contextul de test, importă fișierul și compară starea; un fișier invalid nu înlocuiește datele.
- Securitate UI: nume și descrieri cu HTML/script sunt afișate ca text, fără execuție.
- Offline: operațiile locale de bază continuă fără conexiune la internet.

**Implementare**
- Folosește un context de browser nou pentru fiecare test; nu folosi profilul sau localStorage-ul browserului personal.
- Adaugă atribute stabile `data-testid` doar elementelor necesare testelor; preferă selectori după rol și etichetă pentru controalele accesibile.
- Pornește serverul local din CI pe un port dedicat.
- La eșec, păstrează screenshot, trace și eventual video ca artifact GitHub Actions.

**Cadru inițial:** Chromium la fiecare Pull Request. Firefox și WebKit pot fi adăugate ulterior în rularea nocturnă.

### Nivel D — coverage, mutații și performanță

- **Coverage:** generează raport line/branch/function. Mai întâi măsoară baseline-ul actual; nu impune din prima un prag arbitrar. Apoi fixează praguri pentru Core, import și Core Port și ridică-le gradual.
- **Mutation testing:** StrykerJS modifică intenționat condiții precum verificarea soldului, idempotency și avertismentele de interval. Un test bun trebuie să detecteze aceste mutații. Rulează inițial nocturn, apoi pentru modulele critice.
- **Performance:** testează replay pentru 100, 1.000 și 10.000 evenimente, cu seturi deterministe. Înregistrează timpul și memoria înainte de a impune limite; urmărește regresiile în timp.
- **Migrare:** păstrează fixtures JSON anonimizate pentru versiunile de schemă suportate. Fiecare versiune nouă trebuie să demonstreze upgrade fără pierderi și import sigur.

## 3. Structura CI recomandată

| Când | Ce rulează | Scop |
|---|---|---|
| Fiecare Pull Request | teste unitare/contract + property tests scurte + Playwright Chromium | blochează regresiile înainte de merge |
| Nocturn | property tests extinse + Firefox/WebKit + replay/performance | caută secvențe și diferențe greu de prins rapid |
| Înainte de release | coverage review + mutation testing pentru Core + test de backup/migrare | verifică rezistența și siguranța datelor |

Nicio etapă nu trebuie să folosească exportul operațional personal al utilizatorului. Testele folosesc exclusiv date sintetice și profile de browser izolate.

## 4. Ordinea de implementare

1. Păstrează baseline-ul actual de 38/38 și adaugă cazurile unitare de margine cu nume explicite.
2. Introdu Playwright și 5–8 fluxuri E2E prioritare.
3. Introdu `fast-check` și proprietățile de replay, atomicitate, idempotency și conservare a stocului.
4. Adaugă raport coverage și baseline fără prag blocant; stabilește praguri după măsurare.
5. Adaugă nocturn mutation testing și testele de performanță/migrare.

## 5. Ce nu trebuie confundat

- Testele unitare verifică reguli izolate.
- Testele property-based verifică multe secvențe și invarianta rezultată.
- Playwright verifică aplicația așa cum o folosește omul, în browser.
- Testarea manuală confirmă aspecte de utilizare și acceptanță pe care automatizarea nu le surprinde.
- Un rezultat verde în CI nu dovedește că toate scenariile posibile sunt corecte; dovedește doar că setul de teste executat a trecut.

## 6. Starea implementării

Aceasta este strategia propusă, nu o declarație că toate instrumentele au fost deja instalate. Baseline-ul verificat rămâne 38/38. Lucrul de implementare este urmărit separat în issue-ul dedicat testării.
