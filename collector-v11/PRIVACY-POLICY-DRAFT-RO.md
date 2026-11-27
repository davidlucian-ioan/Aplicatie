# Politica de confidențialitate Collector — DRAFT INTERN

**Acest document NU este gata de publicare.** Trebuie completat și verificat de operator și de un jurist înainte de a fi pus în store sau pe un site public. Nu înlocuiește consultanța juridică.

Data draftului: 25 noiembrie 2026  
Versiunea aplicației: Collector v0.11 / PR #55

## 1. Operatorul datelor

Operator: **[DENUMIREA LEGALĂ COMPLETĂ]**  
Formă juridică / CUI / număr registru: **[DE COMPLETAT]**  
Adresă: **[DE COMPLETAT]**  
Contact confidențialitate: **[EMAIL OFICIAL]**  
Responsabil cu protecția datelor, dacă este desemnat: **[DATE DE CONTACT / NU SE APLICĂ — DE CONFIRMAT]**

Nu publica această politică până când aceste informații nu sunt completate și rolul de operator/împuterniciți nu este verificat.

## 2. Ce date poate prelucra aplicația

### Date păstrate local pe dispozitiv
În funcție de utilizarea aplicației, Collector poate păstra: entități și denumiri definite de utilizator, atribute și măsurători, relații și locații, evenimente și note, cantități/stocuri, înregistrări financiare introduse de utilizator, alarme/reminders și înregistrări audio inițiate explicit.

În build-ul mobil, jurnalul și proiecțiile sunt păstrate în SQLite, iar fișierele audio în spațiul privat al aplicației. În browser sunt folosite Web Storage și IndexedDB. **În configurația de cod inspectată la data draftului, criptarea SQLite at-rest este dezactivată.** Nu declara datele locale ca fiind criptate înainte ca această funcție să fie implementată și validată.

Audio recorder salvează înregistrările local; codul actual nu trimite automat fișierele audio către Cloud API sau OpenAI. Dictarea/transcrierea prin SpeechRecognition este o funcție separată a browserului/OS; furnizorul și locul procesării pot depinde de platformă și trebuie descrise conform testelor și documentației platformei.

### Date pentru cont și servicii cloud (numai când cloud-ul este configurat și activat)
Codul poate prelucra identificatorul contului Supabase, adresa de email asociată, datele de autentificare/sesiune și tokenuri de acces. Serverul verifică tokenul și folosește UUID-ul contului pentru autorizare, entitlement și buget AI.

Când utilizatorul solicită interpretare AI, aplicația trimite textul introdus și un context limitat prin allowlist (identificatori, nume și tipuri de entități, plus definiții de atribute selectate). **Nu se transmite jurnalul complet și nu se încarcă fișierele audio în acest endpoint.** Furnizorul OpenAI procesează cererea prin API-ul server-side. Codul trimite parametrul store=false; acest parametru nu înlocuiește revizuirea termenilor, politicilor de retenție, setărilor și acordurilor aplicabile furnizorului.

### Date de abonament
RevenueCat și Apple App Store / Google Play pot prelucra identificatori tehnici, produsul/planul, platforma de achiziție, starea entitlement-ului, date de expirare/reînnoire și identificatori de eveniment. Plățile sunt gestionate de store; Collector nu primește direct datele complete ale cardului în implementarea inspectată.

## 3. De ce folosim datele

Scopurile implementate/proiectate în cod sunt:
- funcționarea aplicației și păstrarea evidențelor introduse de utilizator;
- autentificarea și păstrarea unei identități recuperabile pentru servicii cloud;
- interpretarea la cerere a textului prin AI și validarea propunerilor prin Core;
- verificarea abonamentului, restaurarea achizițiilor și măsurarea consumului AI;
- securitatea API-ului, prevenirea abuzului și funcționarea serviciului.

Temeiurile juridice GDPR pentru fiecare scop trebuie stabilite și documentate de operator înainte de publicare; nu sunt stabilite definitiv prin acest draft.

## 4. Furnizori și destinatari

Furnizorii prevăzuți de arhitectura actuală sunt:
- Supabase — autentificare și baze de date pentru servicii cloud;
- OpenAI — procesarea textului/contextului trimis pentru interpretare AI;
- RevenueCat — administrarea abonamentelor/entitlement-urilor;
- Apple / Google — distribuție și procesarea plăților prin magazine;
- furnizorul de hosting al Cloud API și furnizorii de infrastructură/monitorizare configurați ulterior.

**Înainte de publicare:** completează denumirile entităților contractante, locațiile/regiunile de hosting, subcontractanții, mecanismele de transfer internațional, acordurile de prelucrare (DPA), retenția și setările de confidențialitate pentru fiecare furnizor. Nu presupune că lista de mai sus certifică un proiect sau un contract live.

## 5. Păstrare și securitate

Datele locale rămân pe dispozitiv până când utilizatorul le șterge prin mecanismele aplicației/sistemului sau dezinstalează aplicația, în limitele platformei. Politica finală trebuie să descrie exact exportul, ștergerea locală, backup-ul dispozitivului și retenția cache-urilor.

Datele cloud sunt păstrate în proiectul Supabase și în sistemele furnizorilor conform configurării și politicilor lor. Perioadele exacte de retenție, backup, loguri și ștergere nu sunt încă stabilite complet; operatorul trebuie să le configureze și să le publice înainte de lansare.

Măsurile tehnice din cod includ HTTPS ca cerință pentru endpoint-ul cloud mobil, validarea tokenului, chei OpenAI și service-role exclusiv server-side, context AI allowlisted, limite de dimensiune/rate, răspunsuri no-store, entitlement și buget AI verificate server-side. Criptarea SQLite at-rest este dezactivată în configurația curentă și trebuie tratată ca risc deschis.

## 6. Drepturile persoanei vizate

În funcție de situație și de legea aplicabilă, persoana poate avea drepturi de acces, rectificare, ștergere, restricționare, opoziție, portabilitate și plângere la autoritatea de supraveghere. Cererile trebuie adresate la [EMAIL OFICIAL]. Completează procedura, termenele și identificarea responsabilului înainte de publicare.

## 7. Ștergerea contului și a abonamentului

Endpoint-ul de ștergere din cod șterge utilizatorul Supabase autentificat. Conform schemei SQL actuale, datele legate prin FK cu ON DELETE CASCADE pot fi șterse, în timp ce evenimentele de billing păstrează evenimentul și pot avea user_id setat la NULL pentru audit/idempotency.

Ștergerea contului cloud **nu șterge automat jurnalul și fișierele locale de pe dispozitiv** și **nu anulează abonamentul din Apple App Store sau Google Play**. Utilizatorul trebuie să gestioneze separat abonamentul în store. Interfața și mesajele finale trebuie să reflecte aceste diferențe fără ambiguitate.

## 8. Copii minori, modificări și contact

Politica finală trebuie să precizeze publicul/limitele de vârstă și fluxul pentru solicitări privind datele minorilor, după analiza juridică. Versiunea finală va include data intrării în vigoare, istoricul modificărilor și un mecanism de notificare a modificărilor materiale.

**Blocante pentru publicare:** completarea identității operatorului și contactului; inventarul complet de date și temeiuri; regiuni și DPA; retenție/loguri/backup; validarea criptării și ștergerii; App Privacy/Data Safety; review juridic.
