Registrul deciziilor

D-001 — Aplicație universală

Categorie: Product
Status: Înghețată

Aplicația este proiectată pentru orice domeniu sau colecție de informații, nu pentru un singur domeniu.

Motiv: permite extinderea fără modificarea motorului pentru fiecare domeniu nou.

---

D-002 — Asistent AI cu memorie

Categorie: AI / Product
Status: Înghețată

Aplicația este un asistent personal cu memorie, nu doar un jurnal sau chatbot.

---

D-003 — Voice-first

Categorie: UX
Status: Înghețată

Interacțiunea vocală este metoda principală de introducere a informațiilor.

Utilizatorul nu trebuie să completeze formulare pentru operațiunile uzuale.

---

D-004 — Motor unic

Categorie: Arhitectură
Status: Înghețată

Toate intrările trec prin același flux:

Intrare → Înțelegere → Validare → Procesare → Actualizare → Răspuns

---

D-005 — Separarea responsabilităților

Categorie: Arhitectură
Status: Înghețată

AI-ul propune → Motorul decide și persistă → Interfața prezintă.

AI-ul nu scrie direct în baza de date.

---

D-006 — Istoricul este sursa adevărului

Categorie: Date / Arhitectură
Status: Înghețată

Evenimentele reprezintă sursa primară a adevărului.

Starea curentă este o proiecție derivată din evenimente.

---

D-007 — Model hibrid de stocare

Categorie: Date / Arhitectură
Status: Înghețată

Se folosește un model hibrid:

- evenimentele păstrează istoricul;
- proiecțiile de stare sunt persistate pentru acces rapid;
- corecțiile se fac prin evenimente noi.

---

D-008 — Proiecții sincronizate

Categorie: Performance / Date
Status: Înghețată pentru V1

Proiecțiile de stare sunt actualizate sincron după procesarea unui eveniment.

Dacă volumul sau performanța impun acest lucru, arhitectura poate evolua ulterior către procesare asincronă.

---

D-009 — PostgreSQL

Categorie: Arhitectură / Date
Status: Înghețată pentru V1

PostgreSQL este baza de date principală pentru V1.

Arhitectura trebuie să permită introducerea ulterioară a unei componente graf dacă scenariile reale justifică acest lucru.

---

D-010 — Relații universale

Categorie: Date
Status: Înghețată

Relațiile sunt modelate printr-un mecanism universal, cu ID propriu.

O relație poate avea:

- entitatea sursă;
- tipul relației;
- entitatea destinație;
- perioada de valabilitate;
- sursa;
- nivelul de încredere;
- evenimentul care a creat sau închis relația.

Relațiile nu sunt modificate direct; schimbările lor sunt reprezentate prin evenimente.

Modelul este conceput astfel încât relațiile să poată evolua ulterior către entități de sine stătătoare.

---

D-011 — Entitate universală

Categorie: Date / Extensibilitate
Status: Înghețată

Există un model universal de entitate.

Tipurile de entități sunt definite în sistem și nu sunt hardcodate în motor.

Fiecare tip poate defini:

- atribute;
- relații permise;
- reguli de validare.

Motorul generic nu conține logică specifică unui domeniu.

---

D-012 — Context AI construit separat

Categorie: AI / Arhitectură
Status: Înghețată

AI-ul primește doar contextul relevant pentru cererea curentă.

Contextul este construit de un modul determinist al aplicației.

AI-ul nu decide singur ce date din baza de date trebuie să primească.

Există un contract de context stabil între motor și AI, independent de furnizorul sau modelul AI utilizat.

---

D-013 — Nivel de încredere

Categorie: AI / Date
Status: Înghețată

Evenimentele și informațiile extrase pot avea un nivel de încredere.

Nivelurile sunt:

- Înalt — poate executa;
- Mediu — cere o clarificare scurtă;
- Jos — nu ghicește și nu persistă informația nesigură.

---

D-014 — Versionare

Categorie: Arhitectură / Date
Status: Înghețată

Tipurile de entități, atributele și regulile sunt versionate.

Modificarea definiției unui tip nu trebuie să facă datele istorice imposibil de interpretat.

---

D-015 — Motor de reguli declarative

Categorie: Arhitectură
Status: Înghețată

Regulile de business sunt declarative și sunt executate de un motor de reguli.

Regulile sunt împărțite conceptual în:

- validare;
- derivare de stare;
- automatizări.

Logica specifică domeniului nu este hardcodată în motorul generic.

---

D-016 — Offline

Categorie: Offline / Sync
Status: Înghețată

Funcțiile de bază trebuie să funcționeze fără internet.

Sincronizarea se face automat când conexiunea revine.

AI-ul este împărțit conceptual în:

- AI local;
- AI cloud.

Tranziția trebuie să fie cât mai transparentă pentru utilizator.
