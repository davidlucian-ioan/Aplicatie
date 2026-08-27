Scenarii de validare

Acest document verifică dacă arhitectura aplicației poate susține scenarii reale.

Un scenariu validează atât comportamentul produsului, cât și deciziile arhitecturale din spatele lui.

---

S-001 — Documentare simplă

Input:

„Am mutat 5 Fancy Tiger din B1 în B2.”

Așteptări:

- intenția este identificată ca transfer;
- B1 și B2 sunt identificate;
- cantitatea este 5;
- evenimentul este creat;
- sursa este utilizatorul;
- încrederea este ridicată;
- nu este necesară clarificare;
- proiecțiile B1 și B2 sunt actualizate;
- răspunsul este scurt.

Răspuns exemplu:

„Documentat.”

---

S-002 — Informație lipsă

Input:

„Am mutat femela.”

Așteptări:

- AI detectează intenția;
- identifică lipsa unei informații importante;
- nu ghicește;
- nu creează evenimentul;
- pune o singură întrebare.

Exemplu:

„Care femelă?”

---

S-003 — Context conversațional

Input 1:

„B4 are acum 20 Fancy Tiger.”

Input 2:

„Am schimbat și apa.”

Așteptări:

- AI folosește contextul conversației;
- interpretează „apa” ca referindu-se la B4 dacă nu există altă interpretare plauzibilă;
- nu cere inutil repetarea bazinului;
- creează evenimentul corespunzător.

---

S-004 — Transfer complex

Input:

„Am împărțit 10 pui între B2, B4 și B5.”

Așteptări:

- o singură intenție;
- informația este descompusă în evenimente coerente;
- evenimentele rămân legate logic;
- cantitatea totală este verificabilă;
- proiecțiile sunt actualizate corect.

---

S-005 — Crearea unei entități noi

Input:

„Am un bazin nou, îl cheamă B7. Are 60 de litri și substrat Amazonia.”

Așteptări:

- este creată o entitate nouă;
- tipul este identificat ca „Bazin”;
- B7 devine identificator uman;
- volumul și substratul sunt salvate ca atribute;
- informațiile sunt asociate aceleiași entități.

---

S-006 — Atribut temporal

Input:

„B7 are pH 6,4.”

Mai târziu:

„B7 are acum pH 6,8.”

Așteptări:

- ambele valori sunt păstrate în istoric;
- 6,8 devine valoarea curentă;
- utilizatorul poate întreba ulterior:
  „Cum a evoluat pH-ul în B7?”

---

S-007 — Schimbare de locație

Input:

„Am mutat Monstera Mint de pe raftul 2 pe raftul 4.”

Așteptări:

- se creează evenimentul de mutare;
- locația anterioară este păstrată în istoric;
- locația curentă devine raftul 4;
- întrebarea „Unde a fost Monstera Mint?” poate returna raftul 2.

---

S-008 — Întrebare despre starea curentă

Input:

„Câți Fancy Tiger am acum în B2?”

Așteptări:

- AI identifică entitatea și locația;
- motorul interoghează starea curentă;
- răspunsul este scurt;
- dacă datele sunt inconsistente, sistemul nu inventează un rezultat.

---

S-009 — Întrebare despre istoric

Input:

„Când am schimbat ultima dată apa în B4?”

Așteptări:

- este căutat ultimul eveniment relevant;
- se returnează momentul;
- dacă există mai multe tipuri de schimb de apă, sistemul cere clarificare doar dacă este necesar.

---

S-010 — Reminder

Input:

„Peste 3 zile vreau să verific B7.”

Așteptări:

- intenția este identificată ca reminder;
- B7 este identificat;
- data este calculată;
- reminderul este creat;
- reminderul este asociat entității.

Răspuns:

„Reminder setat pentru B7, peste 3 zile.”

---

S-011 — Sugestie automată de reminder

Input:

„Am aplicat tratamentul.”

Așteptări:

Dacă regula domeniului permite o verificare ulterioară, AI poate propune:

„Verificăm peste 7 zile?”

Nu trebuie să înceapă o conversație lungă.

---

S-012 — Document atașat

Input:

Utilizatorul atașează o factură și spune:

„Adaug-o la B7.”

Așteptări:

- factura este păstrată ca atașament;
- este asociată cu B7;
- dacă documentul conține date structurate relevante, acestea pot fi extrase;
- documentul original rămâne disponibil.

---

S-013 — Funcționare offline

Situație:

Utilizatorul nu are internet.

Acțiune:

„Am schimbat apa în B4.”

Așteptări:

