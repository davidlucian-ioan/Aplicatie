# Collector Cloud API

Backend Node.js separat pentru aplicația mobilă. API-ul nu trebuie expus public înainte de aplicarea migrărilor Supabase și configurarea secretelor de producție.

## Endpoint-uri

- `GET /health` — health check public, fără date personale.
- `GET /api/ai/status` — necesită token Supabase; returnează starea providerului, entitlement-ul Pro verificat server-side și disponibilitatea AI pentru utilizator.
- `POST /api/ai/interpret` — necesită sesiune Supabase validă, entitlement Pro activ și buget lunar disponibil; rezervă bugetul înainte de OpenAI și regularizează consumul după răspuns.
- `POST /api/billing/revenuecat-webhook` — webhook RevenueCat autentificat cu secret; evenimentele sunt persistate idempotent.
- `DELETE /api/account` — șterge utilizatorul Supabase autentificat; cere cheia administrativă server-side.

## Variabile de mediu

Obligatorii pentru AI și billing:
- `SUPABASE_URL` — URL-ul proiectului Supabase.
- `SUPABASE_ANON_KEY` — cheia publică anon; folosită la validarea tokenului.
- `SUPABASE_SERVICE_ROLE_KEY` — secret administrativ server-side, folosit pentru metering, entitlements, webhook și ștergerea contului. Nu se introduce în aplicație.
- `OPENAI_API_KEY` — secret OpenAI server-side.
- `REVENUECAT_WEBHOOK_AUTHORIZATION` — valoarea exactă a headerului Authorization configurat în webhook-ul RevenueCat.
- `REVENUECAT_PRO_PRODUCT_IDS` — lista separată prin virgulă a product ID-urilor care acordă Collector Pro. Nu acceptăm automat orice produs din RevenueCat.
- `AI_MONTHLY_BUDGET_USD` — buget maxim AI inclus per utilizator/lună; implicit 1 USD.
- `OPENAI_INPUT_USD_PER_MILLION` și `OPENAI_OUTPUT_USD_PER_MILLION` — tarifele modelului configurat, exprimate în USD per milion tokeni; defaulturile sunt 2 și 10 și trebuie sincronizate cu tariful real al modelului.

Alte variabile:
- `PORT` — implicit 8080.
- `OPENAI_MODEL` — implicit `gpt-6.2-sol`.
- `COLLECTOR_ALLOWED_ORIGINS` — listă separată prin virgulă, de ex. `capacitor://localhost,https://localhost,https://app.example.com`.

## Configurare Supabase — obligatoriu înainte de deploy

1. Aplică manual sau prin pipeline migrarea `migrations/001_billing_and_ai_usage.sql` în proiectul Supabase.
2. Migrarea creează tabelele `collector_entitlements`, `collector_ai_budgets`, `collector_ai_usage` și `collector_billing_events`.
3. RPC-urile `collector_reserve_ai_usage`, `collector_settle_ai_usage` și `collector_apply_revenuecat_event` folosesc tranzacții/lock-uri pentru rezervarea atomică a bugetului și procesarea idempotentă a webhook-urilor.
4. RLS este activat; accesul clientului anon/authenticated la tabele este revocat. API-ul folosește service-role key exclusiv server-side.
5. Configurează anonymous sign-in în Supabase doar dacă produsul încă folosește conturi anonime. Pentru lansare trebuie implementată și testată asocierea contului la o identitate recuperabilă.

## Configurare RevenueCat

1. Creează produsele lunare/anuale în App Store Connect și Google Play Console.
2. Configurează entitlement-ul RevenueCat cu numele `pro`.
3. Setează App User ID din SDK la UUID-ul utilizatorului Supabase autentificat; aplicația blochează achiziția până când utilizatorul asociază contul anonim cu email/parolă. Webhook-ul caută UUID-ul și în aliases/original_app_user_id, nu doar în app_user_id.
4. Configurează webhook-ul RevenueCat către `/api/billing/revenuecat-webhook` și aceeași valoare secretă pentru Authorization ca `REVENUECAT_WEBHOOK_AUTHORIZATION`.
5. Setează lista exactă de product IDs în `REVENUECAT_PRO_PRODUCT_IDS`.
6. Testează achiziție, reînnoire, anulare, expirare, refund și restore în sandbox.

