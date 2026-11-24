# Collector — model de costuri și monetizare

Ultima actualizare: 2026-11-24
Stare: propunere de arhitectură și estimare; prețurile comerciale finale NU sunt aprobate.

## 1. Principiul de produs

Utilizatorul cumpără un singur abonament Collector. Nu are nevoie de cont OpenAI și nu introduce chei API. Collector plătește infrastructura și consumul AI din încasările abonamentelor.

Core-ul local-first rămâne funcțional fără abonament și fără internet. Abonamentul deblochează servicii cloud și capacități AI, nu dreptul de a-și accesa datele locale.

AI rămâne asistiv: interpretează și propune; Core validează; utilizatorul confirmă. Nici monetizarea, nici optimizarea costurilor nu schimbă această limită de siguranță.

## 2. Auditul implementării existente

### Deja implementat în branch-ul feature/openai-provider-integration
- Core local și fluxurile Work/Think; stocare locală prin StorageAdapter și SQLite nativ.
- Înregistrare audio locală, fișiere private și metadate locale; nu există upload implicit al înregistrărilor audio către cloud.
- Supabase Auth anonim, sesiune securizată și funcții pentru asocierea contului existent cu email/parolă și autentificare ulterioară; ID-ul Supabase este folosit ca identificator stabil în RevenueCat.
- Cloud API Node/Docker separat; validează tokenul Supabase înainte de operațiile private.
- Provider OpenAI server-side; cheia API nu intră în aplicația mobilă.
- Context AI minimizat prin allowlist; jurnalul complet și fișierele audio nu sunt trimise către OpenAI.
- Limită de corp/text, rate limit temporar, CORS allowlist, răspunsuri no-store și ștergere cont cloud.
- RevenueCat Capacitor SDK 14.1.2 integrat în build-ul mobil; UI pentru oferte, achiziție, restore și verificare status; cheile publice per platformă sunt injectate la build.
- Webhook RevenueCat autentificat, allowlist de product IDs și procesare idempotentă a evenimentelor cu protecție împotriva evenimentelor întârziate.
- Migrare SQL pentru entitlements, bugete AI, usage și evenimente de billing; RPC-uri tranzacționale pentru rezervarea/regularizarea bugetului și actualizarea entitlement-ului.
- Endpoint-ul AI verifică Pro și bugetul lunar înainte de apelul OpenAI; după răspuns înregistrează tokenii și costul calculat. Status-ul poate expune quota lunară.
- Android launchMode pentru flow-ul de achiziție și In-App Purchase capability iOS configurate în scriptul nativ.

### Încă lipsesc pentru activare comercială reală
- Proiect Supabase real; migrarea cloud-api/migrations/001_billing_and_ai_usage.sql nu a fost aplicată într-un proiect live.
- Deploy HTTPS al Cloud API și configurarea secretelor de producție.
- Cont RevenueCat real, produse create în App Store Connect/Google Play, entitlement pro, offering curent, webhook URL și cheile publice de aplicație. Integrarea din cod nu a fost încă testată cu tranzacții sandbox reale.
- Variabilele de server REVENUECAT_WEBHOOK_AUTHORIZATION, REVENUECAT_PRO_PRODUCT_IDS, AI_MONTHLY_BUDGET_USD și tarifele OpenAI trebuie configurate în host.
- Teste reale de achiziție, reînnoire, anulare, refund, restore și confirmare email pe Android/iOS.
- Sync multi-device, backup cloud, workspaces/tenant isolation și reconcilierea modificărilor offline nu sunt implementate.
- Rate limit-ul de 20/minut rămâne în memorie și este doar protecție suplimentară; bugetul lunar persistent devine activ numai după aplicarea migrării SQL.
- Conturile recuperabile prin email/parolă sunt implementate, dar email confirmation/password reset și politica de recuperare trebuie configurate și testate în Supabase.

Concluzie: codul de bază pentru entitlement, billing webhook și metering AI există acum în branch, dar nu trebuie activat pentru utilizatori reali până când migrarea este aplicată, proiectele externe sunt configurate și achizițiile sandbox sunt validate.
## 3. Estimare de cost

Prețuri publice consultate la 2026-11-24; pot varia în timp și în funcție de regiune/consum.

### Costuri fixe de pornire
- Render Web Service Starter: aproximativ 7 USD/lună pentru un API mic.
- Supabase Pro: 25 USD/lună; include 10 USD compute credits și backup zilnic cu retenție de 7 zile. Un proiect Free poate fi folosit pentru dezvoltare/alpha, dar proiectele Free pot fi puse în pauză după o săptămână de inactivitate și nu oferă backup automat.
- Total orientativ de producție la început: aproximativ 32 USD/lună, înainte de stocare/egress suplimentar, domeniu, loguri și creștere de capacitate.
- Domeniu: buget separat, anual; nu este inclus în cei 32 USD.
- Google Play Console: 25 USD o singură dată.
- Apple Developer Program: 99 USD/an.

