# Audit decizii Collector D-001–D-044

**Data auditului:** 24.11.2026  
**Repository:** `davidlucian-ioan/Aplicatie`  
**Branch inspectat:** `feature/android-native-recorder`  
**Commit de bază inspectat:** `a581fdd31794e0c3c5d9bc78bce7bbef38fb1a71`  
**Sursa deciziilor:** `/Decizio.md` din același repository (44 decizii, toate cu status „Înghețată” sau „Înghețată conceptual”).  
**Scop:** comparație între deciziile înghețate și codul/testele existente; nu modifică și nu reinterpretează registrul.

## Criterii

- **Implementată (local):** comportamentul este reprezentat în Core/UI și are teste relevante; nu înseamnă automat producție, cloud sau multi-device.
- **Parțială:** există o parte funcțională, dar lipsește o condiție explicită din decizie sau integrarea completă.
- **Neimplementată:** nu există implementare funcțională în aplicația curentă.
- „Parțială” nu înseamnă acceptată ca finală. Deciziile rămân înghețate; auditul nu le schimbă.

## Rezumat executiv

Core-ul local este mult mai matur decât MVP-urile vechi: jurnalul de evenimente, replay, proiecțiile, populațiile, soldurile, relațiile, atributele configurabile, financiarul de bază, idempotency și o parte importantă din corecții sunt implementate și testate.

Produsul descris de registru nu este însă complet. Cele mai mari decalaje sunt: AI real și memorie permanentă, pipeline unic pentru toate intrările, sincronizare offline, selecție/consum explicită a indivizilor față de cantitatea anonimă, impact analysis complet, module de cunoaștere, context conversațional integrat, grafice configurabile pe categorii, cost derivat pe entitate și audit cu identitate autentificată.

## Verificare individuală

