# Registrul deciziilor

## D-001 — Aplicație universală

**Categorie:** Product  
**Status:** Înghețată

Aplicația este proiectată pentru orice domeniu sau colecție de informații, nu pentru un singur domeniu.

Motorul generic nu conține logică specifică unui domeniu.

---

## D-002 — Asistent AI cu memorie

**Categorie:** AI / Product  
**Status:** Înghețată

Aplicația este un asistent personal cu memorie, nu doar un jurnal sau chatbot.

---

## D-003 — Voice-first

**Categorie:** UX  
**Status:** Înghețată

Interacțiunea vocală este metoda principală de introducere a informațiilor.

Utilizatorul trebuie să poată documenta fără formulare și fără interacțiuni inutile cu ecranul.

Răspunsurile sunt scurte în mod implicit.

Dacă utilizatorul cere informații suplimentare, sistemul poate dezvolta răspunsul și poate folosi surse externe atunci când este necesar.

---

## D-004 — Motor unic

**Categorie:** Arhitectură  
**Status:** Înghețată

Toate intrările trec prin același flux logic:

**Intrare → Înțelegere → Context → Validare → Procesare → Actualizare → Răspuns**

Motorul este independent de interfață.

---

## D-005 — Separarea responsabilităților

**Categorie:** Arhitectură  
**Status:** Înghețată

**AI-ul propune → Motorul decide și persistă → Interfața prezintă.**

AI-ul nu scrie direct în baza de date.

Interfața nu conține logică de business.

---

## D-006 — Istoricul este sursa adevărului

**Categorie:** Date / Arhitectură  
**Status:** Înghețată

Evenimentele reprezintă sursa primară a adevărului.

Starea curentă, soldurile și alte proiecții sunt derivate din evenimente.

---

## D-007 — Model hibrid de stocare

**Categorie:** Date / Arhitectură  
**Status:** Înghețată

Se folosește conceptual un model hibrid:

- evenimentele păstrează istoricul;
- proiecțiile de stare permit acces rapid;
- corecțiile se fac prin evenimente noi;
- datele derivate nu înlocuiesc istoricul.

Tehnologia concretă de stocare rămâne o decizie tehnică ce trebuie validată ulterior.

---

## D-008 — Proiecții

**Categorie:** Date / Performance  
**Status:** Înghețată

Proiecțiile reprezintă starea curentă derivată din evenimente.

Un sold nu este modificat direct ca sursă de adevăr.

Exemplu:

„Am mutat 5 Fancy din B3 în B8.”

Produce:

- B3 activ: -5;
- B8 activ: +5.

Aceste valori sunt proiecții.

---

## D-009 — Offline

**Categorie:** Offline / Sync  
**Status:** Înghețată

Funcțiile de bază trebuie să funcționeze fără internet:

- documentare;
- acces la date locale;
- căutări locale;
- operațiuni de bază;
- alerte locale.

Datele se sincronizează automat când conexiunea revine.

AI-ul este împărțit conceptual în:

- AI local;
- AI cloud.

---

## D-010 — Entitate universală

**Categorie:** Date / Extensibilitate  
**Status:** Înghețată

Există un model universal de entitate.

Fiecare entitate are un ID intern unic și permanent.

ID-ul intern nu este destinat utilizării normale de către utilizator.

Tipurile de entități sunt configurabile și nu sunt hardcodate în motor.

---

## D-011 — Granularitate progresivă

**Categorie:** Date / AI / Product  
**Status:** Înghețată

Sistemul pornește de la minimum de informație necesar și crește granularitatea doar când informația disponibilă sau o operațiune ulterioară o justifică.

Exemplu:

„Am pus 5 Fancy în B3.”

Poate fi documentat inițial simplu:

**Fancy → B3 → activ → 5**

Nu se creează automat cinci indivizi.

Ulterior, dacă apar informații suficient de precise, entitățile individuale pot fi identificate și asociate grupului/populației existente.

Sistemul nu inventează granularitate care nu a fost furnizată sau dedusă valid.

---

## D-012 — Grup / Populație

**Categorie:** Date / Model  
**Status:** Înghețată conceptual

Sistemul poate reprezenta o colecție de indivizi printr-un grup/populație.

Un grup/populație poate exista fără ca indivizii să fie identificați individual.

Exemplu:

**Fancy → B3 → 5**

Ulterior pot fi identificați indivizi din aceeași populație.

Modelul trebuie să permită trecerea progresivă:

**cantitate anonimă → indivizi identificați**

fără pierderea istoricului.

---

## D-013 — Sold pe locație și dispoziție

