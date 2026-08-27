Dicționarul aplicației

Entitate

Un lucru despre care aplicația păstrează informații în timp.

Exemple: plantă, acvariu, mașină, proiect, colecție, locație.

Fiecare entitate are un ID intern unic și permanent.

---

Tip de entitate

Definiția unei categorii de entități.

Exemple: „Plantă”, „Acvariu”, „Vehicul”, „Proiect”.

Tipurile sunt configurabile și nu sunt hardcodate în motor.

---

Eveniment

Ceva care s-a întâmplat la un anumit moment.

Exemplu: „5 creveți au fost mutați din B1 în B2.”

Evenimentul este sursa primară a adevărului.

---

Relație

Legătura dintre două sau mai multe entități.

Exemple: „se află în”, „conține”, „aparține”, „derivă din”.

Relațiile pot avea istoric și temporalitate.

---

Atribut

O proprietate a unei entități.

Exemple: nume, greutate, pH, înălțime, valoare.

Atributele pot fi statice sau temporale.

---

Locație

O entitate specializată care reprezintă un loc sau un container.

Exemple: cameră, raft, acvariu, dulap, clădire.

O locație poate conține sau găzdui alte entități.

---

Proiecție

Reprezentarea stării curente calculată din istoricul de evenimente.

Exemplu: numărul actual de creveți din B2.

Proiecția nu este sursa primară a adevărului.

---

Istoric

Totalitatea evenimentelor și modificărilor relevante asociate entităților și relațiilor.

---

Context

Informațiile relevante furnizate AI-ului pentru a interpreta o cerere.

Contextul este construit de aplicație și trebuie să fie minimul necesar pentru sarcina curentă.

---

Intenție

Acțiunea sau scopul pe care utilizatorul încearcă să îl exprime.

Exemple:

- documentare;
- întrebare;
- creare;
- modificare;
- reminder;
- căutare;
- analiză.

---

Sursă

Originea unei informații.

Exemple:

- utilizator;
- AI;
- imagine;
- document;
- import;
- integrare externă.

---

Nivel de încredere

Gradul de certitudine asociat unei interpretări sau informații extrase.

Niveluri:

- înalt;
- mediu;
- jos.

---

Atașament

Un fișier sau element multimedia asociat unei entități sau unui eveniment.

Exemple:

- fotografie;
- PDF;
- factură;
- înregistrare vocală;
- document.

Atașamentul poate furniza context sau poate fi sursa unor date structurate extrase.

---

Regulă

O definiție declarativă care stabilește cum trebuie validată, derivată sau automatizată o anumită operațiune.

---

Motorul aplicației

Componenta care aplică regulile, validează operațiunile și persistă datele.

---

AI

Componenta care interpretează limbajul natural, construiește propuneri, extrage informații și explică rezultate.

AI-ul nu este sursa adevărului și nu persistă direct date.

---

Proiecție sincronă

O proiecție actualizată imediat după persistarea unui eveniment valid.

---

Audit

Istoricul modificărilor efectuate asupra datelor și configurației.

Trebuie să permită identificarea sursei, momentului și naturii modificării.


## Grup / Populație

O reprezentare a unui grup de entități de același tip, care poate exista fără identificarea individuală a membrilor.

Exemplu:

Fancy → B3 → 5

Un grup poate fi ulterior rafinat prin identificarea unor indivizi.

---

## Cantitate anonimă

Cantitatea unei populații pentru care membrii individuali nu sunt identificați.

Exemplu:

Fancy → B3 → 5 anonimi

Cantitatea anonimă poate fi consumată prin operații precum vânzare, transfer sau pierdere.

---

## Dispoziție

Starea unei cantități sau entități în raport cu deținerea sau disponibilitatea.

Exemple:

- activ;
- vândut;
- donat;
- decedat;
- pierdut;
- returnat.

Lista este extensibilă.

---

## Certainty

Gradul de certitudine al informației în lumea reală.

Este diferit de confidence-ul AI-ului.

O informație poate fi păstrată ca incertă fără a fi transformată într-o valoare exactă.

---

## Confidence

Gradul de încredere al AI-ului în interpretarea unei intenții sau informații.

Este folosit în procesul de decizie și validare și nu reprezintă automat adevărul evenimentului.

---

## Eveniment compus

Un eveniment logic rezultat dintr-o singură intenție a utilizatorului și care poate conține mai multe operații interne.

Exemplu:

„Mută femela Boa Like și încă 4 Fancy în B8.”

---

## Proiecție

Reprezentarea derivată a stării curente.

Exemple:

- sold pe locație;
- cantitate activă;
- cost derivat;
- statistici;
- agregări.

Proiecția nu este sursa primară a adevărului.
