# Collector — decizii de produs definitive (26 nov. 2026)

Acest document înlocuiește ipotezele comerciale/UX contradictorii din notele anterioare. Este sursa de adevăr pentru implementarea următoare.

## 1. Produsul
Collector este **memorie personală inteligentă cu captură vocală hands-free**. AI este funcția centrală, nu un addon și nu o simplă opțiune de transcriere. Utilizatorul vorbește natural; Collector interpretează, structurează, corelează cu memoria existentă și redă informația într-o propoziție naturală. Work este prioritatea UX: capture, recording, reminders și confirmări minimale. Think rămâne pentru recall, analiză, căutare, istoric și configurare.

## 2. Trial și abonamente
- Trial: perioadă limitată, cu experiența completă Collector/AI, fair-use transparent și date de trial/eligibilitate/preț/auto-renew afișate din store metadata reală. Durata trialului se configurează prin store, nu hardcodează copy în UI.
- După trial: planurile **Small €5/lună, Medium €15/lună, Large €30/lună**. Toate includ AI; diferența este capacitatea/limitele de utilizare.
- Nu există strategie Free forever cu AI eliminat ca produs principal. Fallback după expirare poate păstra accesul la date, export și operații de bază locale, dar nu trebuie confundat cu produsul comercial.
- Costul AI/cloud este inclus în abonament; utilizatorul nu configurează sau achită separat un API key.
- Tiers trebuie dimensionate prin cost observat: minute audio, token input/output, storage, queries și procesare. Nu inventăm limite numerice înainte de modelul de cost, testare și fair-use.
- Entitlement centralizat și authoritative server/store-side; nu scattering checks și nu unlock client-only. Billing/cost metering trebuie să distingă tier, trial, expiry, quota, grace/billing issue, restore și refund.

## 3. Interpretare și redare
Pentru fiecare captură vocală/text, pipeline-ul țintă:
**original → speech-to-text/transcript → semantic interpretation → extracted facts/tasks/events/reminders → source-linked memory → natural-language playback/recall**.
Originalul și transcrierea rămân accesibile. AI generează rezumat în propoziții naturale (și TTS când disponibil), nu doar text brut/listă de câmpuri. Răspunsurile factual de recall trebuie legate de sursă (recording/transcript/event/item) și timestamp; când nu există dovezi suficiente, Collector spune că nu știe.

## 4. Memorie cumulativă
Memoria trebuie să coreleze capturi între zile și contexte, să păstreze proveniență și să distingă: statement user, fapt confirmat, inferență AI, acțiune executată și sistem. Nu duplică Core state; folosește referințe la source IDs. Corecții/deletări trebuie să se propagă la indexurile derivate. Userul poate revizui și corecta.

## 5. Reminders auto-create
AI detectează intenția explicită de reminder în vorbire naturală, extrage acțiune, data, ora și context:
„Vineri trebuie să cumpăr materialele pentru proiect, să nu uit.”
→ „Cumpără materialele pentru proiect” + vineri.
- Creează reminder fără să oblige userul să completeze manual un formular, când data/intenția sunt suficient de clare.
- Confirmare vocală/UI: „Am setat reminderul pentru vineri…”.
- Date/ora ambiguă sau lipsă: nu inventa. Cere o singură clarificare sau propune un default configurabil (ora implicită pentru reminders date-only; setarea trebuie explicată).
- Nu transforma orice „ar trebui/cândva/poate” în reminder. Intenția trebuie să fie clară sau userul să confirme.
- Reminderul este acțiune side-effect separată de Core journal. Preview/confirmation, idempotency, permission, native notification schedule, persistence, timezone/date parsing și rollback sunt obligatorii. Nu pretinde reminder creat dacă pluginul/permisiunea/scheduling nu reușește.
- Reminder follow-up: la notificare, user poate marca complet, amâna, cere context. Completion trebuie salvată și în Activity/Memory ledger.

