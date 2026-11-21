
---

## D-018 — Configurare asistată a atributelor

**Categorie:** AI / UX / Date  
**Status:** Adoptată

La crearea unui atribut, AI-ul propune tipul de date și rolul atributului pe baza intenției exprimate de utilizator.

- Când rolul este evident, aplicația poate completa automat setările cu risc redus.
- Când rolul sau semnificația temporală este ambiguă, aplicația cere o clarificare scurtă.
- Atributele descriptive precum „culoare” nu sunt considerate identificatori în mod implicit.
- Atribute precum „cod” sau „număr de serie” pot fi propuse ca identificatori, dar regula trebuie validată de motor.
- Modificarea unei definiții nu rescrie istoricul existent fără confirmare.
- Un atribut poate fi definit global și apoi atașat unei entități; interfața entității trebuie să permită și crearea/atașarea directă a unui atribut.

AI-ul propune; motorul validează și persistă; interfața face setarea și valoarea vizibile utilizatorului.
