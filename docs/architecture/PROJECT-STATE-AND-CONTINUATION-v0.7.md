# Collector — stare proiect și punct de continuare

**Snapshot:** 0.7 consolidat (arhivă testată: Collector-MVP-v11-AI-Foundation-Attribute-Range-Fix-v0.7.zip)  
**Data snapshot:** 21 noiembrie 2026  
**Ultima actualizare de proiect:** 23 noiembrie 2026  
**Repository:** davidlucian-ioan/Aplicatie  
**Default branch:** main  
**Status GitHub:** Collector MVP v11 este integrat în `main` prin PR #3. Faza 1 este integrată prin PR #6, hardening Core prin PR #7, iar extinderea migrare/UI/testelor Core prin PR #14 (merge squash 23 noiembrie 2026), commit `1c7aae2a5a906f779eb85af73496c1ba14cf17d2`, iar testele suplimentare de stoc din PR #16 au fost integrate în `main` prin commit `5487c764c9f3183878a3268f23f8423e36d1e76b`. CI PR #14 a trecut integral: teste Node/Core/property, Replay benchmark, Chromium/Firefox/WebKit și Stryker focalizat (run #45239707892). UI byte coverage Chromium este 78,39%. Baseline-ul Stryker full-suite este 65,81% (run #45237194442); rularea focalizată din PR #14 a fost 31,35% și nu este comparabilă direct, deoarece folosește doar `test-core-mutation-survivors.js` cu mutații pe întreg `engine.js`. Stryker full-suite este configurat să ruleze nocturn cu `npm test`. Strategia actualizată este în `docs/testing/TEST-STRATEGY-v1.md`.  
**Artefacte păstrate:** Library `/Collector/Collector-MVP-v11-CONTINUARE-v0.7.zip` și `/Collector/CONTINUARE-PROIECT.md`.

## 1. De ce există acest document

Acest document este punctul unic de reluare a proiectului. La începutul unei conversații noi, citește acest fișier și issue #4/#5 înainte de a propune modificări. Nu relua verificări sau instalări deja închise decât dacă există o regresie demonstrată.

## 2. Situația repository-ului constatată

Înainte de integrare, `main` conținea un MVP timpuriu. La 22.11.2026, implementarea completă Collector MVP v11 este integrată în `main/collector-v11/`. Folderul include `engine.js`, `app.js`, UI, `ai/`, teste, `package.json`, `index-server.html` și scriptul Windows de pornire. Documentele conceptuale canonice din rădăcină au fost păstrate. README-ul root indică acum folderul aplicației.

Arhiva v0.7 a fost încărcată în branch-ul de integrare, extrasă prin GitHub Actions și sursa extrasă a fost comisă în repository. PR #3 a fost verificat și integrat în `main`.

**Integrarea sursei v11:** completată prin PR #3. Biblia și documentele conceptuale canonice au fost păstrate. Modificările ulterioare se fac prin branch și PR; nu se suprascrie direct main.

## 3. Release v0.7 — ce conține

Arhiva v0.7 include cumulativ:
- Core Port și integrarea lui cu UI/localStorage (din seria v0.3);
- replay tolerant pentru importuri legacy duplicate și evenimente istorice malformate (v0.4);
- parser local cu reguli pentru observații, inclusiv diacritice și formulări testate (v0.5);
- clarificarea indicatorului de populații/solduri: soldurile sunt cantități, nu numărul de înregistrări de sold (v0.6);
- politica intervalelor pentru atribute: limitele min/max sunt intervale recomandate și produc avertismente, nu blocaje ale înregistrării; valorile măsurate în afara intervalului rămân înregistrabile; valoarea inițială poate lipsi când atributul nu este obligatoriu; min > max este o configurare invalidă (v0.7).

## 4. Verificare executată local pe arhiva v0.7

Comandă: `npm test`  
Rezultat la 21.11.2026:
- 38 teste;
- 38 trecute;
- 0 eșuate;
- 0 anulate.

Suitele acoperă Core Port browser, preview fără persistare, persistență înainte de publicarea stării, confirmare la operații cu risc, contract/idempotency, parser comenzi, validări de import, corecții, replay legacy și politica intervalelor atributelor.

Pe lângă testarea locală, GitHub Actions run #44956048507 a extras arhiva v0.7, a rulat `npm test` în `collector-v11/` și a confirmat: 38 teste, 38 trecute, 0 eșuate, 0 anulate. [Rularea CI](https://github.com/davidlucian-ioan/Aplicatie/actions/runs/44956048507).

