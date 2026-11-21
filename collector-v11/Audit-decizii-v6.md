# Audit Collector MVP v6 — decizii D-001–D-044

Data: 24.10.2026. Scop: status verificabil al prototipului local, nu declarație că întregul produs final este terminat.

## Rezumat

v6 implementează nucleul de date local-first și evenimente pentru entități, atribute, relații/locații, populații/stoc și financiar. Nu implementează un model AI conectat, cloud, autentificare sau sincronizare multi-dispozitiv. Interfața de comenzi rapide este deterministă și limitată; nu este prezentată drept AI.

| Decizie | Status v6 | Implementare / limită |
|---|---|---|
| D-001 Aplicație universală | Parțial | Tipuri de entități libere și atribute configurabile; modulele de domeniu nu sunt AI-driven. |
| D-002 Asistent AI cu memorie | Neimplementat | Nu există backend/model AI. Datele persistente locale există, dar nu reprezintă memorie conversațională AI. |
| D-003 Voice-first | Parțial | Dictare în browser când SpeechRecognition este disponibil; experiența vocală completă lipsește. |
| D-004 Motor unic | Parțial | Motor de domeniu separat în `engine.js`; parserul de comenzi este încă limitat. |
| D-005 Separarea responsabilităților | Parțial | Motorul validează și aplică operații; unele reguli de formular sunt în UI. |
| D-006 Istoricul sursa adevărului | Implementat pentru modelul local | Proiecțiile sunt reconstruite din jurnal înaintea fiecărui commit; replay disponibil. |
| D-007 Model hibrid | Implementat local | Jurnal append-only plus proiecții reconstruibile; fără DB/server. |
| D-008 Proiecții | Implementat pentru domeniile incluse | Entități, atribute, relații, stoc și financiar se reconstruiesc din evenimente. |
| D-009 Offline | Parțial | Datele și operațiile de bază sunt locale/offline; sincronizarea și AI local/cloud lipsesc. |
| D-010 Entitate universală | Implementat pentru nucleu | ID intern unic, tip configurabil, entități reconstruite din jurnal. |
| D-011 Granularitate progresivă | Parțial | Grup/populație anonimă disponibilă; rafinarea asistată AI către indivizi nu este implementată. |
| D-012 Grup/populație | Implementat pentru cantitate anonimă | Populația este entitate separată, fără a genera indivizi automat. |
| D-013 Sold pe locație și dispoziție | Implementat pentru stocul de bază | Soldurile se calculează din mișcări și dispoziții; nu sunt editabile direct. |
| D-014 Prioritatea identificării explicite | Parțial | Selectarea explicită în formulare este disponibilă; motorul AI de consumare/rezolvare nu există. |
| D-015 Identificare prin atribute | Parțial | Definițiile pot marca atribute de identificare; rezolvarea natural-language a ambiguității lipsește. |
| D-016 Consumarea cantității anonime | Parțial | Cantitățile anonime există și sunt folosite prin grupuri selectate explicit; alocarea AI automată nu există. |
| D-017 Eveniment cu mai multe operații | Implementat | Evenimentele acceptă operații multiple, inclusiv stoc+financiar. |
| D-018 Atomicitate evenimente | Implementat pentru operațiile motorului | Operațiile sunt aplicate pe o copie temporară; eșecul anulează întregul commit. |
| D-019 Precondiții | Parțial | Existență entități/locații, tipuri numerice și cantitate disponibilă validate; nu toate regulile de domeniu. |
| D-020 Impact analysis | Parțial | Impactul operațiilor principale se aplică prin motor; nu există raport universal complet de impact înainte de commit. |
| D-021 Invariante | Parțial | Sold activ negativ, relație de localizare duplicată și ciclu în ierarhia locațiilor blocate; alte invariante specifice domeniului lipsesc. |
| D-022 Idempotency | Parțial | Motorul respinge intentKey repetat; comenzile rapide folosesc cheie stabilă pe interval de cinci minute. Nu există deduplicare AI distribuită. |
| D-023 Confidence vs Certainty | Parțial | Certitudinea datelor este păstrată separat; confidence AI nu există fără model AI. |
| D-024 Valorile incerte | Implementat pentru atribute și stoc | Certitudinea se păstrează separat; punctele incerte sunt vizual distincte în grafice. |
| D-025 Atribute statice/dinamice | Implementat | Natură configurabilă; valorile succesive au timestamp și istoric. |
| D-026 Rolul atributelor | Implementat | Rolul este separat de natură. |
| D-027 Atribute configurabile | Parțial | Tip, rol, natură, proprietar, required, identificare, istoric și limite numerice; reguli arbitrare/câmpuri calculate generale lipsesc. |
| D-028 Proprietarul atributului | Parțial | Proprietarul poate fi entitate/locație/relație/eveniment; valori pe entitate, relație și eveniment sunt suportate în nucleu, dar UI-ul nu acoperă toate combinațiile de utilizare. |
| D-029 Locația este relație | Implementat | Localizarea este relație temporală `located_in`, nu câmp text. |
| D-030 Ierarhia locațiilor | Implementat pentru relații `located_in` | Căile părinte se deduc; ciclurile sunt blocate. |
| D-031 Temporalitate generală | Parțial | Evenimente, atribute, relații și mișcări de stoc sunt temporale; toate tipurile arbitrare de obiecte nu au UI complet. |
| D-032 Evenimente în grafice | Parțial | Grafic numeric cu marcatori pentru evenimente discrete în același interval; nu există selector general de categorii multiple. |
| D-033 Financiar pe evenimente | Implementat pentru tranzacții de bază | Cost/venit/taxă se înregistrează ca operație a unui eveniment; corecțiile financiare sunt compensatorii. |
| D-034 Cost derivat pe entitate | Parțial | Înregistrările financiare sunt asociate entității și se pot agrega; cost de achiziție/valoare de stoc avansate lipsesc. |
| D-035 Relații ca obiecte de prim rang | Implementat pentru modelul de bază | Relațiile au ID, sursă, tip, destinație, început/sfârșit, atribute și istoric. |
| D-036 Relațiile se schimbă prin evenimente | Implementat pentru creare/închidere/mutare | Modificările sunt evenimente, relațiile istorice rămân. |
| D-037 Domenii ca module de cunoaștere | Neimplementat | Necesită arhitectură de module AI/configurabile. |
| D-038 Context conversațional | Parțial | Expirare locală după 30 minute; sesiune conversațională completă nu există. |
| D-039 Contextul nu contrazice datele | Parțial | Parserul refuză entități/atribute ambigue sau lipsă; nu există AI/context semantic. |
| D-040 Ordinea deciziei | Parțial | Parserul folosește informația explicită și refuză ghicirea; lanțul complet AI nu există. |
| D-041 Clarificare minimă | Parțial | Mesaje scurte pentru date lipsă/ambigue în parser; nu există dialog AI dinamic. |
| D-042 AI nu modifică modelul în tăcere | Parțial | Schema nu este schimbată de parser; definirea atributelor se confirmă explicit. Fără AI de propunere. |
| D-043 Audit | Parțial | Evenimentele păstrează ID, timestamp, actor local, sursă, certitudine și corecții; fără identitate autentificată. |
| D-044 Corecții prin evenimente noi | Parțial | Corecțiile creează evenimente compensatorii pentru atribute/stoc/financiar/relații; nu șterg evenimentul original. Textul sursă al D-044 este trunchiat în fișierul primit, deci sensul integral trebuie confirmat. |
| D-018 Configurare asistată a atributelor (secțiune suplimentară din registru) | Parțial | Sugestii deterministe după nume, cu confirmare; nu este AI. |

## Teste executate

`node test-engine.js` a trecut pentru: istoric de valori temporale, relații și ierarhie de locații, blocarea ciclurilor, solduri, rollback atomic, corecție de stoc, tranzacții financiare, idempotency și replay.

`node --check app.js` și `node --check engine.js` au trecut.

Testul automat Chromium nu a putut fi dus la capăt în mediul de construire (procesul browserului a rămas blocat înainte să producă DOM). Prin urmare, interfața trebuie verificată în browserul local înainte de a considera MVP-ul validat complet.

## Actualizare v8 — vizibilitatea relațiilor
Problema observată la testare: relațiile active erau listate în pagina „Relații & locații”, dar nu erau afișate în pagina „Entități”. v8 adaugă relațiile active în detaliul entității și numărul lor în lista de entități. Aceasta este o corecție de prezentare; relațiile și jurnalul existent nu sunt rescrise. Verificări automate: `node --check app.js` și `node test-engine.js` trecute. Interfața trebuie verificată în browser.
