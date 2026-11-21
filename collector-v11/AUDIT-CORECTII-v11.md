# Collector MVP v11 — corecții și verificări

Data: 21.11.2026
Bază: Collector-MVP-v11-D044-audit-fixed

## Modificări aplicate

1. Corecțiile de atribut și corecțiile generale adaugă operația `event.invalidate`, legată explicit de evenimentul corectat.
2. Motorul marchează evenimentul original cu `hiddenFromHistory` și `invalidatedByEventId`.
3. La o corecție repetată a aceleiași înregistrări, corecțiile anterioare ale acelei înregistrări sunt ascunse din istoricul operațional; ultima corecție rămâne vizibilă.
4. Listele operaționale din interfață folosesc evenimentele vizibile: jurnal, istoric, cronologia entității, evenimente recente și lista din audit.
5. Corecția rămâne în jurnalul tehnic append-only, astfel încât replay-ul să poată reconstrui proiecțiile. Valoarea greșită nu mai apare în istoricul operațional.
6. Butonul de corectare nu mai este afișat pe evenimentele care sunt ele însele înregistrări de corecție.
7. Textul dialogului de corectare a atributului nu mai promite păstrarea evenimentului greșit în istoricul vizibil.

## Teste executate

- `node --check app.js` — PASS
- `node --check engine.js` — PASS
- `node test-engine.js` — PASS
- `node test-correction.js` — PASS
- `node test-corrections.js` — PASS
- `node test-invisibility.js` — PASS

Testul nou verifică faptul că evenimentul original este marcat invizibil în istoricul operațional, legătura tehnică este păstrată, iar replay-ul reconstruiește valoarea corectată fără avertismente.

## Probleme rămase / limite

- Testele Node nu înlocuiesc verificarea manuală a interfeței în browser.
- Corectarea repetată a stocului nu este încă validată ca scenariu de înlocuire a corecției precedente; trebuie definit și testat separat, inclusiv cu vânzări/mutări ulterioare.
- Corectarea evenimentelor compuse care includ simultan mai multe tipuri de operații necesită teste dedicate pentru fiecare combinație.
- Auditul complet D-001–D-044 nu este declarat finalizat prin acest pachet. Acest pachet aplică și verifică schimbarea de vizibilitate a evenimentelor corectate.

## Fix calcul pentru corectări repetate de stoc

- La prima corecție, diferența se calculează față de cantitatea originală.
- La corectările următoare ale aceluiași eveniment, diferența se calculează față de ultima cantitate corectată, nu din nou față de original.
- Exemplu verificat: 10 → 8 aplică -2; 8 → 7 aplică -1; soldul final este 7.
- În lista de evenimente, o corecție existentă oferă acțiunea „Modifică din nou”, care reia corectarea evenimentului original.
- Testul automat verifică soldul curent și reconstruirea prin replay.

## Import sigur — validare înainte de înlocuire

1. Importul reconstruiește mai întâi proiecțiile din jurnalul candidat, fără să atingă baza locală curentă.
2. Importul este respins dacă există evenimente neconfirmate sau avertismente/erori la replay.
3. Importul este respins dacă proiecțiile salvate (entități, relații, stoc, financiar, atribute de eveniment) diferă de cele reconstruite din jurnal.
4. Confirmarea de înlocuire apare numai după validarea cu succes; baza locală este înlocuită doar după confirmare și salvare reușită.
5. La respingere sau anulare, baza locală curentă rămâne neschimbată.

### Implicații și limite

- Protejează împotriva importului unui jurnal corupt/incomplet și împotriva pierderii silențioase a proiecțiilor care nu pot fi reconstruite.
- Backup-urile vechi sau migrările cu jurnal incomplet pot fi respinse chiar dacă proiecțiile lor par utilizabile; este necesară o procedură separată de migrare, nu ocolirea validării.
- Validarea verifică consistența internă jurnal–proiecții, nu proveniența fișierului, autenticitatea datelor sau compatibilitatea semantică între versiuni.
- Importul înlocuiește în continuare baza locală după confirmare; utilizatorul trebuie să păstreze un export de siguranță.

Test nou: `node test-import-validation.js` — acceptă import valid și respinge replay cu erori, proiecții divergente și evenimente neconfirmate.


## D-044 — extindere pentru evenimente compuse (21.11.2026)

- Corectarea generică din interfață acceptă acum și operațiile `attribute.set` / `set_attribute`, generând `attribute.correct` legat de evenimentul inițial.
- Dacă același eveniment scrie de mai multe ori același atribut pentru aceeași entitate, interfața refuză corectarea automată: asocierea unei singure valori corectate cu mai multe scrieri din același eveniment ar fi ambiguă.
- Corecțiile compuse stock + financiar + atribut sunt testate împreună; testul include o vânzare ulterioară și verifică faptul că aceasta rămâne validă.
- Sunt verificate proiecțiile de stoc, financiar și atribut, precum și echivalența replay-ului fără avertismente.
- Reparată și o eroare de domeniu lexical în UI: cantitatea corectată anterior era declarată în interiorul blocului condițional, dar folosită ulterior la calculul diferenței. Acum este păstrată în scope-ul funcției.

### Limite păstrate intenționat
- Operațiile pentru care nu există încă o regulă de compensare sigură (de exemplu, ștergerea/invalidarea unei entități create și operații compuse cu scrieri repetate ambigue) sunt refuzate înainte de commit; nu se aplică o corecție parțială.
- Testele automate Node verifică motorul, replay-ul și prezența regulilor UI. Interacțiunea efectivă în browser trebuie verificată manual înainte de validarea completă a MVP-ului.