### AI — ipoteze de calcul
Modelul curent implicit în cod este gpt-6.2-sol. Tariful standard consultat: 2 USD / 1M tokeni input și 10 USD / 1M tokeni output. Costul real se măsoară din usage-ul returnat de API, nu se estimează definitiv doar din numărul de caractere.

Scenarii orientative:
- 2.000 input + 500 output tokeni: ~0,009 USD/cerere.
- 3.000 input + 700 output tokeni: ~0,013 USD/cerere.
- 5.000 input + 1.000 output tokeni: ~0,020 USD/cerere.

Cost AI lunar per utilizator, la ipoteza de 3.000 input + 700 output:
- 10 cereri: ~0,13 USD.
- 25 cereri: ~0,33 USD.
- 50 cereri: ~0,65 USD.
- 100 cereri: ~1,30 USD.
- 200 cereri: ~2,60 USD.

Intervalul pentru 100 de cereri, în cele trei scenarii de mai sus: aproximativ 0,90–2,00 USD/utilizator/lună. Costul crește liniar cu utilizarea și poate fi mai mare dacă se trimit contexte mari sau răspunsuri lungi.

### Scenarii agregate
- 100 utilizatori Pro × 25 cereri/lună: AI ~33 USD + infrastructură ~32 USD = ~65 USD/lună.
- 100 utilizatori Pro × 50 cereri/lună: AI ~65 USD + infrastructură ~32 USD = ~97 USD/lună.
- 1.000 utilizatori Pro × 25 cereri/lună: AI ~325 USD + infrastructură inițială ~32 USD = ~357 USD/lună, dar serverul și baza de date vor trebui reevaluate/posibil scalate.
- 1.000 utilizatori Pro × 100 cereri/lună: AI ~1.300 USD + infrastructură inițială ~32 USD = ~1.332 USD/lună, înainte de scalare.

Acestea sunt estimări de bază pentru API text. Nu includ audio cloud/live, suport, taxe, TVA, refund-uri, comisioane de store, marketing, costuri legale sau scalare. În prezent înregistrarea audio este locală, iar recunoașterea vocală on-device trebuie păstrată local unde este posibil.

## 4. Reducerea costurilor fără afectarea integrității

Măsuri recomandate:
1. Local-first real: Core, SQLite, audio și reminder-ele continuă local; cloud-ul nu devine necesar pentru funcțiile fundamentale.
2. AI numai la cerere: apelul OpenAI se face numai după acțiunea explicită a utilizatorului; nu trimitem în cloud fiecare înregistrare sau fiecare modificare.
3. Context minim: păstrăm safeContext și allowlist-ul existent; nu trimitem jurnalul complet, fișiere audio sau toate evenimentele.
4. Limite pe tokeni: păstrăm limita de output și adăugăm buget de input/output măsurat; limită de cereri singură nu este suficientă.
5. Model economic pentru sarcini uzuale: benchmark pe un model mai ieftin pentru interpretări simple; fallback la model mai capabil doar când scorul de încredere/ambiguitatea o justifică. Schimbarea se aprobă numai după testele contractuale, replay și setul de cazuri de regresie.
6. Cache numai pentru conținut sigur și repetabil: cache pentru prompturi statice/schema sau rezultate non-personale; nu reutilizăm răspunsuri personalizate între utilizatori și nu folosim cache care poate produce date vechi pentru comenzi operaționale.
7. Fără audio cloud implicit: păstrăm înregistrarea și STT on-device; orice funcție cloud audio viitoare trebuie să fie explicită și tarifată separat în buget.
8. Spend caps și alerte: plafon de cheltuieli OpenAI, alerte la 50/75/90%, buget per utilizator și oprire controlată a AI la depășire; funcțiile Core rămân disponibile.
9. Nu economisim prin eliminarea securității: nu expunem cheia OpenAI, nu renunțăm la validarea Core, confirmarea utilizatorului, backup-urile necesare sau izolarea datelor.

## 5. Model comercial propus pentru discuție

### Collector Free
- Work și Think de bază.
- Core local, SQLite, înregistrări audio locale și notificări locale.
- Datele locale rămân accesibile fără abonament și fără internet.
- Fără AI cloud inclus sau doar o mostră mică, controlată.
- Export local disponibil; nu blocăm exportul datelor utilizatorului.

### Collector Pro
- AI inclus într-un plafon lunar măsurat în tokeni/cost, afișat utilizatorului ca un număr simplu de solicitări orientative.
- Cloud backup/sync după ce acestea sunt implementate și testate.
- Funcții Think avansate și funcții premium viitoare.
- Quota inițială de test recomandată: echivalentul a 25–50 interpretări standard/lună; nu este o promisiune finală și trebuie recalibrată după usage real.
- Oferim avertizare la 80% și 100%; la atingerea plafonului, AI se oprește până la resetare sau upgrade, dar Work/Think local continuă.

Preț de testat în cercetarea de piață: 4,99 EUR/lună și 39,99 EUR/an. Nu este preț aprobat. Trebuie validat după TVA, comisioane, costuri reale și feedback de utilizatori.

## 6. Billing și corelarea tehnică

