# Collector — audit profesional de pre-lansare + SWOT
**Data:** 25 noiembrie 2026  
**Branch:** `feature/openai-provider-integration`  
**PR:** #55 — OPEN / DRAFT  
**HEAD la audit:** `d13b023b96e84dbdb0357f6b0978dd5382faccea

> Acest audit separă implementarea din cod, validarea CI și validarea externă/fizică. „Implementat” nu înseamnă automat „validat în producție”.

## 1. Verdict executiv

**Status: pre-lansare avansată, dar NOT RELEASE-READY.** Proiectul are Core local-first, UI Work/Think, funcții native, AI provider server-side, cloud API și fundație de abonament/usage metering. Cele mai importante riscuri nu mai sunt lipsa scheletului de funcționalitate, ci validarea reală, securitatea operațională, reproductibilitatea build-ului, migrarea/criptarea datelor și completarea infrastructurii externe.

### Starea CI la audit
- Cloud API — **SUCCESS** pe HEAD `d13b023...`.
- Mobile Build — **SUCCESS** pe același HEAD: Android debug APK + iOS Simulator app.
- Quality Suite — **IN PROGRESS** pe același HEAD; nu declarăm HEAD complet verde până la finalizare.
- Run-urile anulate de concurrency sunt superseded/cancelled și nu sunt failures tehnice ale HEAD final.
- PR #55 rămâne draft; nu s-a făcut merge în main, deploy sau publicare.

## 2. Checklist consolidat

### A. Core & integritatea datelor
- [x] Core local-first și testele Core existente incluse în Quality Suite.
- [x] D-001–D-044 păstrate ca autoritate; nu se modifică fără analiză de impact.
- [x] AI/Core/UI separate; AI propune, Core validează, utilizatorul confirmă.
- [x] Import-validation/replay/correction test coverage existentă.
- [x] Ștergerea locală `clearAllLocalData()` verificată în implementare și teste: protecție contra recording activ, confirmări explicite, ștergerea datelor locale și păstrarea contului/abonamentului cloud.
- [ ] Acceptance manual complet, inclusiv date-limită, corecții compuse, import/export și recuperare.
- [ ] Audit final al edge cases și regresii pe build-ul de release.

### B. UX — Work/Think
- [x] Work este ecranul principal; Think separat pentru analiză/administrare.
- [x] Recorder și alarm/reminder flows integrate.
- [ ] Usability pe telefoane reale: one-handed, accessibility, font scaling, focus, keyboard, ecrane mici.
- [ ] Acceptanță completă a flow-urilor Work (record → stop → playback → save/recover) și alarm (create/edit/snooze/cancel).

### C. Audio, background, notificări
- [x] Recorder nativ AAC, fișier privat, metadata SQLite.
- [x] Fallback web cu checkpoint-uri IndexedDB pentru recuperare.
- [x] Notificări native și logică de anulare/rollback.
- [ ] Teste hardware: apel/interrupt, Bluetooth, audio routing, process kill, low storage, restart, playback, permisiuni revocate.
- [ ] Validare background reală. Android foreground-service behavior nu este încă demonstrat; nu promite recording background garantat.
- [ ] Android Doze/restart și iOS Focus/permissions/scheduling validate.

### D. Storage, migrare, encryption — P0
- [x] SQLite adapter și legacy v7 migration.
- [x] Encryption bootstrap Stage B: secret 256-bit random, secure-store verification, encrypted-new-DB flow, fail-closed.
- [x] Plaintext migration path cu snapshot, read-back, convert, encrypted-state/KV verification, recovery și cleanup Core-gated.
- [x] Regresii pentru backup corupt, cleanup care nu șterge legacy key schimbat, opt-out păstrat.
- [ ] Encryption gate `sqliteEncryptionEnabled` rămâne OFF și native flags false.
- [ ] Teste pe hardware pentru quota/storage-full, crash în fiecare etapă, restore, missing/wrong key, upgrade și replay.
- [ ] Review independent al lifecycle-ului key și al snapshotului temporar plaintext în localStorage.
- [ ] Validare separată a protecției fișierelor audio și backup-urilor; SQLite encryption nu le acoperă automat.

### E. AI & Cloud API — P0 pentru beta cloud
- [x] OpenAI provider server-side; API key nu trebuie să fie în client.
- [x] Context allowlisted/minimizat; audio și jurnalul complet nu sunt trimise implicit.
- [x] Supabase token validation, rate limit, CORS, request limits, response safety și endpoint de account deletion în cod.
- [x] AI/Core preview + explicit confirm gate.
- [ ] Proiect Supabase real și staging separat; Auth recovery, email confirmation, password reset.
- [ ] SQL migration aplicată, RLS/RPC permissions auditate pe project live.
- [ ] Cloud API deploy HTTPS, secret store, CORS production, monitoring, logs și spend caps/alerts.
- [ ] Test OpenAI real, provider outage/rate limit, cost accounting și quota epuizată.
- [ ] Test account deletion pe proiect real și audit al datelor rămase local/store.

### F. Billing / subscription — P0 pentru monetizare
- [x] RevenueCat SDK, offering/purchase/restore UI.
- [x] Backend entitlement, webhook idempotency, product allowlist și usage metering SQL/RPC în cod.
- [x] AI endpoint Pro gate și rezervare/regularizare budget.
- [ ] Supabase live + migrare aplicată și permissions review.
- [ ] RevenueCat live project, store products, entitlement/offering, webhook și keys.
- [ ] Sandbox: purchase, restore, renew, cancel, refund, expiration, billing issue/grace, account recovery, reinstall.
- [ ] Verify Restore Behavior: Keep with original App User ID până transfer flow este testat.
- [ ] Teste de email recovery/confirmare înainte de purchase.
- [ ] Pricing/quota finală decisă după cost real, taxe și comisioane.
- [ ] Sync multi-device/backup nu există; nu trebuie inclus în promisiunea Pro încă.

### G. Build, dependencies, release — P0/P1
- [x] Android debug APK CI și iOS simulator CI pe HEAD curent.
- [x] Mobile bundle allowlist și test pentru secret patterns.
- [x] Workflow permissions least privilege: read global; import workflow write doar la job-ul de push.
- [x] ZIP import validation: traversal/absolute paths/backslashes/symlinks; branch guard și clean checkout.
- [ ] Toolchain native este instalat cu `npm install --no-save --no-package-lock`; graf tranzitiv nu este reproducibil complet.
- [ ] Introdu toolchain-ul în manifest/lockfile și validează `npm ci` într-un mediu curat.
- [ ] CI full green pe **un singur SHA final** (Quality, Cloud, Android, iOS) după audit/report changes.
- [ ] Signed Android AAB + Play App Signing; nu APK debug.
- [ ] Signed iOS archive/IPA + provisioning + TestFlight.
- [ ] Release workflow cu gating, artifact retention, provenance și rollback; fără signing secrets până la aprobare.
- [ ] Final artifact scan pentru .env, private keys, server code, test fixtures/docs și secret leakage.

### H. Legal, privacy, store, support — P0/P1
- [ ] Operator legal, adresă/contact, bundle ID final.
- [ ] Privacy Policy/Terms finale și publice; subprocessors, regiuni, retention, scopuri și drepturi GDPR.
- [ ] App Privacy/Data Safety bazate pe fluxurile reale; account deletion URL/flow.
- [ ] Store metadata, icon/screenshots, age rating, pricing, auto-renew/cancel disclosures.
- [ ] Support URL/email, monitoring, crash reporting, incident response și rollback.
- [ ] Backup/restore pentru date cloud și plan operațional.

### I. Sync și scope comercial
- [ ] Sync multi-device, backup, conflict resolution și workspace isolation — **neimplementate**.
- [ ] Nu promite cloud sync/backup până la implementare și validare.
- [ ] Clarifică feature matrix Free/Pro și quota finală.

## 3. SWOT — analiză profesională

### Strengths — Puncte forte
1. **Core local-first**: produsul fundamental nu depinde de cloud/AI și păstrează valoarea chiar fără abonament.
2. **Integritate arhitecturală**: AI nu execută direct; Core validează și utilizatorul confirmă. Deciziile D-001–D-044 și testele regresive sunt un avantaj major.
3. **Work-first UX**: recorder și reminders sunt orientate către utilizare hands-free/în timpul activității; Think separat evită supraîncărcarea ecranului principal.
4. **Fundație mobilă reală**: Capacitor, SQLite, audio nativ, notifications, auth/cloud API și CI Android/iOS există în branch.
5. **Automatizare CI și security hardening**: test suite, E2E/property/replay, bundle allowlist/secret scanning, least-privilege workflows și archive validation.
6. **Monetizare tehnic gândită**: entitlement și usage budget server-side, idempotent webhook, cost cap concept; utilizatorul nu trebuie să-și cumpere separat API key.

### Weaknesses — Puncte slabe
1. **Validare de teren absentă**: CI compilează/testează, dar nu substituie telefoane reale, background, mic, notificări, storage și recovery.
2. **Release reproducibility**: native toolchain nu este fully locked; install no-lock este risc de drift.
3. **Encryption încă gated**: Stage B implementat, dar gate OFF; snapshot temporar plaintext și recovery behavior necesită hardware validation.
4. **Backend comercial neconfigurat**: Supabase/RevenueCat/OpenAI live, deploy, secrets și sandbox nefinalizate.
5. **Fără sync multi-device**: valoare Pro trebuie delimitată; cloud backup nu poate fi promis.
6. **Release packaging**: debug APK/iOS Simulator, nu semnate și nu store-ready.
7. **Legal/store operations**: operator, policy, metadata, support, monitoring și incident response lipsesc sau sunt draft.

### Opportunities — Oportunități
1. **Beta internă local-first** înainte de cloud: validarea recorderului, UX și integrității poate începe fără costuri externe.
2. **Niche product**: un logger voice-first cu Work rapid și Think pentru analiză poate diferenția Collector față de formulare/manual logging.
3. **Cost control**: AI on-demand, context minim, quotas, model benchmarking și local-first reduc costul și riscul.
4. **Pilot cu utilizatori selectați**: obține feedback asupra workflow-ului Work și a interpretării AI înainte de store.
5. **Release pipeline reproductibil**: lockfile + signed builds + staged rollout transformă proiectul din prototip în produs operabil.
6. **Sync ca premium ulterior**: implementat separat, cu conflict handling și privacy, poate deveni motiv de abonare real.

### Threats — Amenințări
1. **Data loss/security**: migrare SQLite, key lifecycle, snapshot plaintext, backup/restore și audio storage sunt riscuri high-impact.
2. **Platform behavior**: iOS/Android pot suspenda audio/background și pot schimba scheduling/permisii; UX promițând funcții nevalidate poate duce la review rejection sau user complaints.
3. **Billing/compliance**: configurare greșită RevenueCat/Store products, entitlement drift, restore/account recovery și refund handling.
4. **Cloud cost abuse**: quota/RPC/config greșite sau account abuse pot produce costuri; rate limit in-memory nu este protecție suficientă la scalare.
5. **Vendor dependency/drift**: toolchain ne-lock-uit, plugin updates, SDK/OS changes, runner availability și Maven throttling.
6. **Privacy/regulatory exposure**: text/context AI, account deletion, subprocessors și store disclosures incomplete.
7. **Market risk**: dacă Work capture nu este suficient de rapid/reliable, AI nu compensează fricțiunea de bază.

## 4. Risk register — prioritizare

| ID | Risc | Impact | Probabilitate | Prioritate | Mitigare / gate |
|---|---|---|---|---|
| R1 | Migrare/criptare DB poate compromite accesul la date | Critical | Medium | P0 | Hardware crash/recovery tests; gate OFF până la sign-off |
| R2 | Audio/background/notifications behavior diferă pe OS/device | High | High | P0 | Test matrix Android+iOS real, fără promisiuni premature |
| R3 | Cloud/billing configuration greșită sau entitlement bypass | High | Medium | P0 | Staging, RLS/RPC review, sandbox suite, fail-closed |
| R4 | AI cost/abuse | High | Medium | P0 | Persistent budgets, spend caps, alerts, rate-limit și load tests |
| R5 | Toolchain drift | Medium-High | High | P0 | Lockfile complet, npm ci clean-room, CI pe SHA |
| R6 | Legal/privacy/store rejection | High | Medium | P0/P1 | Final policies, disclosures, deletion URL, review legal |
| R7 | Sync/backup absent | Medium | High | Scope | Limitează claims; implementare înainte de Pro sync promise |
| R8 | Release signing/artifacts incomplete | High | High | P1 | Signed AAB/IPA, staging, release workflow, rollback |

## 5. Plan de execuție recomandat

### Sprint 0 — Stabilizare și reproducibilitate (înainte de alte features)
1. Așteaptă CI pe HEAD `d13b023...`; remediază orice failure real.
2. Lock native toolchain și plugins în package manifest + lockfile; validate npm ci clean-room.
3. Re-run all CI workflows on one SHA.
4. Inspect artifacts/bundle secret scan and test install/update path.

### Sprint 1 — Data safety + hardware validation
1. Encryption migration test matrix: new install, plaintext v7, encrypted reopen, missing/wrong key, interrupted conversion, backup corruption, quota/storage full, upgrade.
2. Android + iPhone real-device test matrix pentru audio, background, interruptions, Bluetooth, notifications, permissions, restart, playback și recovery.
3. Complete manual Core acceptance and clear-local-data/account-deletion distinction.
4. Keep encryption OFF until explicit sign-off.

### Sprint 2 — External staging
1. Supabase staging project + Auth recovery + migrations + RLS/RPC review.
2. Cloud API HTTPS deploy, secrets, monitoring, CORS, spend caps and alerting.
3. OpenAI real smoke and failure/limit tests.
4. RevenueCat sandbox end-to-end; restore/account identity; refund/cancel/expiry/grace.

### Sprint 3 — Release engineering + legal/store
1. Signed Android AAB and iOS archive/TestFlight pipeline.
2. Release gate with CI, artifact scan, versioning, provenance and rollback.
3. Legal/privacy/terms, support, deletion, metadata, Data Safety/App Privacy, screenshots.
4. Beta closed rollout, monitor crashes/cost/restore before production.

## 6. Definition of Done for public release

Public launch is blocked until all are true:
- [ ] CI full green on final immutable SHA (Quality + Cloud + Android + iOS).
- [ ] Dependency/toolchain install reproducible with lockfile and clean `npm ci`.
- [ ] Data migration/encryption and recovery tested on physical Android/iOS; encryption policy approved.
- [ ] Work/audio/reminders tested on physical devices and OS behavior documented.
- [ ] Supabase production/staging configured, RLS/RPC reviewed, cloud API HTTPS monitored.
- [ ] OpenAI cost caps/quotas and abuse protections verified.
- [ ] RevenueCat sandbox tests complete for all critical subscription lifecycle events.
- [ ] Signed release artifacts and store account/app identifiers ready.
- [ ] Legal/privacy/store/support materials complete and public.
- [ ] Account deletion, local data deletion, subscription cancellation and restore are clearly separate and tested.
- [ ] Backup/restore and rollback plans documented.
- [ ] User explicitly approves merge, deployment and store submission.

## 7. Immediate next task

**Do not add new features yet.** First resolve the Quality Suite run on current HEAD and then complete toolchain reproducibility. These are the highest leverage steps because they reduce uncertainty for every later release task.
