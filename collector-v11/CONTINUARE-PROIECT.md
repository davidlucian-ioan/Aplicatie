# Collector — punct unic de continuare

Ultima actualizare: 2026-11-21
Versiune de lucru: v0.7 — Attribute Range Policy Fix

## Scopul acestui fișier
Acesta este punctul unic de reluare pentru sesiunile viitoare. Citește-l înainte de orice modificare. Nu relua audituri sau pași deja finalizați fără un motiv concret și fără să verifici starea actuală.

## Starea proiectului
- Proiect: Collector MVP v11.
- Documentația arhitecturală AI Foundation v0.1 este inclusă în `docs/architecture/Collector-AI-Foundation-v0.1.md` și în copia rădăcină.
- Auditul Phase 0 este inclus în `docs/architecture/AI-FOUNDATION-PHASE0-AUDIT.md` și în copia rădăcină.
- Core Port UI integration v0.3 este inclusă.
- Replay fix v0.4 este inclus.
- Command parser fix v0.5 este inclus.
- Population/balance fix v0.6 este inclus.
- Attribute range policy fix v0.7 este inclus.
- Deciziile D-001–D-044 din `Decizio.md` trebuie păstrate ca autoritate. Nu rescrie și nu modifica deciziile fără o solicitare explicită și o analiză de impact.

## Comportamentul v0.7 pentru atribute numerice
- Minimul și maximul sunt limite recomandate, nu blocaje pentru măsurători reale.
- O valoare în afara intervalului produce avertisment și utilizatorul poate confirma înregistrarea.
- Atributele opționale pot fi definite fără valoare inițială.
- Atributele marcate obligatorii rămân obligatorii.
- Configurația cu minim mai mare decât maxim este invalidă și trebuie respinsă.
- UI folosește formularea „Limite recomandate”.
- Politica este aplicată pe fluxurile de atribute pentru entități, relații, evenimente, corecții și comenzi rapide.

## Verificare executată
În folderul proiectului, `npm test` a fost executat la 2026-11-21.
Rezultat: 38 teste, 38 reușite, 0 eșuate.
Comanda: `npm test` (Node.js >=18).

Atenție: testele automate trecute nu înlocuiesc testarea manuală în browser a cazului pH 5.2. Acesta rămâne testul manual de acceptanță imediat următor.

## Ce nu este încă finalizat
1. Publicarea/integrarea efectivă a stării v0.7 în repository-ul GitHub `Aplicatie` NU este confirmată. ZIP-ul este un pachet local de lucru, nu dovada unui commit sau merge.
2. Trebuie conectat GitHub în ChatGPT, apoi inspectat repository-ul și branch-ul real înainte de orice push.
3. Compară repository-ul cu acest pachet; păstrează modificările existente și D-001–D-044. Preferă un branch/commit sau PR verificabil, nu suprascriere oarbă.
4. După integrare, verifică CI/testele din repository și consemnează commit SHA și branch-ul aici.
5. Test manual: creează/folosește atributul pH cu limite recomandate 5.5–6.5 și încearcă o măsurătoare 5.2. Așteptat: avertisment + opțiune de continuare; după confirmare, valoarea 5.2 trebuie să fie înregistrată și vizibilă în cronologie/valoarea curentă.
6. Testează și 7.0, o valoare în interval, valoare inițială goală la atribut opțional și invalidarea minim > maxim.
7. Verifică problema anterioară de populații/solduri: diferența dintre cantitatea populației și soldul derivat trebuie explicată și validată pe date reale, nu doar presupusă.

## Instrucțiuni pentru următoarea sesiune
- Începe prin a citi acest fișier și `README.md`.
- Nu cere utilizatorului să reexplice proiectul, deciziile, arhitectura sau istoricul versiunilor.
- Nu cere să repete pași deja efectuați.
- Prima acțiune tehnică: conectează/verifică GitHub și inspectează repository-ul `Aplicatie`, branch-ul implicit și ultimul commit; apoi compară cu pachetul v0.7.
- Nu pretinde că v0.7 este în GitHub până când un commit/PR este confirmat.
- Utilizatorul nu este programator: explică pașii operaționali în română, unul câte unul, fără jargon inutil.

## Fișiere de pornire locală
- `Porneste-Collector.bat` pornește serverul local.
- Deschide `http://localhost:8000` în browser.
- Nu închide fereastra serverului cât timp folosește aplicația.