**Stare în cod:** backend-ul și clientul mobil pentru RevenueCat sunt implementate în branch, dar nu sunt conectate încă la conturi reale și nu au fost validate cu tranzacții sandbox.

- Client mobil: @revenuecat/purchases-capacitor@14.1.2; configurează SDK-ul cu UUID-ul Supabase, încarcă offering-ul curent, afișează prețurile localizate, permite purchase și restore.
- Identitate: utilizatorul poate asocia contul Supabase anonim cu email/parolă sau se poate autentifica ulterior; RevenueCat primește același Supabase user ID.
- Webhook: POST /api/billing/revenuecat-webhook, protejat prin Authorization secret, product ID allowlist și event ID idempotent. Evenimentele întârziate nu pot suprascrie o stare mai nouă.
- Entitlement: collector_entitlements; funcția collector_apply_revenuecat_event actualizează Pro/Free pe baza evenimentelor și expirării.
- Usage: collector_ai_budgets și collector_ai_usage; collector_reserve_ai_usage rezervă bugetul atomic înainte de apelul OpenAI, iar collector_settle_ai_usage înregistrează tokenii și costul după răspuns.
- Serverul refuză AI dacă entitlement-ul Pro nu este activ sau bugetul lunar este epuizat. Funcțiile Core locale rămân disponibile.
- GET /api/ai/status verifică entitlement-ul și returnează utilizarea lunară pentru afișarea cotei în aplicație.

### Ce trebuie făcut în conturile externe
1. Creează proiect Supabase și activează anonymous sign-in; aplică migrarea cloud-api/migrations/001_billing_and_ai_usage.sql.
2. Creează proiect RevenueCat și aplicațiile iOS/Android; configurează produse lunare/anuale și entitlement exact pro, apoi un offering curent.
3. Configurează webhook-ul RevenueCat către /api/billing/revenuecat-webhook, cu același secret în REVENUECAT_WEBHOOK_AUTHORIZATION.
4. Configurează REVENUECAT_PRO_PRODUCT_IDS cu exact product IDs create în magazine.
5. Setează variabilele GitHub Actions COLLECTOR_REVENUECAT_APPLE_API_KEY și COLLECTOR_REVENUECAT_GOOGLE_API_KEY; acestea sunt chei publice SDK, nu secrete server-side.
6. În host configurează SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY, OPENAI_MODEL, REVENUECAT_WEBHOOK_AUTHORIZATION, REVENUECAT_PRO_PRODUCT_IDS, AI_MONTHLY_BUDGET_USD și tarifele modelului.
7. Testează în sandbox achiziție, restore, reînnoire, anulare, refund și expirare pe ambele platforme.

Nu lega Core de RevenueCat. Core nu trebuie să cunoască Apple, Google sau furnizorul billing; UI folosește SDK-ul pentru cumpărare, iar serverul este autoritatea pentru entitlement și buget AI.
## 7. Comisioane și costuri de publicare

- Google Play: pentru abonamentele auto-reînnoibile în EEA, regulile publicate pentru rollout-ul din 30 iunie 2026 indică 10% service fee + 5% billing fee pentru tranzacțiile cu Google Play Billing; trebuie reverificat în Play Console înainte de lansare.
- Apple App Store în UE: comisionul depinde de programul și ruta de plată aplicabile. Apple publică 15% pentru participanții eligibili la Small Business Program și pentru abonamente auto-renewable după primul an; alte condiții pot conduce la comisioane diferite.
- RevenueCat: gratuit până la 2.500 USD MTR, apoi 1% MTR conform paginii consultate.
- Google Play Console: 25 USD o singură dată.
- Apple Developer Program: 99 USD/an.

Nu presupune un comision universal de 15% pentru toate situațiile. Confirmă termenii curenți și eligibilitatea contului înainte de stabilirea prețului final.

## 8. Etape recomandate

1. Înainte de billing: proiect Supabase, identitate recuperabilă, cloud deploy, sync/backup și politici de retenție.
2. Implementare EntitlementProvider/adapter în aplicație și SubscriptionService pe server.
3. Integrare RevenueCat SDK + webhook; teste sandbox Android/iOS pentru achiziție, restore, expirare, refund și cont schimbat.
4. Implementare usage metering persistent, buget AI și limite pe tokeni înainte de activarea AI pentru public.
5. Instrumentare cost per request/per user/per model și dashboard de marjă brută.
6. Pilot închis cu utilizatori reali; calibrare quota și preț numai pe date observate.
7. Abia apoi publicare și achiziție hosting de producție.

## Surse de preț verificate la 2026-11-24
- OpenAI API pricing: https://developers.openai.com/api/docs/pricing
- Supabase pricing: https://supabase.com/pricing
- Render pricing: https://render.com/pricing
- RevenueCat pricing: https://www.revenuecat.com/pricing
- Google Play service fees: https://support.google.com/googleplay/android-developer/answer/112622
- Apple EU App Store payment options: https://developer.apple.com/support/payment-options-on-the-app-store
- Google Play Console registration: https://support.google.com/googleplay/android-developer/answer/6112435
- Apple Developer Program: https://developer.apple.com/programs/