| Decizie | Titlu | Verdict | Dovezi / limită observată |
|---|---|---|---|
| D-001 | Aplicație universală | Parțială | Entități și atribute generice; Core conține totuși operații specializate pentru stoc și financiar, nu module de domeniu complet separate. |
| D-002 | Asistent AI cu memorie | Parțială | Există AI Foundation cu contract, orchestrator, context manager și MockProvider. Nu există provider LLM real și nici memorie permanentă integrată în produs. |
| D-003 | Voice-first | Parțială | Dictare prin SpeechRecognition unde este disponibilă și recorder nativ Android; înregistrarea audio nu echivalează cu transcriere vocală universală și pipeline vocal complet. |
| D-004 | Motor unic | Parțială | `engine.js` este separat de UI, dar formularele UI apelează direct Core, parserul rapid este determinist separat, iar AI Foundation nu orchestrează toate intrările. |
| D-005 | Separarea responsabilităților | Parțială | Core validează și persistă prin BrowserCorePort pentru comenzile rapide integrate; restul formularelor păstrează fluxuri directe și logică de business în UI. |
| D-006 | Istoricul este sursa adevărului | Implementată local | `commit` adaugă evenimente; `replay` reconstruiește proiecțiile. Testele verifică replay și echivalența proiecțiilor. |
| D-007 | Model hibrid de stocare | Implementată local | Jurnalul append-only și proiecțiile reconstruibile sunt prezente; persistența este locală, fără DB/server. |
| D-008 | Proiecții | Implementată local | Entități, atribute, relații, stoc și financiar sunt reconstruite din evenimente; soldurile sunt calculate, nu editate ca sursă primară. |
| D-009 | Offline | Parțială | Operațiile și datele locale funcționează fără cloud; sincronizarea automată la revenirea conexiunii și AI local/cloud nu sunt implementate. |
| D-010 | Entitate universală | Implementată pentru Core | ID-uri interne, tipuri configurabile și entități reconstruite din jurnal. Există și validări specifice tipurilor location/population în operațiile specializate. |
| D-011 | Granularitate progresivă | Parțială | Populațiile și indivizii pot fi modelați separat și legați; nu există rafinare asistată AI, integrată și controlată, de la cantitate anonimă la indivizi. |
| D-012 | Grup / Populație | Implementată pentru modelul local | Populațiile există fără indivizi; relația `contains` poate lega indivizi identificați și reflectă unitatea identificată în proiecția de stoc. |
| D-013 | Sold pe locație și dispoziție | Implementată pentru stocul actual | Soldurile sunt calculate pe populație, locație și dispoziție; dispozițiile sunt valori extensibile. |
| D-014 | Prioritatea identificării explicite | Parțială | Există identificare exactă prin atribute și relații de apartenență; nu există încă un resolver integrat care să consume explicit indivizii aleși înaintea cantității anonime și apoi să deducă/clarifice. |
| D-015 | Identificare prin atribute | Parțială | `identify` caută după tip și egalitate exactă pe atribute; nu există potrivire semantică/ierarhizare a candidaților și clarificare conversațională integrată. |
| D-016 | Consumarea cantității anonime | Parțială | Stocul agregat al populației este gestionat; fluxul de vânzare nu implementează încă regula completă de selecție explicită a indivizilor, apoi consumare anonimă, apoi deducție/clarificare. |
| D-017 | Un eveniment poate conține mai multe operații | Implementată | Evenimentele au liste de operații; testele acoperă operații compuse de stoc/financiar/atribute și relații. |
| D-018 | Atomicitatea evenimentelor | Implementată pentru Core/replay | `commit` aplică operațiile pe un draft clonat; eșecul anulează întregul eveniment. Replay-ul folosește tranzacție pentru evenimente compuse și operații de corecție relevante. |
| D-019 | Precondiții | Implementată pentru operațiile existente | Core verifică existența țintelor, compatibilitatea tipurilor, cantitatea disponibilă, valori și condiții relaționale înainte de commit. Acoperirea este limitată la operațiile implementate. |
| D-020 | Impact Analysis | Parțială | Preview-ul simulează commit fără persistență și raportează ținte/număr de proiecții afectate; nu există încă analiză generică, completă și explicativă a tuturor efectelor și dependențelor. |
| D-021 | Invariante | Implementată pentru regulile existente | Sunt protejate soldurile negative, ciclurile de locații, locația activă unică și alte condiții ale operațiilor. Nu există un motor declarativ universal de invariante. |
| D-022 | Idempotency | Implementată local | Core deduplică după ID și `intentKey`; BrowserCorePort mapează `idempotencyKey` la `intentKey`; testele verifică duplicatele și replay-ul. |
| D-023 | Confidence versus Certainty | Parțială | Contractul AI separă confidence (interpretare) de certainty (realitate), iar Core păstrează certainty; providerul este însă MockProvider, fără interpretare AI reală. |
| D-024 | Valorile incerte | Parțială | Certainty este păstrată la măsurători și stoc; graficul distinge vizual valorile incerte, dar nu oferă încă toate controalele de includere/excludere cerute. |
| D-025 | Atribute statice și dinamice | Implementată pentru modelul actual | Definițiile au natură; istoricul atributelor dinamice păstrează valori și timestamp-uri, iar valoarea curentă este derivată. |
| D-026 | Rolul atributelor | Implementată | Rolul atributului este separat de natură și este configurabil în definiție. |
| D-027 | Atribute configurabile | Implementată pentru UI/Core actual | Tip, reguli, obligatoriu, natură, identificare și istoric sunt configurabile; politica limitelor recomandate este testată pe fluxurile existente. |
| D-028 | Proprietarul atributului | Parțială | Sunt suportate atribute pentru entități, relații și evenimente; locațiile sunt entități. Nu există încă un mecanism uniform pentru orice tip viitor de proprietar. |
| D-029 | Locația este relație | Implementată | Localizarea folosește relații cu istoric, nu câmp text simplu; locația activă se rezolvă din relații. |
| D-030 | Ierarhia locațiilor | Implementată pentru modelul actual | `contains`/`located_in`, calculul căii și protecția anti-ciclu sunt prezente și testate. |
| D-031 | Temporalitate generală | Parțială | Atributele, relațiile și evenimentele au istoric temporal; nu toate tipurile posibile de informație au încă un contract temporal generic comun. |
| D-032 | Evenimente în grafice | Parțială | Graficul numeric poate afișa evenimente discrete pe aceeași axă temporală și distinge incertitudinea; nu există selector complet de categorii multiple. |
| D-033 | Financiar pe evenimente | Implementată pentru tranzacții de bază | Costurile/veniturile sunt operații ale evenimentelor și se reconstruiesc; mutarea nu rescrie achiziția. |
| D-034 | Cost derivat pe entitate | Parțială | Înregistrările financiare pot referi o entitate și totalurile se agregă; nu există încă proiecția completă a costului de achiziție/datei și indicatorilor avansați pe entitate. |
| D-035 | Relații ca obiecte de prim rang | Implementată | Relațiile au ID, sursă, destinație, tip, istoric temporal și atribute. |
| D-036 | Relațiile se schimbă prin evenimente | Implementată pentru operațiile existente | Crearea, închiderea și mutarea sunt operații de eveniment; istoricul relației este păstrat. |
| D-037 | Domenii ca module de cunoaștere | Neimplementată | Nu există loader/registru de module de domeniu; fișierele AI actuale sunt contracte, adaptoare, orchestrator și mock provider. |
| D-038 | Context conversațional | Parțială | TTL de 30 minute există în ContextManager și în metadatele Core; ContextManager nu este încă integrat cu un provider real și cu o sesiune conversațională completă în UI. |
| D-039 | Contextul nu poate contrazice datele | Parțială | Decision Gate gestionează ambiguități, iar parserul refuză unele ținte lipsă/ambigue; lipsește resolverul semantic AI integrat cu datele validate. |
| D-040 | Ordinea deciziei | Parțială | Ordinea este descrisă în arhitectura AI și parserul evită ghicirea; nu există încă un motor complet care să aplice sistematic toate cele șase niveluri. |
| D-041 | Clarificare minimă | Parțială | Formularele și parserul dau erori/cereri punctuale; nu există dialog AI dinamic care să pună garantat o singură întrebare minimă. |
| D-042 | AI nu modifică modelul în tăcere | Parțială | UI cere definirea/confirmarea explicită a atributelor; AI-ul nu este conectat pentru a propune extensii de schemă printr-un flux de aprobare. |
| D-043 | Audit | Parțială | Evenimentele păstrează timestamp, source, actor local, payload și legături de corecție; lipsește identitatea autentificată și trasabilitatea uniformă a intenției/actorului. |
| D-044 | Corecții prin evenimente noi | Parțială, cu acoperire semnificativă | Corecțiile sunt evenimente noi legate de original; sunt acoperite atribute, stoc, financiar, mutări/închideri/creări de relații, redenumiri și atribute de eveniment. Replay și corecțiile compuse au teste. Limite: operațiile fără compensare sigură sunt refuzate; scrierile duplicate ambigue sunt refuzate; nu toate tipurile viitoare de operații au reguli de corecție. |

