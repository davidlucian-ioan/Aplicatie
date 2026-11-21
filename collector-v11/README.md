# Collector MVP v11 — aplicația executabilă

Aceasta este aplicația Collector v11. Documentele canonice de produs și deciziile sunt păstrate în rădăcina repository-ului: `../Decizio.md`, `../Dictionar.md`, `../Model-conceptual.md`, `../Scenarii.md` și `../Biblia`.

## Pornire pe Windows

1. Deschide folderul `collector-v11`.
2. Dublu-click pe `Porneste-Collector.bat`.
3. Browserul se deschide la `http://localhost:8000/index-server.html`.
4. Lasă fereastra serverului deschisă cât timp folosești aplicația.

Pornirea folosește portul 8000 și aceeași origine `http://localhost:8000`, necesară pentru a vedea datele existente salvate în browser. Păstrează un export JSON înainte de migrare. Nu importa exportul peste date existente fără verificare.

## Teste

Necesită Node.js 18 sau mai nou. Din acest folder rulează `npm test`.

## Conținut funcțional

Core generic separat de UI, jurnal append-only, replay și proiecții reconstruibile, entități și atribute configurabile, relații și ierarhii de locații, populații anonime, membri identificați, solduri și finanțe, corecții prin evenimente noi, import/export JSON și verificare Replay.

Core Port oferă preview/execute cu confirmare explicită. AI Foundation include un provider mock; **nu este conectat un provider AI real**.

## Politica intervalelor pentru măsurători

Minimul și maximul sunt intervale recomandate. O măsurătoare în afara intervalului (de exemplu pH 5.2 când intervalul recomandat este 5.5–6.5) se înregistrează cu avertisment, nu se blochează. Limitele tehnice și integritatea datelor rămân validate separat.

## Verificare release v0.7

La 21 noiembrie 2026, arhiva v0.7 a trecut 38/38 teste automate (`npm test`). Replay-ul setului de test a reconstruit 38 evenimente, 5 entități, 5 relații și 4 înregistrări de stoc, fără avertismente. Aceste valori descriu setul de test, nu un set de date implicit.