Acestea sunt teste automate. Nu substituie validarea manuală a UI-ului în browser.

## 5. Date operaționale ale utilizatorului — nu se includ în Git

În testarea locală a aplicației:
- export JSON păstrat separat de utilizator;
- replay afișează 38 evenimente, 5 entități, 5 relații, 4 stocuri, 0 tranzacții financiare;
- replay verificat manual: warnings = [];
- valorile curente și cele reconstruite prin replay au coincis.

Populațiile din testul local:
- fancy: sold 1;
- fancy anon în B2: sold 5;
- total cantitate: 6.

Nu se introduce exportul JSON al utilizatorului în GitHub și nu se publică date operaționale private în repository.

## 6. Decizii de produs pentru atribute și măsurători

Separă explicit:
1. **Valoare măsurată:** faptul observat (ex. pH = 5.2).
2. **Interval recomandat:** intervalul dorit (ex. 5.5–6.5).
3. **Limite tehnice de validare:** numai constrângeri reale ale tipului/unității sau ale integrității datelor, nu preferințe biologice.

O valoare măsurată în afara intervalului recomandat trebuie salvată cu avertisment. Collector documentează realitatea; nu trebuie să blocheze o valoare reală doar pentru că este sub/peste intervalul recomandat.

## 7. Principii arhitecturale obligatorii

Respectă registrul Decizio.md, inclusiv D-001–D-044:
- aplicație universală, independentă de domeniu;
- AI propune; Core validează și persistă; UI prezintă;
- istoricul de evenimente este sursa adevărului; proiecțiile sunt reconstruibile;
- corecțiile se fac prin evenimente noi, fără rescrierea evenimentelor originale;
- operațiile compuse sunt atomice;
- idempotency, precondiții, invariante și impact analysis sunt responsabilități Core;
- granularitate progresivă; populații anonime pot exista fără indivizi identificați;
- contextul conversațional expiră după 30 de minute, fără a afecta datele operaționale;
- domeniile sunt module de cunoaștere/configurare, nu logică hardcodată.

## 8. Restanțe — ordinea recomandată

### P0 — integrare în GitHub: închisă prin PR #3
- Arhiva v0.7 a fost încărcată în branch-ul dedicat.
- Sursa executabilă v11 a fost extrasă în `collector-v11/`; documentele conceptuale canonice din rădăcină au fost păstrate.
- README root și workflow-ul GitHub Actions au fost actualizate.
- PR #3 a fost verificat și integrat în `main`.
- CI a confirmat 38/38 teste trecute, 0 eșuate.

### P1 — validare funcțională cu utilizatorul
- Testează în browser, pe versiunea integrată, comanda de observație sugerată de UI.
- Testează o măsurătoare pH = 5.2 cu interval recomandat 5.5–6.5: avertisment prezent, salvarea permisă.
- Testează valoare inițială goală pentru atribut opțional.
- Testează min > max: configurarea este respinsă.
- Confirmă indicatorul de cantitate: 1 + 5 = 6, fără a confunda numărul de populații cu numărul de exemplare.

### P2 — AI Foundation
- Închide gap-urile din auditul Fazei 0: schemă de comandă aliniată la forma reală Core, allowlist, politică de confirmare și teste negative de autorizare.
- Nu conecta un provider AI real și nu activa write path AI până când aceste criterii nu sunt satisfăcute.

## 9. Strategie și backlog de testare

- CI în `main`, verificat prin PR #7: 61/61 teste Node, 2/2 suite property-stock, 4/4 suite property-Core și 7/7 fluxuri Playwright Chromium.
- Rularea PR verde: https://github.com/davidlucian-ioan/Aplicatie/actions/runs/45032860362.
- `@playwright/test` 1.65.1 și `fast-check` 4.11.0 sunt dependențe instalate; lockfile-ul este comis și Node 22 este versiunea recomandată.
- CI rulează 250 secvențe stock + 150 secvențe Core la fiecare PR și 2.500 + 1.500 într-o rulare nocturnă.
- Coverage Node pentru `engine.js`: 96,85% line, 91,46% branch, 96,08% functions. Coverage-ul Node nu instrumentează `app.js` din browser; nu există încă prag blocant.
- Benchmark Replay sintetic în PR CI: 100 evenimente = 0,610 ms; 1.000 = 3,791 ms; 10.000 = 13,852 ms pe runner Linux x64 / Node 22.23.5. Sunt măsurători de referință, nu SLA.
- Issue #5 rămâne deschis pentru analiza mutanților supraviețuitori și revizuirea performanței/heap la volume mari; PR #14 a integrat fixture-ul legacy fără schemaVersion, UI coverage 78,39%, testele Core focalizate și testele extinse stock.change (PR #16).
- Issue #4 rămâne pentru validarea manuală a aplicației în browser; testele automate nu o înlocuiesc.

