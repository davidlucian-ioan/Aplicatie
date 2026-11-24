# Collector — punct unic de continuare

Ultima actualizare: 2026-11-24
Versiune de lucru: v0.8 — OpenAI Provider Integration (branch separat)

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

## Integrare OpenAI — 2026-11-24
- Provider ales: OpenAI API, Responses API cu Structured Outputs.
- Branch: `feature/openai-provider-integration`.
- Server local: `server.js`, ascultă implicit pe `127.0.0.1:8000`.
- Cheia API este citită exclusiv din `OPENAI_API_KEY`; `.env` este ignorat de Git.
- Model implicit: `gpt-6.2-sol`, suprascris prin `OPENAI_MODEL`.
- UI are buton separat „Interpretează cu AI”; interpretarea locală existentă rămâne disponibilă.
- OpenAI primește textul comenzii și metadate limitate de entități/atribute, nu jurnalul complet.
- Propunerile trec prin BrowserCorePort preview și confirmare explicită. Nu există execuție automată.
- Endpoint-ul folosește `store:false`, limită de corp, rate limit și verificare Origin.
- Teste provider cu fetch mock și teste de wiring/siguranță adăugate; CI a identificat și a ghidat corectarea unei regresii în testul nou. Ultimul run trebuie reverificat după commitul curent. Nu s-a efectuat încă un apel cu o cheie API reală.

## Ce nu este încă finalizat
1. Verifică finalizarea GitHub Actions pentru branch-ul `feature/openai-provider-integration`; remediază orice regresie înainte de PR.
2. Creează PR către `main` după trecerea testelor și revizuirea schimbărilor.
3. Configurează `OPENAI_API_KEY` pe calculatorul unde rulează Collector și efectuează un test real de interpretare.
4. Testează refuzuri, clarificări, intenții ambigue, operații nepermise, limite/rate limit și indisponibilitatea rețelei.
5. Test manual: creează/folosește atributul pH cu limite recomandate 5.5–6.5 și încearcă o măsurătoare 5.2. Așteptat: avertisment + opțiune de continuare; după confirmare, valoarea 5.2 trebuie să fie înregistrată și vizibilă în cronologie/valoarea curentă.
6. Testează și 7.0, o valoare în interval, valoare inițială goală la atribut opțional și invalidarea minim > maxim.
7. Verifică problema anterioară de populații/solduri: diferența dintre cantitatea populației și soldul derivat trebuie explicată și validată pe date reale, nu doar presupusă.

## Instrucțiuni pentru următoarea sesiune
- Continuă pe branch-ul `feature/openai-provider-integration` până când testele CI trec.
- Nu modifica direct `main` și nu crea PR înainte de verificarea CI.
- Păstrează D-001–D-044 și separarea strictă AI/Core.
- Nu cere utilizatorului să repete contextul sau pașii deja documentați.
- Utilizatorul nu este programator: explică pașii operaționali în română, unul câte unul, fără jargon inutil.

## Fișiere de pornire locală
- `Porneste-Collector.bat` pornește serverul local.
- Deschide `http://localhost:8000` în browser.
- Nu închide fereastra serverului cât timp folosește aplicația.
