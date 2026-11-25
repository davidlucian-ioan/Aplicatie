# Collector — checklist de pregătire pentru lansare

Ultima verificare: 25 noiembrie 2026  
Branch de lucru: feature/openai-provider-integration · PR #55 (draft)

Scop: diferențiază codul implementat, CI automat și validarea externă/fizică. Un build verde nu înseamnă aprobarea pentru publicare.

## Starea actuală

| Domeniu | Stare verificată | Gate pentru lansare |
|---|---|---|
| Core local-first | Implementat; suita existentă rulează în CI | CI complet verde pe HEAD final |
| Work / Think | Ecrane distincte; Work include recorder, alarme și captură text/vocală | Acceptanță manuală și usability pe telefoane |
| Recorder | AAC nativ + Filesystem/SQLite metadata; fallback web cu checkpoint-uri IndexedDB | Teste reale de întrerupere, background, playback și quota |
| Notificări | Local Notifications native, snooze/cancel și rollback logic | Restart, Doze, Focus și permisiuni pe Android/iOS reale |
| Stocare mobilă | SQLite nativ, migrare legacy v7; criptarea at-rest este dezactivată | Decizie și implementare criptare/migrare fără pierderi |
| AI cloud | Endpoint server-side, context allowlisted, Core preview/confirm | Supabase real, HTTPS deploy, secrete, e2e și spend caps |
| Billing | RevenueCat client + webhook/entitlement/meters SQL în cod | Sandbox store tests și webhook pe proiect real |
| Sincronizare | Nu este implementată | Nu promite sync/backup multi-device |
| Pachete native | Versiuni directe pin-uite în workflow; package-lock nu conține toolchain-ul complet | Lockfile reproductibil pentru toolchain mobil |
| Distribuție | CI produce APK debug și iOS Simulator app, nu pachete semnate | AAB/IPA/archive semnate, provisioning și store upload |
| Legal / privacy | Drafturi interne pregătite | Completare operator/furnizori/contact/retention + revizuire juridică |
| Store listing | Necompletat | Icon, screenshots, descrieri, age rating, App Privacy/Data Safety |
| Suport / operațiuni | Neconfigurat | URL suport, monitorizare, backup, incident/rollback plan |

## P0 — înainte de orice public beta cu utilizatori externi

- [ ] Identitate comercială: denumire operator, forma juridică, CUI/registru, adresă și contact oficial.
- [ ] Bundle ID final: ro.collector.mobile este provizoriu; decide identificatorul înainte de App Store Connect / Play Console.
- [ ] SQLite encryption at-rest: alege key management în Secure Storage/Keychain/Keystore, migrare de la DB necriptată, comportament la pierderea cheii, backup și recovery. Nu activa doar flag-ul fără test de migrare.
- [ ] Backend cloud: proiect Supabase real, Auth flows/confirmare email/reset parolă, migrarea SQL aplicată, RLS/RPC permissions revizuite, proiect de staging separat de producție.
- [ ] Cloud API public: deploy HTTPS, host/secrete, CORS strict, health/monitoring, spend limit OpenAI, alertare și verificare rate limit. Nu folosi serverul local collector-v11/server.js ca backend de producție.
- [ ] OpenAI: model și tarif reale confirmate în configurare, limite lunare testate, comportament la provider outage/rate limit și key management server-only.
- [ ] RevenueCat: produse lunare/anuale, entitlement exact pro, offering curent, store app IDs/keys și webhook secret/product allowlist. Păstrează Restore Behavior = Keep with original App User ID până când transferul este implementat și testat.
- [ ] Sandbox: purchase, restore după reinstall, renewal, cancellation, billing issue/grace period, refund, expiration, account recovery și confirmarea emailului pe Android și iOS.
- [ ] Privacy / terms: completează și publică politica/termenii, stabilește scopuri, temeiuri, regiuni de procesare, retention, subprocessors, mecanisme de drepturi GDPR și contacte. Drafturile din repository nu sunt documente finale.
- [ ] Ștergere cont: verifică pe proiect Supabase real; explică diferența între ștergerea contului cloud, datele locale și abonamentul din store. Ștergerea contului nu anulează abonamentul și nu golește automat SQLite local.
- [ ] Dispozitive reale: migrare v7 pe instalare existentă, restart/upgrade, storage full, înregistrări lungi, suspendare background, apeluri telefonice, Bluetooth/audio routing, playback, permisiuni și notificări.
- [ ] Manual acceptance: rezolvă checklist-ul deschis din issue #4 cu date sintetice, fără a importa/exporta date operaționale personale.

## P1 — înainte de store review

- [ ] Build Android AAB semnat cu keystore și Play App Signing; nu publica APK debug.
- [ ] Build iOS Archive/IPA semnat, certificates/profiles și App Store Connect/TestFlight; build-ul simulator nu este distribuibil.
- [ ] Reproductibilitate: adu dependențele Capacitor/plugin/native în manifest și lockfile sau furnizează un lock de toolchain verificat; CI și dezvoltatorii trebuie să instaleze aceleași versiuni tranzitive.
- [ ] Verifică bundle-ul final: fără .env, service-role key, OpenAI API key, server local, teste, rapoarte sau documente interne.
- [ ] Verifică bundle-ul final și App Privacy / Google Play Data safety pe baza fluxurilor reale: Supabase Auth, OpenAI text/context, RevenueCat/store metadata, audio local și speech recognition oferit de browser/OS.
- [ ] Publică URL-uri funcționale pentru Privacy Policy, Terms, Support și Account Deletion (unde este cerut).
- [ ] Pregătește icon, splash, screenshots reale, descriere, categorii, age rating, prețuri, perioadă de abonament, auto-renew și instrucțiuni de anulare.
- [ ] Configurează crash/health monitoring, alertare cost AI, backup/restore pentru datele server-side și procedură de rollback.
- [ ] Rulează Quality Suite, Cloud API, Android și iOS fără anulări pe același HEAD final; atașează artefactele și rezultatele.

## P2 — limitări de produs care trebuie comunicate

- [ ] Nu promite sync multi-device, cloud backup sau workspaces până la implementarea și validarea lor.
- [ ] Nu promite captură vocală offline universală: SpeechRecognition diferă între browsere/OS și nu este garantat local.
- [ ] Nu promite înregistrare continuă în background pe Android până la foreground service și teste de durată/Doze; iOS background mode necesită validare pe dispozitive.
- [ ] AI interpretează și propune; Core validează; utilizatorul confirmă. Nicio comandă nu se execută fără confirmare.
- [ ] Definește planul Free/Pro, quota și prețurile finale după testarea costurilor și comisioanelor store. Valorile din documentul de monetizare sunt estimări, nu prețuri aprobate.

## Ordine recomandată pentru lansare

1. Alpha intern local-first, fără cloud/billing public, cu testare hardware și migrare de date.
2. Beta închisă cu backend staging, autentificare recuperabilă și produse sandbox.
3. Store review cu build-uri semnate, documente complete și Data Safety/Privacy labels.
4. Lansare graduală numai după validarea crash rate, cost AI, restore și procedurii de suport.

**Regulă:** PR #55 rămâne draft; nu se face merge, deploy, activare de billing sau publicare în magazine fără aprobarea explicită a utilizatorului.


## SQLite encryption technical gate
See `SQLITE-ENCRYPTION-MIGRATION-PLAN.md` for the staged SQLCipher migration. The plugin supports encryption, but configuration remains disabled until crash-safe migration, secure-key lifecycle, Core replay verification, and physical-device tests are complete. Do not simply enable the flags: that could make existing plaintext user data inaccessible.