## Probleme transversale și priorități

1. **AI real și memorie permanentă:** înainte de conectarea unui provider, trebuie finalizate autorizarea, allowlist-ul, confirmarea pentru operații cu risc, validarea strictă a payload-ului și politica datelor trimise către cloud. AI Foundation actual este scaffold cu MockProvider.
2. **Un singur pipeline:** migrarea formularelor și comenzilor rapide către același contract Core Port; eliminarea logicii de business din UI.
3. **Stoc și identitate:** separarea clară a cantității anonime de membrii identificați și implementarea ordinii D-014/D-016, cu teste pentru vânzare, transfer, dispoziție și corecție.
4. **Impact analysis:** rezultat de preview care explică toate efectele asupra entităților, relațiilor, soldurilor, financiarului, atributelor și alertelor.
5. **Corecții D-044:** păstrarea refuzului sigur pentru cazurile ambigue; extinderea controlată a regulilor de compensare și a testelor de replay pentru fiecare operație nouă.
6. **Temporalitate/analiză:** selector de categorii în grafice și filtre clare pentru valori incerte.
7. **Audit și offline:** actor autentificat, legături uniforme cu intenția și sincronizare cu rezolvare de conflicte.

## Verificări automate observate

Pe commitul de bază menționat:
- Quality workflow: succes; testele Node/Core/AI și E2E Chromium au trecut.
- E2E: testul pentru bundle-ul Android a verificat pornirea, scripturile, meniul mobil și formularul; raportul workflow indică 30 teste trecute.
- Android workflow: build debug și upload artifact au trecut.
- Aceste rezultate validează build-ul și comportamentul testat în Chromium; **nu** dovedesc încă funcționarea pe un dispozitiv Android fizic și nu transformă deciziile marcate „Parțială” în „Implementată”.

## Concluzie

Registrul D-001–D-044 rămâne autoritatea și nu a fost modificat. Core-ul local acoperă bine jurnalul/replay-ul, atomicitatea, invariantele de bază, relațiile, populațiile, stocul, atributele, financiarul de bază și o parte importantă din D-044. Produsul complet descris de decizii nu este încă realizat. Prioritatea tehnică nu este să conectăm imediat un LLM, ci să închidem decalajele Core/UX și controalele de securitate ale AI Foundation.