**Categorie:** Date / Business  
**Status:** Înghețată conceptual

Locația poate avea o proiecție de cantitate pentru o entitate sau populație, împreună cu o dispoziție/stare de deținere.

Exemplu:

**B3 → Fancy → activ = 5**

Dacă se vând 2:

**B3 → Fancy → activ = 3**  
**B3 → Fancy → vândut = 2**

Soldul este o proiecție derivată din evenimente.

Dispozițiile trebuie să fie extensibile și nu trebuie hardcodate într-o listă rigidă.

Exemple posibile:

- activ;
- vândut;
- donat;
- decedat;
- pierdut;
- returnat.

---

## D-014 — Prioritatea identificării explicite

**Categorie:** AI / Motor  
**Status:** Înghețată

Informația explicită furnizată de utilizator are prioritate față de regulile automate de selecție.

La operații cantitative:

1. se folosesc indivizii identificați explicit de utilizator;
2. pentru cantitatea rămasă se folosește cantitatea anonimă;
3. dacă aceasta nu este suficientă, sistemul încearcă deducția;
4. dacă rămâne ambiguitate, cere clarificarea minimă necesară.

---

## D-015 — Identificare prin atribute

**Categorie:** AI / Date  
**Status:** Înghețată

Un individ poate fi identificat prin orice combinație de atribute suficient de distinctivă.

Utilizatorul nu trebuie să cunoască ID-ul intern.

Exemplu:

„Femela Boa Like cu Spider Legs.”

Motorul poate identifica individul folosind combinația atributelor existente.

Dacă există mai multe candidate, sistemul folosește informațiile disponibile pentru a le elimina.

Dacă ambiguitatea rămâne, pune o singură întrebare scurtă.

---

## D-016 — Consumarea cantității anonime

**Categorie:** Business / Date  
**Status:** Înghețată

Dacă utilizatorul execută o operație cantitativă fără să specifice indivizii, sistemul consumă mai întâi cantitatea anonimă.

Exemplu:

B3:

- 7 Fancy anonimi;
- 3 Fancy identificați.

„Am vândut 5 Fancy.”

Rezultat:

- 5 anonimi → vânduți;
- 2 anonimi rămân;
- indivizii identificați nu sunt afectați.

Dacă utilizatorul specifică explicit un individ sau o combinație de atribute, specificația sa are prioritate.

---

## D-017 — Un eveniment poate conține mai multe operații

**Categorie:** Arhitectură / Date  
**Status:** Înghețată

O singură intenție umană poate produce un singur eveniment logic care conține mai multe operații interne.

Exemplu:

„Mută în B8 femela Boa Like și încă 4 Fancy.”

Evenimentul poate conține:

- transferul individului identificat;
- transferul celor 4 anonimi.

Pentru utilizator este o singură acțiune.

Pentru motor sunt operații interne coerente, tratate atomic.

---

## D-018 — Atomicitatea evenimentelor

**Categorie:** Arhitectură / Date  
**Status:** Înghețată

O operație complexă trebuie aplicată integral sau deloc.

Nu este permisă o stare intermediară în care o parte din efecte a fost aplicată și alta nu.

Exemplu:

Dacă transferul B3 → B8 eșuează, nu se poate scădea cantitatea din B3 fără actualizarea corespunzătoare a B8.

---

## D-019 — Precondiții

**Categorie:** Motor / Validare  
**Status:** Înghețată conceptual

Înainte de aplicarea unui eveniment, motorul verifică precondițiile relevante.

Exemple:

- entitățile există;
- tipurile sunt compatibile;
- relațiile necesare există;
- cantitatea este disponibilă;
- valorile sunt valide;
- regulile domeniului permit operația.

Dacă o precondiție critică eșuează, evenimentul nu este aplicat.

---

## D-020 — Impact Analysis

**Categorie:** Motor / Date  
**Status:** Înghețată conceptual

Înainte de persistare, motorul determină efectele evenimentului asupra:

- entităților;
- atributelor;
- relațiilor;
- locațiilor;
- soldurilor;
- proiecțiilor;
- alertelor;
- altor componente afectate.

Evenimentul definește schimbarea, iar motorul determină consecințele conform regulilor.

---

## D-021 — Invariante

**Categorie:** Motor / Validare  
**Status:** Înghețată conceptual

Motorul trebuie să protejeze reguli care nu pot fi încălcate.

Exemple:

- soldul activ nu poate deveni negativ;
- o entitate nu poate avea simultan două locații incompatibile;
- o operație nu poate produce o relație imposibilă conform regulilor tipului.

