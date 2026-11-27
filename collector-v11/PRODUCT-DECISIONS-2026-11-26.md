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
**original → speech-to-text/transcript → semantic interpretation → extracted facts/tasks/events/reminders → source-linked structured memory → natural-language recall/playback**.
Audio-ul și transcriptul sunt surse temporare, nu arhiva permanentă. După confirmarea utilizatorului, commit-ul Core și recitirea independentă a jurnalului, transcriptul temporar este eliminat și audio-ul original este șters implicit; utilizatorul poate activa explicit păstrarea audio din Work. La ambiguitate, eșec AI, eșec checkpoint sau incertitudine de persistență, sursa rămâne pentru recovery. Recall-ul și reconstrucția folosesc entități, atribute, relații și evenimente Core, fără dependență de fișierul audio. AI generează rezumat în propoziții naturale (și TTS când disponibil), nu doar text brut/listă de câmpuri. Răspunsurile factuale de recall trebuie legate de ID-ul capturii/evenimentului structurat și timestamp; când nu există dovezi suficiente, Collector spune că nu știe.
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

## 7. Current code audit — verified status after implementation work
Ultima reverificare: branch `feature/openai-provider-integration`. Statusul de mai jos distinge ce există în cod de ce nu a fost încă validat pe dispozitive sau operațional în producție.
- `collector-v11/app.js`: Work are captură vocală, acțiune manuală de transcriere, interpretare OpenAI, extragere structured-memory, rezolvare entități, Core preview, confirmare explicită și recitire independentă. Nu există procesare AI automată în fundal.
- `collector-v11/ai/provider-openai.js` și `provider-openai-browser.js`: există provider OpenAI pe server și client pentru interpretare/transcriere. Nu există TTS/playback conversațional complet; sumarul semantic este afișat ca text.
- `structured-memory.js` / `structured-memory-browser.js`: contract cu limite, validare, idempotency, rezolvare conservatoare și păstrarea aliasurilor existente. Recall-ul local caută entități, atribute, relații și evenimente cu referințe de sursă; sinteza generativă a răspunsului din dovezile recuperate și navigarea completă către fiecare sursă mai necesită implementare.
- Reminder suggestions sunt extrase de provider și validate separat înainte de scheduling; programarea cere acțiune explicită, folosește idempotency și notificări native. Nu există încă un model de task cu status de completion integrat complet în event ledger.
- Audio: fișierul rămâne local în timpul procesării; după confirmarea Core și verificarea independentă a evenimentului, draftul temporar este șters și audio-ul este eliminat implicit. Work permite păstrarea explicită. Recovery verifică un commit anterior înainte de retranscriere, pentru a evita duplicate și costuri AI. Eșecurile păstrează sursa.
- `subscriptions.js` și cloud API încă au nevoie de mapare authoritative pentru trial + Small/Medium/Large, limite măsurate pe cost, usage metering și testarea sandbox a achizițiilor/restaurărilor. Prețurile și limitele nu sunt considerate validate doar pentru că sunt documentate.
- E2E/browser și build-uri Android/iOS trebuie rulate pe HEAD-ul final; CI nu înlocuiește verificarea fizică a microfonului, notificărilor, lifecycle-ului aplicației și întreruperilor OS.
- Înainte de lansare rămân: recall AI grounded cu surse, TTS, procesare/retry offline controlate, task completion, quota/cost controls authoritative, privacy/export/deletion review, auth/data isolation audit, monitoring și store/device validation.
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
