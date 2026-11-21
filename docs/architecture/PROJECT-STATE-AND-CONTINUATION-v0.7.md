# Collector — stare proiect și punct de continuare

**Snapshot:** 0.7 consolidat (arhivă testată: Collector-MVP-v11-AI-Foundation-Attribute-Range-Fix-v0.7.zip)  
**Data snapshot:** 21 noiembrie 2026  
**Repository:** davidlucian-ioan/Aplicatie  
**Branch de integrare:** integration/collector-v0.7-consolidated  
**Status:** document de continuitate; codul v0.7 nu este încă integrat în branch-ul principal.

## 1. De ce există acest document

Acest document este punctul unic de reluare a proiectului. La începutul unei conversații noi, citește acest fișier și README-ul arhivei de release înainte de a propune modificări. Nu relua verificări sau instalări deja închise decât dacă există o regresie demonstrată.

## 2. Situația repository-ului constatată

La 21.11.2026, branch-ul main conține încă un MVP timpuriu, cu app.js de aproximativ 6,8 KB și numai paginile Dashboard, Entități, Evenimente, Atribute și Istoric. Repository-ul conține documentele conceptuale și AI Foundation, dar nu conține încă implementarea completă Collector MVP v11.

Arhiva locală v0.7 conține implementarea v11 completă (55 fișiere în ZIP, 315.995 bytes de fișiere extrase), cu engine.js, app.js, UI complet, AI Foundation/Core Port, documente și teste. Prin urmare, nu se va afirma că v0.7 este deja integrat în main.

**Decizie de lucru:** integrarea sursei v11 în repository trebuie făcută ca schimbare controlată, păstrând documentele și fișierul Biblia existente. Se creează branch și PR; nu se suprascrie direct main.

## 3. Release v0.7 — ce conține

Arhiva v0.7 include cumulativ:
- Core Port și integrarea lui cu UI/localStorage (din seria v0.3);
- replay tolerant pentru importuri legacy duplicate și evenimente istorice malformate (v0.4);
- parser local cu reguli pentru observații, inclusiv diacritice și formulări testate (v0.5);
- clarificarea indicatorului de populații/solduri: soldurile sunt cantități, nu numărul de înregistrări de sold (v0.6);
- politica intervalelor pentru atribute: limitele min/max sunt intervale recomandate și produc avertismente, nu blocaje ale înregistrării; valorile măsurate în afara intervalului rămân înregistrabile; valoarea inițială poate lipsi când atributul nu este obligatoriu; min > max este o configurare invalidă (v0.7).

## 4. Verificare executată local pe arhiva v0.7

Comandă: npm test  
Rezultat la 21.11.2026:
- 38 teste;
- 38 trecute;
- 0 eșuate;
- 0 anulate.

Suitele acoperă Core Port browser, preview fără persistare, persistență înainte de publicarea stării, confirmare la operații cu risc, contract/idempotency, parser comenzi, validări de import, corecții, replay legacy și politica intervalelor atributelor.

Acest rezultat este reproductibil pentru arhiva v0.7 verificată. Nu reprezintă încă un CI GitHub pe repository.

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

### P0 — integrare reală în GitHub
- Compară sursa v11 din arhiva v0.7 cu repository-ul main.
- Integrează sursa v11 în repository într-un PR, păstrând Biblia și documentele conceptuale.
- Actualizează README-ul root pentru a descrie versiunea executabilă reală și pașii de testare.
- Rulează npm test în GitHub Actions; nu declara CI verde până nu există un run real.
- Revizuiește diff-ul și verifică faptul că importul nu elimină fișierele/documentele utile din repository.

### P1 — validare funcțională cu utilizatorul
- Testează în browser, pe versiunea integrată, comanda de observație sugerată de UI.
- Testează o măsurătoare pH = 5.2 cu interval recomandat 5.5–6.5: avertisment prezent, salvarea permisă.
- Testează valoare inițială goală pentru atribut opțional.
- Testează min > max: configurarea este respinsă.
- Confirmă indicatorul de cantitate: 1 + 5 = 6, fără a confunda numărul de populații cu numărul de exemplare.

### P2 — AI Foundation
- Închide gap-urile din auditul Fazei 0: schemă de comandă aliniată la forma reală Core, allowlist, politică de confirmare și teste negative de autorizare.
- Nu conecta un provider AI real și nu activa write path AI până când aceste criterii nu sunt satisfăcute.

## 9. Reguli pentru următoarea sesiune

1. Începe prin a citi acest document și starea PR-ului/branch-ului.
2. Nu cere utilizatorului să reexplice proiectul sau să refacă pași verificați.
3. Nu crea o nouă versiune ZIP pentru o modificare mică dacă se poate integra în branch-ul curent.
4. Nu afirma că un bug este reparat doar pentru că există un test; separă testele automate de verificarea manuală în browser.
5. Nu modifica datele din exportul utilizatorului și nu solicita reimport decât dacă există o justificare tehnică și un backup confirmat.
6. Nu face commit direct în main; propune schimbările prin PR și verifică diff-ul.
7. Marchează explicit ce este implementat, ce este testat automat, ce este testat manual și ce este doar planificat.

## 10. Artifacte de referință

- Release testat: Collector-MVP-v11-AI-Foundation-Attribute-Range-Fix-v0.7.zip (arhivă păstrată separat în Library, folder /Collector).
- Audit faza 0: docs/architecture/AI-FOUNDATION-PHASE0-AUDIT.md.
- AI Foundation: docs/architecture/Collector-AI-Foundation-v0.1.md.
- Registrul de decizii: Decizio.md.

**Următorul pas implicit:** finalizarea integrării sursei v11 în repository și rularea CI; nu reluarea analizelor deja închise.