---

## D-022 — Idempotency

**Categorie:** Arhitectură / Sync  
**Status:** Înghețată conceptual

Aceeași intenție/operație nu trebuie aplicată de două ori din cauza procesării duplicate.

Fiecare operație relevantă trebuie să poată fi identificată unic.

Exemplu:

Dacă aceeași comandă vocală este procesată de două ori, transferul de 5 nu trebuie să devină transfer de 10.

---

## D-023 — Confidence versus Certainty

**Categorie:** AI / Date  
**Status:** Înghețată

**Confidence** reprezintă încrederea AI-ului în interpretarea unei cereri și este folosită în procesul de decizie.

Nu este obligatoriu un atribut al evenimentului.

**Certainty** reprezintă cât de sigură este informația în lumea reală, conform utilizatorului sau sursei.

Exemplu:

„Cred că am mutat vreo 10 pui.”

Informația poate fi păstrată ca incertă.

---

## D-024 — Valorile incerte

**Categorie:** Date / UX / Analiză  
**Status:** Înghețată

O valoare incertă nu trebuie transformată într-o valoare exactă doar pentru comoditate.

Valoarea numerică este păstrată separat de starea de certitudine.

Exemplu conceptual:

**valoare = 10**  
**certainty = incertă**

Interfața poate afișa:

**„10”**

sau poate utiliza altă reprezentare vizuală distinctă.

În grafice, valorile incerte trebuie să poată fi:

- incluse;
- excluse;
- afișate distinct.

Datele rămân disponibile pentru analiză.

---

## D-025 — Atribute statice și dinamice

**Categorie:** Date  
**Status:** Înghețată

Atributele pot avea naturi diferite:

- statice;
- dinamice;
- calculate.

Atributele dinamice pot avea istoric.

Exemplu:

pH:

6,4 → 6,8

Ambele valori rămân în istoric, iar 6,8 este valoarea curentă.

---

## D-026 — Rolul atributelor

**Categorie:** Date  
**Status:** Înghețată

Natura atributului este separată de rolul său.

Rolurile pot include:

- identificare;
- descriere;
- stare;
- financiar;
- măsurare;
- alt rol configurabil.

Aceste axe nu trebuie combinate într-un singur concept.

---

## D-027 — Atribute configurabile

**Categorie:** Arhitectură / Extensibilitate  
**Status:** Înghețată

Atributele specifice domeniului sunt configurabile.

Un atribut poate defini:

- tipul de date;
- reguli de validare;
- dacă este obligatoriu;
- dacă este static, dinamic sau calculat;
- dacă este relevant pentru identificare;
- dacă are istoric;
- alte proprietăți configurabile.

Motorul nu cunoaște numele atributelor specifice domeniului, ci comportamentul lor.

---

## D-028 — Proprietarul atributului

**Categorie:** Date  
**Status:** Înghețată

Un atribut poate aparține, în funcție de model, unei:

- entități;
- locații;
- relații;
- eveniment.

Modelul nu presupune că toate atributele aparțin exclusiv entităților.

---

## D-029 — Locația este relație

**Categorie:** Date  
**Status:** Înghețată

Locația nu este un simplu câmp text.

Relația de localizare are istoric și poate fi analizată temporal.

Exemplu:

**Monstera → Raft 2 → Raft 4**

---

## D-030 — Ierarhia locațiilor

**Categorie:** Date / Relații  
**Status:** Înghețată

Locațiile pot forma ierarhii.

Exemplu:

**Monstera → Raft 4 → Sera 2 → Curte**

Dacă entitatea este mutată pe Raft 4, sistemul poate deduce locațiile părinte prin relațiile existente.

Nu se creează evenimente duplicate pentru fiecare nivel al ierarhiei.

---

## D-031 — Temporalitate generală

**Categorie:** Date / Analiză  
**Status:** Înghețată

Orice informație relevantă care se schimbă în timp trebuie să poată fi reprezentată temporal.

Aceasta poate include:

- atribute;
- relații;
- locații;
- stări;
- observații;
- măsurători;
- evenimente.

---

## D-032 — Evenimente în grafice

**Categorie:** Analiză / UX  
**Status:** Înghețată

Graficele pot combina valori măsurate cu evenimente discrete.

Exemplu:

Pe graficul unei plante pot apărea:

- înălțime;
- număr de frunze;
- umiditate;
- mutări;
- fertilizări;
- tratamente.

Utilizatorul poate activa sau dezactiva categorii de date.

Aplicația poate evidenția corelații temporale, dar nu trebuie să pretindă automat cauzalitate.