Backend-ul tratează achiziția/reînnoirea, schimbarea produsului, reactivarea, anularea până la expirare, billing issue și expirarea/refund-ul. Evenimentele duplicate sunt idempotente. Transferul între conturi este intenționat dezactivat prin Restore Behavior Keep with original App User ID; aliasurile normale sunt rezolvate din webhook. Nu schimba această setare fără implementarea și testarea unui handler TRANSFER.

## Protecție costuri

- AI este refuzat dacă lipsește entitlement-ul Pro activ.
- Bugetul lunar este rezervat atomic înainte de apelul OpenAI; cererile concurente nu pot depăși plafonul printr-un simplu race.
- După răspuns, tokenii raportați de OpenAI și costul estimat sunt salvați. Dacă providerul nu returnează usage, se taxează conservator rezerva calculată.
- La buget epuizat, API răspunde cu `429 monthly_budget_exceeded`; Work/Think și datele locale nu sunt afectate.
- Rate limit-ul de 20 cereri/minut este suplimentar și în memorie; nu înlocuiește bugetul lunar persistent.
- Nu se trimit fișiere audio sau jurnalul complet la OpenAI. Contextul trece prin allowlist-ul `safeContext`.

## Limitări încă deschise

Status-ul AI expune bugetul lunar, suma consumată, suma rezervată și suma rămasă. Defaultul tehnic este 1 USD/utilizator/lună; tarifele input/output și bugetul sunt configurabile în variabilele de mediu. Rezervările abandonate sunt eliberate după 10 minute, iar o regularizare eșuată după un răspuns OpenAI păstrează rezerva pentru a evita subcontorizarea costurilor.

- Migrarea trebuie aplicată într-un proiect Supabase real; nu există încă proiect conectat/deploy.
- Aplicația mobilă include bridge-ul RevenueCat Capacitor 14.1.2, afișarea ofertelor curente, purchase, restore și asocierea/recuperarea contului prin email/parolă. Codul nu este încă validat cu produse și chei reale în sandbox; funcțiile de achiziție rămân dezactivate până la configurarea variabilelor publice din build și a produselor în magazine/RevenueCat.
- Trebuie validate transferul între conturi, recuperarea achizițiilor după reinstalare, confirmarea emailului și comportamentul webhook-urilor reale. Android launchMode este configurat pentru fluxul de achiziție, iar iOS In-App Purchase capability este activată de scriptul nativ.
- Sync multi-device, workspace membership, backup cloud și conflict handling nu sunt implementate.
- Bugetul de 1 USD/lună este default tehnic inițial, nu plan comercial final; recalibrează-l pe baza usage-ului real și a prețului modelului activ. Tarifele input/output se configurează separat pentru a evita calcularea greșită a costului.
- Migrarea SQL trebuie aplicată într-un proiect Supabase real; fără aceasta, status-ul, webhook-ul și metering-ul nu vor funcționa. Setează variabilele build `COLLECTOR_REVENUECAT_APPLE_API_KEY` și `COLLECTOR_REVENUECAT_GOOGLE_API_KEY` (publice) și server `REVENUECAT_WEBHOOK_AUTHORIZATION`, `REVENUECAT_PRO_PRODUCT_IDS`.
- AI status și endpoint-urile trebuie testate cu proiect Supabase, chei, webhook și achiziții sandbox reale înainte de activarea publică.

## Local

```bash
npm test
npm start
```

Container build din rădăcina repository-ului:

```bash
docker build -f cloud-api/Dockerfile -t collector-cloud-api .
```