## 6. Work flow
Work capture să nu oprească înregistrarea pentru fiecare clasificare. Pipeline poate procesa asincron; userul primește feedback discret, iar acțiunile care schimbă date sau programează notificări au preview/confirmare adecvată. Pentru reminder explicit și neambiguu se poate activa „confirmare după creare” numai după succesul scheduling-ului; în trial/premium AI este disponibil.

## 7. Current code audit — known mismatches
Audit pe HEAD 88343f122a28644714e92832f6df332949b7a564:
- collector-v11/app.js: Work text parser este determinist și limitat la note/atribute/vânzare; AI provider flow interpretează Collector Core operations, preview și explicit confirm. Nu există contract sau flow pentru reminder suggestions, voice semantic summaries sau source-grounded memory recall.
- collector-v11/ai/provider-openai.js: schema operations nu include reminder actions; provider prompt nu cere event/task/reminder extraction. Nu adăuga reminder ca operație Core generică fără contract separat.
- collector-v11/reminders.js: native reminder service există (create/list/cancel/snooze/clear + rollback tests), dar este independent de AI; nu are task status/completion, source link, natural-language date parser sau auto-creation from AI.
- collector-v11/app.js AI UI: propunerea AI este generic Core preview/confirm; niciun combined preview pentru Core changes + reminders.
- collector-v11/subscriptions.js + cloud-api/server.js: curent există un entitlement pro și active-Pro gate; UI afișează Pro și offerings RevenueCat. Nu sunt implementate/validate trei tiers Small/Medium/Large, per-tier budgets, trial acquisition/onboarding/paywall copy. Trial poate fi entitlement Pro în perioada store intro dacă store/configurează; trebuie sandbox verification.
- Audio: recording metadata/storage/recovery și backup au componente implementate, dar nu există pipeline complet audio→transcription→AI summary→memory→spoken playback și hands-free interruption/device validation rămâne blocker.
- E2E Basic/offline tests are authored around no AI request; must be reframed as post-trial/local data-access regression, not evidence that the commercial product's core AI is optional forever.

## 8. Implementation order (do not lose this)
P0 (next engineering work):
1. Central product decision/capability model and RevenueCat tier mapping: trial/full AI, Small/Medium/Large, server authoritative limits. Preserve data/export post-expiry.
2. AI contract version bump or backward-compatible extension for structured memory extraction, natural-language answer, tasks/reminder suggestions, dates/timezone/ambiguity, confidence, source refs; server validation rejects malformed/unsafe actions.
3. Reminder intent pipeline: extraction → date resolution in device timezone → reminder preview → schedule with notification permission → success confirmation → persisted source link; idempotent duplicate prevention and rollback.
4. Reminder completion/snooze/recall and activity ledger integration.
5. Voice recording pipeline and playback: transcript, natural sentence summary, source/timestamp link, TTS control, async queue/retry, offline/original preservation.
6. Memory/recall MVP: retrieval over existing local journal/audio/transcripts/reminders, grounded answers, citations/jump-to-source, no fabricated facts.
7. UI Work first: capture state, discreet AI processing/status, reminder confirmation, natural summary, recording playback; Think improvements later.
8. Tests: contract/schema, explicit/ambiguous/negated reminders, relative dates, DST/timezone, expired trial, tier quota boundaries, provider failure, notification permission/storage rollback, duplicate/idempotency, source links, TTS/audio interruption, data retained after expiry. Then CI on exact HEAD and device tests.

No live subscription config, production deployment, merge or store release without explicit approval. Continue implementation on PR #55 branch and checkpoint every batch.

## 9. Reminder intent examples
- Clear: „Vineri la 9 cumpăr materialele, amintește-mi.” → create Friday 09:00.
- Clear date but no time: „Vineri să cumpăr materialele, să nu uit.” → create Friday at configured default reminder time, disclose the default.
- Ambiguous: „Poate vineri cumpăr materialele.” → no notification; ask whether to create.
- Negated: „Nu-mi pune reminder pentru vineri.” → no reminder.
- Past date/relative-date ambiguity → clarify, never schedule in the past.
