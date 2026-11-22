# Collector — stare proiect și punct de continuare

**Snapshot:** 0.7 consolidat (arhivă testată: Collector-MVP-v11-AI-Foundation-Attribute-Range-Fix-v0.7.zip)  
**Data snapshot:** 21 noiembrie 2026  
**Ultima actualizare de proiect:** 22 noiembrie 2026  
**Repository:** davidlucian-ioan/Aplicatie  
**Default branch:** main  
**Status GitHub:** Collector MVP v11 este integrat în `main` prin PR #3. Faza 1 de testare este integrată prin PR #6. Hardening Core faza 2 este integrat prin PR #7 (merge squash, 22 noiembrie 2026), commit `06aea556956a852c31ed47ff4aa09887ec238460`. GitHub Actions la PR #7 a confirmat 61/61 teste Node, 2/2 suite property-stock, 4/4 suite property-Core și 7/7 teste Playwright Chromium; rularea verde: https://github.com/davidlucian-ioan/Aplicatie/actions/runs/45032860362. Coverage-ul Node și benchmark-ul Replay sunt arhivate ca artifact al aceleiași rulări. Strategia actualizată este în `docs/testing/TEST-STRATEGY-v1.md`.  
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
- Issue #5 rămâne deschis numai pentru faza următoare: mutation testing, Firefox/WebKit, teste offline și migrare extinsă.
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

**Următorul pas implicit:** validează manual fluxurile UI rămase în issue #4. După aceea continuă faza 3 din issue #5: mutation testing, cross-browser, offline și migrare extinsă. Nu relua importul arhivei sau testele de bază deja verificate.