## 10. Reguli pentru următoarea sesiune

1. Începe prin a citi acest document și issue #4 (validarea manuală rămasă).
2. Nu cere utilizatorului să reexplice proiectul sau să refacă pași verificați.
3. Nu crea o nouă versiune ZIP pentru o modificare mică dacă se poate integra în branch/PR-ul curent.
4. Nu afirma că un bug este reparat doar pentru că există un test; separă testele automate de validarea manuală în browser.
5. Nu modifica datele din exportul utilizatorului și nu solicita reimport decât dacă există o justificare tehnică și un backup confirmat.
6. Integrarea v11 este deja în `main`; pentru modificări viitoare, lucrează prin branch/PR și verifică diff-ul înainte de merge.
7. Marchează explicit ce este implementat, ce este testat automat, ce este testat manual și ce este doar planificat.

## 11. Artifacte de referință

- Release testat: `Collector-MVP-v11-AI-Foundation-Attribute-Range-Fix-v0.7.zip`.
- Snapshot continuare arhivat în Library: `/Collector/Collector-MVP-v11-CONTINUARE-v0.7.zip`.
- Audit faza 0: `docs/architecture/AI-FOUNDATION-PHASE0-AUDIT.md`.
- AI Foundation: `docs/architecture/Collector-AI-Foundation-v0.1.md`.
- Registrul de decizii: `Decizio.md`.
- Issue P0 închis (integrare): https://github.com/davidlucian-ioan/Aplicatie/issues/2
- Issue curent P1 (validare manuală în browser): https://github.com/davidlucian-ioan/Aplicatie/issues/4
- Issue P1 (faza 3 testare: mutation, cross-browser, offline, migrare): https://github.com/davidlucian-ioan/Aplicatie/issues/5
- Strategie de testare: `docs/testing/TEST-STRATEGY-v1.md`.
- PR de integrare v11: https://github.com/davidlucian-ioan/Aplicatie/pull/3
- PR testare faza 1: https://github.com/davidlucian-ioan/Aplicatie/pull/6
- PR hardening Core faza 2: https://github.com/davidlucian-ioan/Aplicatie/pull/7
- Workflow CI: `.github/workflows/collector-quality.yml` — se execută la schimbări în aplicație, documentația root/testing, PR-uri și nocturn.

**Actualizare 2026-11-23:** PR #17 este integrat (`dcabf912c4c32abe53e69b3afdb8b14e5c0bf067`): corectarea unei mutări supersedate este idempotentă, fără să afecteze locația curentă sau soldul; testele `stock.reverse` acoperă inversarea vânzărilor și mutărilor, evenimente fără efecte de stoc și rollback după consum parțial. PR #18 este integrat (`e713ff35d54f6d54f541dd88ee3b6a29b3848ae2`): validatorul timestamp respinge offset-uri ISO 8601 în afara ±14:00 și acceptă limita validă. PR #19 este integrat (`37ee6fc07111869b234313618f5550f5af8072df`): testele acoperă corectarea mai multor relații dintr-un eveniment, relații deja închise, evenimente fără relații și rollback la inversarea unei mutări după vânzare parțială în destinație. PR #20 este integrat (`3d627eb7d119a16f71f6adbab5694b143f940bb2`): o corecție stale este marcată separat ca ignorată (`ignoredCorrectionByEventId`), nu ca relație anulată; o corecție ulterioară a mutării descendente poate redeschide relația precedentă corect, iar Replay reproduce starea. CI a trecut pentru PR #17–#20 (runs #45245225951, #45245432917, #45246231904 și #45246497191). Următorul pas este trierea supraviețuitorilor Stryker relevanți (`stock.reverse`, `relation.create.correct`, `commit`) și revizuirea performanței la 50.000 de evenimente. Nu compara scorul focalizat de 31,35% cu baseline-ul complet de 65,81%; raportul complet este pre-PR #15–#20. Validarea manuală din issue #4 rămâne separată și necesită confirmarea utilizatorului în browser; nu afirma că a fost făcută automat.