- documentarea funcționează;
- evenimentul este salvat local;
- proiecția locală este actualizată;
- utilizatorul primește confirmarea;
- sincronizarea se face când conexiunea revine.

---

S-014 — Conflict la sincronizare

Situație:

Două dispozitive au modificat aceeași informație înainte de sincronizare.

Așteptări:

- evenimentele nu sunt pierdute;
- conflictul este detectat;
- motorul aplică regulile de rezolvare;
- dacă nu poate rezolva automat, utilizatorul este informat.

---

S-015 — Corectarea unei greșeli

Input:

„Am spus B2, dar era B3.”

Așteptări:

- evenimentul inițial nu este șters;
- se creează o corecție;
- istoricul rămâne auditabil;
- proiecția finală reflectă corecția.

---

S-016 — Ambiguitate critică

Input:

„Mută crevetele în B2.”

Există mai mulți creveți posibili.

Așteptări:

- AI nu alege arbitrar;
- nu creează evenimentul;
- cere identificarea crevetelui;
- întrebarea este scurtă.

---

S-017 — Domeniu nou

Situație:

Utilizatorul începe să folosească aplicația pentru o colecție de ceasuri.

Input:

„Am cumpărat un Rolex Submariner în 2026.”

Așteptări:

- sistemul poate crea un nou tip de entitate sau folosi unul existent;
- nu este necesară modificarea motorului;
- informația este documentată;
- pot fi adăugate ulterior atribute specifice.

---

S-018 — Căutare externă

Input:

„Caută pe internet informații despre tratamentul X.”

Așteptări:

- AI identifică intenția de căutare externă;
- folosește serviciul extern corespunzător;
- informațiile găsite sunt separate de datele proprii ale utilizatorului;
- sursele sunt prezentate atunci când este relevant.

---

S-019 — Încredere insuficientă

Input:

„Cred că erau vreo 10 sau 12.”

Așteptări:

- informația nu este tratată ca exactă;
- sistemul nu transformă automat „10 sau 12” în 10 sau 12;
- poate salva incertitudinea dacă modelul de date permite;
- dacă valoarea exactă este necesară, cere clarificare.

---

S-020 — Istoric complet

Întrebare:

„Ce s-a întâmplat cu B2 în ultimele 3 luni?”

Așteptări:

Sistemul poate combina:

- evenimente;
- modificări de atribute;
- schimbări de locație;
- relații;
- atașamente relevante;

și poate construi o cronologie coerentă.

---

Regula scenariilor

Orice decizie arhitecturală importantă trebuie testată prin unul sau mai multe scenarii reale.

Dacă o decizie nu poate susține scenariile relevante fără excepții artificiale, decizia trebuie reevaluată.

## S-021 — Vânzare din populație anonimă

B3 conține 10 Fancy:

- 3 indivizi identificați;
- 7 anonimi.

Input:

„Am vândut 5 Fancy.”

Rezultat:

- 5 anonimi sunt marcați ca vânduți;
- 2 anonimi rămân activi;
- cei 3 indivizi identificați nu sunt afectați.

---

## S-022 — Vânzare cu individ identificat prin atribute

Input:

„Am vândut femela Boa Like cu Spider Legs.”

Sistemul caută indivizii care corespund atributelor.

Dacă există o singură candidată, aceasta este identificată automat.

Dacă există mai multe candidate, sistemul folosește celelalte atribute disponibile pentru eliminare.

Dacă ambiguitatea persistă, pune o singură întrebare.

---

## S-023 — Vânzare mixtă

Input:

„Am vândut femela Boa Like și încă 4 Fancy.”

Evenimentul reprezintă o singură intenție și poate conține mai multe operații interne.

- individul identificat este vândut;
- cantitatea rămasă este consumată din anonimi;
- toate efectele sunt aplicate atomic.

---

## S-024 — Vânzare care depășește cantitatea disponibilă

Dacă B3 are doar 3 Fancy activi:

„Am vândut 5 Fancy.”

Operația este respinsă integral.

Sistemul nu permite sold negativ și nu aplică parțial vânzarea.

---

## S-025 — Conflict de locație

FT-001 este în B8.

Input:

„Am vândut 5 Fancy din B3, inclusiv FT-001.”

Motorul detectează conflictul dintre locația cunoscută și afirmația utilizatorului.

Operația nu este executată până la clarificare.

---

## S-026 — Rafinare ulterioară

Inițial:

Fancy → B3 → 5

Ulterior:

„Femela Boa Like cu Spider Legs este unul dintre Fancy din B3.”

Sistemul poate rafina datele existente și identifica individul fără să rescrie istoricul inițial.