---

## D-033 — Financiar pe evenimente

**Categorie:** Business / Date  
**Status:** Înghețată

Informațiile financiare relevante sunt asociate evenimentelor care le produc.

Exemple:

- cumpărare → cost;
- vânzare → preț de vânzare;
- taxă → cost;
- alte tranzacții financiare.

Costul de achiziție al unei entități rămâne reconstruit din istoricul evenimentelor.

Mutarea unei entități nu modifică prețul de achiziție.

Indicatorii precum profitul, investiția totală și valoarea stocului sunt proiecții calculate.

---

## D-034 — Cost derivat pe entitate

**Categorie:** Financiar / Performance  
**Status:** Înghețată conceptual

Pentru acces rapid, motorul poate menține pe entitate informații financiare derivate, precum costul de achiziție și data achiziției.

Aceste valori nu sunt editate manual.

Sursa lor rămâne istoricul evenimentelor.

---

## D-035 — Relații ca obiecte de prim rang

**Categorie:** Date / Arhitectură  
**Status:** Înghețată

Relațiile sunt componente de prim rang ale modelului.

O relație poate avea:

- entitate sursă;
- tip relație;
- entitate destinație;
- temporalitate;
- atribute;
- reguli;
- istoric.

Relațiile nu sunt simple câmpuri text.

---

## D-036 — Relațiile se schimbă prin evenimente

**Categorie:** Date  
**Status:** Înghețată

O relație nu este modificată direct ca adevăr istoric.

Crearea, modificarea sau închiderea unei relații este reprezentată prin evenimente.

Astfel se păstrează istoricul complet.

---

## D-037 — Domenii ca module de cunoaștere

**Categorie:** AI / Extensibilitate  
**Status:** Înghețată

Domeniile specifice sunt module de cunoaștere/configurare, nu logică hardcodată în motor.

AI-ul poate deduce din conversație domeniul relevant și poate încărca dinamic cunoștințele necesare.

Exemplu:

o conversație poate începe despre plante și poate introduce ulterior acvarii, fără schimbarea manuală a modului aplicației.

Dacă domeniul nu este suficient de clar, AI-ul întreabă.

---

## D-038 — Context conversațional

**Categorie:** AI / UX  
**Status:** Înghețată

Contextul conversațional activ este temporar.

După 30 de minute de inactivitate, contextul activ expiră.

Dacă utilizatorul continuă conversația, perioada activă se prelungește.

Expirarea contextului conversațional nu afectează memoria permanentă, entitățile sau istoricul.

---

## D-039 — Contextul nu poate contrazice datele

**Categorie:** AI / Motor  
**Status:** Înghețată

AI-ul poate folosi contextul pentru a completa informații lipsă doar atunci când există o singură interpretare plauzibilă.

Contextul nu poate contrazice datele validate existente.

Dacă apar două interpretări plauzibile, sistemul cere clarificarea minimă.

---

## D-040 — Ordinea deciziei

**Categorie:** AI / Motor  
**Status:** Înghețată

Motorul urmează conceptual următoarea ordine:

1. informație explicită de la utilizator;
2. reguli explicite;
3. context relevant;
4. date istorice și relații;
5. deducție;
6. întrebare către utilizator, dacă este încă necesar.

Sistemul nu face deducții împotriva datelor existente.

---

## D-041 — Clarificare minimă

**Categorie:** AI / UX  
**Status:** Înghețată

AI-ul pune întrebări numai atunci când informația lipsă împiedică o interpretare unică și corectă.

Întrebarea trebuie să fie:

- scurtă;
- directă;
- limitată la informația lipsă;
- cu opțiuni atunci când acestea sunt cunoscute.

Nu se cer informații care nu sunt necesare pentru operația curentă.

---

## D-042 — AI nu modifică modelul în tăcere

**Categorie:** AI / Arhitectură  
**Status:** Înghețată

Dacă AI-ul identifică faptul că modelul nu conține o structură necesară, poate propune o extensie.

Nu modifică în tăcere schema conceptuală sau definițiile domeniului.

Extensiile de model trebuie validate separat.

---

## D-043 — Audit

**Categorie:** Date / Securitate  
**Status:** Înghețată

Sistemul păstrează:

- cine a produs modificarea;
- când;
- ce s-a schimbat;
- sursa;
- istoricul;
- legătura cu evenimentul sau intenția.

Corecția nu distruge adevărul istoric.

---

## D-044 — Corecții prin evenimente noi

**Categorie:** Date / Audit  
**Status:** Înghețată

O greșeală nu este eliminată prin rescrierea ist
