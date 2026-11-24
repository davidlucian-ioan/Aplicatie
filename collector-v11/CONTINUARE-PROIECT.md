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

---

## Actualizare 2026-11-24 — WORK / THINK / Voice Read-back

### Repository și dependențe verificate
- Repository: `davidlucian-ioan/Aplicatie`.
- `main` nu a fost modificat și nu s-a făcut niciun merge automat.
- PR #43 — Android foundation: `feature/android-native-recorder` → `main`. Rămâne draft; build-ul APK reușește, dar testarea fizică pe Android este obligatorie înainte de a declara înregistrarea cu ecranul stins fiabilă.
- PR #44 — WORK/THINK workspace: `feature/think-dashboard-analytics` → `feature/android-native-recorder`. Include ecranul WORK pentru captură și remindere, THINK cu indicatori, graficul local pe 7 zile, scurtături către module și teste UI. Quality CI și Android debug build au trecut.
- PR #45 — spoken read-back: `feature/voice-readback` → `feature/think-dashboard-analytics`. Include sinteză vocală română pentru preview și confirmarea salvării, buton de repetare, anularea TTS înainte de captură și suprimarea TTS cât timp reportofonul înregistrează.
- Dependență: #45 → #44 → #43. Nu schimba bazele PR-urilor și nu integra în `main` fără verificarea dependențelor și testarea Android fizică.

### Ultimele verificări confirmate
- THINK PR #44: Quality CI PASS — run `45382375930`; Android debug PASS — run `45382376123`.
- Voice Read-back PR #45, head `71b73b8767f8b9585d06ea833b130d99a1ce362a`: Quality CI PASS — run `45383640700`; Android debug PASS — run `45383640738`.
- Testele noi verifică citirea preview-ului după eliberarea microfonului, faptul că nu se creează evenimente înainte de confirmare și fallback-ul când Speech Synthesis nu este disponibil.
- Build-ul Android reușit confirmă compilarea APK-ului, nu comportamentul pe un telefon fizic cu ecranul blocat.

### Constrângeri păstrate
- D-001–D-044 rămân autoritatea pentru comportamentul domeniului.
- Nicio modificare în Collector Core, schema evenimentelor, Replay, idempotency sau atomicitate pentru aceste două PR-uri.
- AI/speech nu poate ocoli Core Port, preview-ul și confirmarea explicită.
- Speech Recognition în browser nu este prezentat ca offline. TTS este opțional; când nu este disponibil, preview-ul vizual rămâne utilizabil.
- Nicio înregistrare audio nu este trimisă către cloud de aceste funcționalități.

### Actualizare 2026-11-24 — Voice batch preview (PR #46)
- Branch: `feature/voice-batch-preview`, bazat pe `feature/voice-readback`.
- PR: https://github.com/davidlucian-ioan/Aplicatie/pull/46 — deschis, mergeable; nu este integrat.
- Fiecare rezultat final din SpeechRecognition este păstrat ca frază separată; indexurile finale repetate sunt deduplicate.
- La oprirea sesiunii se construiește un singur preview cu lista frazelor și numărul operațiilor. O frază care nu corespunde unei comenzi structurate este păstrată ca observație.
- Operațiile sunt trimise împreună prin Core Port. Confirmarea creează un singur eveniment; anularea nu persistă nimic.
- Quality CI: PASS, run 45385254964; Android build: PASS, run 45385254881.

### Actualizare 2026-11-24 — Entity disambiguation și loturi mixte (PR #47 în pregătire)
- Branch: `feature/voice-entity-disambiguation`, bazat pe `feature/voice-batch-preview`.
- Pentru nume duplicate, UI prezintă candidații cu nume, tip și ID; utilizatorul trebuie să selecteze explicit. Lotul complet este revalidat după fiecare alegere, înainte de preview.
- Țintele inexistente, definițiile de atribut absente/duplicate și selecțiile devenite invalide blochează întregul lot; nu există fallback la prima potrivire.
- Avertismentele pentru valori în afara limitelor recomandate apar în preview, înainte de confirmarea atomică.
- Parserul atributelor folosește delimitatori lexicali cu word-boundary pentru `este`/`la`; a fost prinsă și corectată regresia în care „la” din „Plantă” trunchia numele entității la „P”.
- Teste E2E: disambiguare explicită pentru două entități cu același nume; lot mixt `attribute.set` + `stock.change` cu un singur eveniment; respingere atomică atunci când vânzarea depășește stocul, verificând că jurnalul, atributul și stocul rămân nemodificate.
- Quality CI: PASS, run 45401723053 pentru head `23c10fe76ba6d6014551d8fff8a3239e2dba665e`.
- Android debug build: PASS, run 45401722974 pentru același head.
- PR #47: deschis, mergeable, bazat pe PR #46; fără integrare în `main`.
- Nu s-a modificat Core, schema jurnalului, Replay, idempotency sau D-001–D-044.

- Context vocal local: `collector_voice_context_v1` separat de jurnalul Core, cu TTL strict de 30 de minute; se actualizează numai după commit vocal reușit, nu la preview, anulare, duplicat sau comandă scrisă manual.
- Contextul este vizibil în WORK, poate fi șters manual și este verificat la revenirea aplicației în foreground. Referințele explicite „aceeași entitate/populație/locație” se rezolvă numai către ID-urile confirmate; fără context sau după expirare lotul este respins fără preview.
- Teste E2E pentru referință contextuală, lipsă de context, TTL, comenzi manuale care nu reîmprospătează contextul și păstrarea confirmării explicite.
- Confirmarea Core revalidează jurnalul local înainte de commit. Dacă o altă sesiune a modificat jurnalul după preview, preview-ul este refăcut și se cere o nouă confirmare; store-ul refuză să suprascrie un jurnal mai nou.
- Test E2E cu două pagini/browser sessions reale pe același origin: o sesiune vinde între preview și confirmare; prima confirmare reface preview-ul, a doua confirmă noua stare; nu se pierde evenimentul extern.
- Teste E2E pentru ținte inexistente, entități de tip greșit și destinații care nu sunt locații; lotul este respins integral. Eșecul de persistență în confirmare nu publică starea nouă și nu creează context vocal.
- Quality CI: PASS, run 45405641392; 46 teste Chromium au trecut.
- Android debug build: PASS, run 45405641508.
- Head verificat: `a2ef95e5214367fbda81892d25093315067976d7`; PR #47 rămâne deschis și mergeable, fără integrare în `main`.

### Următorii pași
1. Extinde testele de consistență pentru concurență simultană între două sesiuni și recuperarea după eșec de persistență.
2. Evaluează STT offline pe Android separat de browser SpeechRecognition; nu declara suport offline înainte de testare pe dispozitiv.
3. Testare fizică Android: ecran blocat, schimbare aplicație, distrugere Activity, acțiunea Stop din notificare, întreruperi și recuperarea fișierelor parțiale.
4. Pentru THINK: extinde analizele numai pe baza proiecțiilor/jurnalului local și cu definiții clare ale indicatorilor.

Nu relua audituri finalizate și nu modifica deciziile arhitecturale fără solicitare explicită și analiză de impact.