**Actualizare 2026-11-23 — PR #21 integrat:** `3c79d5bd8b43e1396919172c0b87e6a9d828a0bc`. Idempotency verificat explicit pentru duplicate după event ID și intentKey; operațiile duplicate nu sunt aplicate din nou și întorc evenimentul original. Commit-urile compuse sunt atomice la eșecul unei operații ulterioare. CI complet trecut (run #45247173561).

**PR #22 în lucru:** https://github.com/davidlucian-ioan/Aplicatie/pull/22. Se întărește validarea `stock.reverse` pentru toate categoriile de stoc, nu doar soldul activ. Testele țintesc situația în care o ajustare ulterioară epuizează categoria `sold` sau `disposed`, iar inversarea unui eveniment istoric ar crea un sold negativ. Primele două rulari CI au eșuat din cauza unor aserțiuni/fixture-uri incorecte; testele au fost revizuite și noua rulare este în desfășurare. Nu se integrează până la CI complet verde.


Actualizare 2026-11-23: PR #22 a fost integrat; vezi commitul și verificarea de mai jos. PR #23 și PR #24 tratează corecțiile relațiilor, iar PR #25 validează allowlist-ul acțiunilor de stoc. Toate folosesc date sintetice.


PR #22 integrat (`27c7d41bb69691dfa46f3adbf5783649b606f77e`): `stock.reverse` și `stock.adjust` verifică soldurile nenegative pentru toate dispozițiile (`active`, `sold`, `disposed`); CI complet trecut (run #45248325717). PR #23 integrat (`72dd222ec214e26ddb7ac09358adb7d6f41d2b21`): `relation.close.correct` nu poate reactiva o relație a cărei creare a fost anulată și nu poate crea două relații `located_in` active pentru aceeași entitate; CI complet trecut (run #45249096170). PR #24 integrat (`ce7b6da569e0383dd2006a82c26808c850f34e71`): `relation.move.correct` nu mai redeschide o relație precedentă al cărei eveniment de creare a fost anulat; CI complet trecut după sincronizarea branch-ului cu main (run #45249873030).


PR #24 în lucru: `relation.move.correct` nu mai poate redeschide o relație precedentă al cărei eveniment de creare a fost anulat. Branch-ul a fost sincronizat cu main pentru a elimina conflictul introdus de PR #23; CI pe merge commit este în așteptare. PR #25 integrat (`c5c8571f46b7c1ddee47cf190d108dd1bb38c81b`): `stock.change` acceptă doar `add`, `sell`, `dispose`, `move_out`; `move_in` rămâne efect ledger intern, iar acțiunile necunoscute sunt respinse atomic. CI complet trecut (run #45249483938).


Benchmark Replay după PR #22 (run #45248706376, Node 22.23.5, Linux x64, AMD EPYC 9V45): 100 evenimente = 0,316 ms (~316k/s); 1.000 = 2,535 ms (~394k/s); 10.000 = 15,866 ms (~630k/s); 50.000 = 82,946 ms (~603k/s), heap delta median 8.964.824 bytes. Mix sintetic cu șase tipuri de operații, mediană din repetări; heap delta este orientativ, nu GC-normalizat. Nu este SLA și trebuie comparat doar pe aceeași platformă/metodologie.


PR #25 în lucru: stock.change folosește allowlist pentru acțiunile publice (add, sell, dispose, move_out); move_in rămâne efect ledger intern generat de move_out. Acțiunile necunoscute sunt respinse în loc să fie tratate implicit ca add. Teste de regresie și CI în așteptare.


PR #26 integrat (`8703993a5f7de3997b7ea50aef96c71d4af741bf`): `stock.adjust` validează referințele `locationId` nenule și respinge locațiile inexistente sau entitățile care nu sunt de tip `location`; teste de rollback atomic. CI complet trecut (run #45250493556).


PR #27 în lucru: `finance.adjust` validează `entityId` nenul împotriva entităților existente, la fel ca `finance.record`; test de regresie pentru referință lipsă și CI în așteptare.


PR #28 în lucru: `event.attribute.set` trim-uiește numele și respinge valorile goale sau formate doar din spații; teste de rollback atomic și CI în așteptare.


PR #29 în lucru: `event.attribute.correct` respinge corectarea repetată a unei înregistrări deja voided și păstrează primul `voidedByEventId`; test de rollback atomic și CI în așteptare.
