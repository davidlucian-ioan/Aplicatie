# Collector Cloud API

Backend Node.js separat pentru aplicația mobilă. Acest serviciu este o bază de deploy, nu este încă publicat și nu trebuie expus fără configurarea autentificării și a variabilelor de mediu.

## Endpoint-uri

- `GET /health` — health check public, fără date personale.
- `GET /api/ai/status` — necesită `Authorization: Bearer <Supabase access token>`; raportează dacă ștergerea contului este activată.
- `DELETE /api/account` — șterge utilizatorul Supabase autentificat; cere cheia administrativă server-side.
- `POST /api/ai/interpret` — necesită sesiune Supabase validă; primește text și context minimizat, apoi apelează OpenAI server-side.

## Variabile de mediu

- `PORT` — implicit 8080.
- `SUPABASE_URL` — URL-ul proiectului Supabase.
- `SUPABASE_ANON_KEY` — cheia publică anon a proiectului; folosită doar pentru validarea tokenului.
- `SUPABASE_SERVICE_ROLE_KEY` — secret administrativ server-side, necesar pentru ștergerea contului; nu se introduce niciodată în aplicație.
- `OPENAI_API_KEY` — secret server-side. Nu se introduce în aplicația mobilă.
- `OPENAI_MODEL` — implicit `gpt-6.2-sol`.
- `COLLECTOR_ALLOWED_ORIGINS` — listă separată prin virgulă, de ex. `capacitor://localhost,https://localhost,https://app.example.com`.

## Siguranță

- Tokenul Supabase este validat cu endpoint-ul Auth `/auth/v1/user`.
- AI endpoints cer utilizator autentificat; nu există cheie partajată în bundle.
- CORS allowlist, limită 128 KB, text maxim 8.000 caractere și rate limit 20 cereri/minut/utilizator.
- Contextul este trecut prin allowlist-ul `safeContext`.
- Răspunsurile sunt `no-store`; jurnalul operațional și audio nu sunt trimise la OpenAI.
- API key OpenAI nu este returnată clientului și nu este logată.

## Limitări / integrare rămasă

- Nu există încă proiect Supabase configurat, autentificare în aplicație, sesiune bearer în client sau endpoint public deployat.
- `COLLECTOR_API_BASE_URL` este injectat în build-ul mobil din variabila GitHub Actions `vars.COLLECTOR_API_BASE_URL`. Până la configurarea backend-ului, AI cloud rămâne dezactivat în aplicația mobilă; funcțiile locale continuă să funcționeze.
- Sync multi-device, workspace membership, billing/entitlements și backup nu sunt implementate încă. Ștergerea contului Supabase este implementată, dar trebuie configurată cheia administrativă și testată pe un proiect real.
- Alege/deployează un host Node 22 și setează variabilele de mediu înainte de a activa endpoint-ul în build-urile store.

## Local

```bash
npm test
npm start
```

Container build din rădăcina repository-ului:

```bash
docker build -f cloud-api/Dockerfile -t collector-cloud-api .
```
