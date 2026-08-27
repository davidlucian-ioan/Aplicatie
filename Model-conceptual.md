Model conceptual

1. Vedere generală

Aplicația este construită în jurul a șase concepte principale:

Entități → Relații → Evenimente → Istoric → Proiecții → Interogare

AI-ul este interfața inteligentă care transformă intenția utilizatorului în operațiuni asupra acestui model.

---

2. Entități

Entitățile reprezintă lucrurile despre care utilizatorul dorește să păstreze informații.

O entitate poate:

- avea atribute;
- avea relații cu alte entități;
- avea evenimente asociate;
- avea atașamente;
- aparține unei locații;
- conține alte entități.

---

3. Relații

Relațiile conectează entitățile.

Exemplu:

Crevete → se află în → B1

sau:

B1 → conține → Crevete

Relațiile pot fi:

- temporale;
- create sau închise prin evenimente;
- evaluate prin nivel de încredere;
- urmărite în audit.

---

4. Evenimente

Evenimentele reprezintă modificările sau acțiunile care au avut loc.

Exemplu:

Transfer: 5 Fancy Tiger din B1 în B2

Evenimentul poate implica mai multe entități și poate produce mai multe efecte asupra stării.

---

5. Istoric

Istoricul este succesiunea evenimentelor relevante.

Exemplu:

B2:

- creat;
- primește 5 creveți;
- schimb de apă;
- primește încă 10 creveți;
- schimbare GH.

Istoricul permite reconstruirea evoluției unei entități.

---

6. Proiecții

Proiecțiile reprezintă starea curentă calculată din evenimente.

Exemplu:

Din evenimentele de transfer rezultă:

B1 = 15 creveți
B2 = 20 creveți

Aceste valori sunt proiecții și pot fi recalculabile din istoric.

---

7. Interogarea

Utilizatorul poate cere informații despre:

- starea curentă;
- istoricul unei entități;
- relații;
- evenimente;
- agregări;
- comparații;
- intervale de timp.

Exemplu:

«„Câți Fancy Tiger am acum în B2?”»

Motorul identifică entitatea și criteriul, consultă proiecția relevantă și returnează rezultatul.

---

8. Fluxul AI

Fluxul principal este:

Voce / Text / Imagine / Document

↓

Detectare intenție

↓

Construire context

↓

Extracție

↓

Validare

↓

Motorul aplicației

↓

Eveniment / Evenimente

↓

Persistență

↓

Actualizare proiecții

↓

Răspuns

---

9. Principiul important

AI-ul nu modifică direct entitățile.

AI-ul produce o propunere structurată.

Motorul verifică dacă propunerea este validă.

Doar motorul poate produce modificarea persistentă.

---

10. Exemplu complet

Utilizator:

«„Am mutat cinci Fancy Tiger din B1 în B2.”»

AI identifică:

- intenție: transfer;
- entitate: Fancy Tiger;
- cantitate: 5;
- origine: B1;
- destinație: B2;
- moment: acum;
- sursă: utilizator;
- încredere: înaltă.

Motorul validează:

- B1 există;
- B2 există;
- există suficienți Fancy Tiger în B1;
- transferul este permis.

Se persistă evenimentul.

Proiecțiile sunt actualizate.

AI răspunde:

«„Documentat.”»

---

11. Principiul de extensibilitate

Modelul nu conține concepte precum „plantă”, „crevete” sau „acvariu” ca reguli fundamentale.

Acestea sunt doar tipuri de entități configurate deasupra motorului universal.

Același motor trebuie să poată procesa:

Plantă → se află în → Seră

și:

Mașină → se află în → Garaj

fără modificarea motorului.

## Granularitate progresivă

Modelul permite pornirea de la informații agregate și rafinarea ulterioară.

Exemplu inițial:

Fancy → B3 → activ → 5

Dacă ulterior sunt identificați indivizi, aceștia pot fi asociați populației existente.

Sistemul nu creează indivizi fictivi doar pentru a satisface modelul.

---

## Cantitate anonimă și indivizi identificați

O populație poate conține simultan:

- indivizi identificați;
- cantitate anonimă.

Exemplu:

Fancy:
- FT-001
- FT-002
- 7 anonimi

Operațiile cantitative pot afecta simultan indivizi identificați și cantitate anonimă.

---

## Regula de selecție

La o operație cantitativă:

1. identificările explicite ale utilizatorului au prioritate;
2. cantitatea rămasă se consumă din cantitatea anonimă;
3. dacă aceasta nu este suficientă, sistemul încearcă identificarea prin atribute;
4. dacă ambiguitatea rămâne, cere clarificarea minimă.

---

## Locație și dispoziție

Starea unei populații într-o locație poate fi reprezentată printr-o proiecție de tip:

**Entitate/Populație + Locație + Dispoziție + Cantitate**

Exemplu:

B3 → Fancy → activ → 5

Un eveniment de vânzare poate produce:

B3 → Fancy → activ → -2  
B3 → Fancy → vândut → +2

Aceste valori sunt derivate din evenimente.
