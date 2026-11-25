# Collector — stare proiect și punct de continuare

**Snapshot:** 0.7 consolidat (arhivă testată: Collector-MVP-v11-AI-Foundation-Attribute-Range-Fix-v0.7.zip)  
**Data snapshot:** 21 noiembrie 2026  
**Ultima actualizare de proiect:** 23 noiembrie 2026  
**Repository:** davidlucian-ioan/Aplicatie  
**Default branch:** main  
**Status GitHub:** Collector MVP v11 este integrat în `main` prin PR #3. Faza 1 este integrată prin PR #6, hardening Core prin PR #7, iar extinderea migrare/UI/testelor Core prin PR #14 (merge squash 23 noiembrie 2026), commit `1c7aae2a5a906f779eb85af73496c1ba14cf17d2`, iar testele suplimentare de stoc din PR #16 au fost integrate în `main` prin commit `5487c764c9f3183878a3268f23f8423e36d1e76b`. CI PR #14 a trecut integral: teste Node/Core/property, Replay benchmark, Chromium/Firefox/WebKit și Stryker focalizat (run #45239707892). UI byte coverage Chromium este 78,39%. Baseline-ul Stryker full-suite este 65,81% (run #45237194442); rularea focalizată din PR #14 a fost 31,35% și nu este comparabilă direct, deoarece folosește doar `test-core-mutation-survivors.js` cu mutații pe întreg `engine.js`. Stryker full-suite este configurat să ruleze nocturn cu `npm test`. Strategia actualizată este în `docs/testing/TEST-STRATEGY-v1.md`.  
**Artefacte păstrate:** Library `/Collector/Collector-MVP-v11-CONTINUARE-v0.7.zip` și `/Collector/CONTINUARE-PROIECT.md`.

## 1. De ce există acest document

Acest document este punctul unic de reluare a proiectului. La începutul unei conversații noi, citește acest fișier și issue #4/#5 înainte de a propune modificări. Nu relua verificări sau instalări deja închise decât dacă există o regresie demonstrată.

## 2. Situația repository-ului constatată

Înainte de integrare, `main` conținea un MVP timpuriu. La 22.11.2026, implementarea completă Collector MVP v11 este integrată în `main/collector-v11/`. Folderul include `engine.js`, `app.js`, UI, `ai/`, teste, `package.json`, `index-server.html` și scriptul Windows de pornire. Documentele conceptuale canonice din rădăcină au fost păstrate. README-ul root indică acum folderul aplicației.

Arhiva v0.7 a fost încărcată în branch-ul de integrare, extrasă prin GitHub Actions și sursa extrasă a fost comisă în repository. PR #3 a fost verificat și integrat în `main`.

**Integrarea sursei v11:** completată prin PR #3. Biblia și documentele conceptuale canonice au fost păstrate. Modificările ulterioare se fac prin branch și PR; nu se suprascrie direct main.

## 3. Release v0.7 — ce conține

Arhiva v0.7 include cumulativ:
- Core Port și integrarea lui cu UI/localStorage (din seria v0.3);
- replay tolerant pentru importuri legacy duplicate și evenimente istorice malformate (v0.4);
- parser local cu reguli pentru observații, inclusiv diacritice și formulări testate (v0.5);
- clarificarea indicatorului de populații/solduri: soldurile sunt cantități, nu numărul de înregistrări de sold (v0.6);
- politica intervalelor pentru atribute: limitele min/max sunt intervale recomandate și produc avertismente, nu blocaje ale înregistrării; valorile măsurate în afara intervalului rămân înregistrabile; valoarea inițială poate lipsi când atributul nu este obligatoriu; min > max este o configurare invalidă (v0.7).

## 4. Verificare executată local pe arhiva v0.7

Comandă: `npm test`  
Rezultat la 21.11.2026:
- 38 teste;
- 38 trecute;
- 0 eșuate;
- 0 anulate.

Suitele acoperă Core Port browser, preview fără persistare, persistență înainte de publicarea stării, confirmare la operații cu risc, contract/idempotency, parser comenzi, validări de import, corecții, replay legacy și politica intervalelor atributelor.

Pe lângă testarea locală, GitHub Actions run #44956048507 a extras arhiva v0.7, a rulat `npm test` în `collector-v11/` și a confirmat: 38 teste, 38 trecute, 0 eșuate, 0 anulate. [Rularea CI](https://github.com/davidlucian-ioan/Aplicatie/actions/runs/44956048507).

Acestea sunt teste automate. Nu substituie validarea manuală a UI-ului în browser.

## 5. Date operaționale ale utilizatorului — nu se includ în Git

În testarea locală a aplicației:
- export JSON păstrat separat de utilizator;
- replay afișează 38 evenimente, 5 entități, 5 relații, 4 stocuri, 0 tranzacții financiare;
- replay verificat manual: warnings = [];
- valorile curente și cele reconstruite prin replay au coincis.

Populațiile din testul local:
- fancy: sold 1;
- fancy anon în B2: sold 5;
- total cantitate: 6.

Nu se introduce exportul JSON al utilizatorului în GitHub și nu se publică date operaționale private în repository.

## 6. Decizii de produs pentru atribute și măsurători

Separă explicit:
1. **Valoare măsurată:** faptul observat (ex. pH = 5.2).
2. **Interval recomandat:** intervalul dorit (ex. 5.5–6.5).
3. **Limite tehnice de validare:** numai constrângeri reale ale tipului/unității sau ale integrității datelor, nu preferințe biologice.

O valoare măsurată în afara intervalului recomandat trebuie salvată cu avertisment. Collector documentează realitatea; nu trebuie să blocheze o valoare reală doar pentru că este sub/peste intervalul recomandat.

## 7. Principii arhitecturale obligatorii

Respectă registrul Decizio.md, inclusiv D-001–D-044:
- aplicație universală, independentă de domeniu;
- AI propune; Core validează și persistă; UI prezintă;
- istoricul de evenimente este sursa adevărului; proiecțiile sunt reconstruibile;
- corecțiile se fac prin evenimente noi, fără rescrierea evenimentelor originale;
- operațiile compuse sunt atomice;
- idempotency, precondiții, invariante și impact analysis sunt responsabilități Core;
- granularitate progresivă; populații anonime pot exista fără indivizi identificați;
- contextul conversațional expiră după 30 de minute, fără a afecta datele operaționale;
- domeniile sunt module de cunoaștere/configurare, nu logică hardcodată.

## 8. Restanțe — ordinea recomandată

### P0 — integrare în GitHub: închisă prin PR #3
- Arhiva v0.7 a fost încărcată în branch-ul dedicat.
- Sursa executabilă v11 a fost extrasă în `collector-v11/`; documentele conceptuale canonice din rădăcină au fost păstrate.
- README root și workflow-ul GitHub Actions au fost actualizate.
- PR #3 a fost verificat și integrat în `main`.
- CI a confirmat 38/38 teste trecute, 0 eșuate.

### P1 — validare funcțională cu utilizatorul
- Testează în browser, pe versiunea integrată, comanda de observație sugerată de UI.
- Testează o măsurătoare pH = 5.2 cu interval recomandat 5.5–6.5: avertisment prezent, salvarea permisă.
- Testează valoare inițială goală pentru atribut opțional.
- Testează min > max: configurarea este respinsă.
- Confirmă indicatorul de cantitate: 1 + 5 = 6, fără a confunda numărul de populații cu numărul de exemplare.

### P2 — AI Foundation
- Închide gap-urile din auditul Fazei 0: schemă de comandă aliniată la forma reală Core, allowlist, politică de confirmare și teste negative de autorizare.
- Nu conecta un provider AI real și nu activa write path AI până când aceste criterii nu sunt satisfăcute.

## 9. Strategie și backlog de testare

- CI în `main`, verificat prin PR #7: 61/61 teste Node, 2/2 suite property-stock, 4/4 suite property-Core și 7/7 fluxuri Playwright Chromium.
- Rularea PR verde: https://github.com/davidlucian-ioan/Aplicatie/actions/runs/45032860362.
- `@playwright/test` 1.65.1 și `fast-check` 4.11.0 sunt dependențe instalate; lockfile-ul este comis și Node 22 este versiunea recomandată.
- CI rulează 250 secvențe stock + 150 secvențe Core la fiecare PR și 2.500 + 1.500 într-o rulare nocturnă.
- Coverage Node pentru `engine.js`: 96,85% line, 91,46% branch, 96,08% functions. Coverage-ul Node nu instrumentează `app.js` din browser; nu există încă prag blocant.
- Benchmark Replay sintetic în PR CI: 100 evenimente = 0,610 ms; 1.000 = 3,791 ms; 10.000 = 13,852 ms pe runner Linux x64 / Node 22.23.5. Sunt măsurători de referință, nu SLA.
- Issue #5 rămâne deschis pentru analiza mutanților supraviețuitori și revizuirea performanței/heap la volume mari; PR #14 a integrat fixture-ul legacy fără schemaVersion, UI coverage 78,39%, testele Core focalizate și testele extinse stock.change (PR #16).
- Issue #4 rămâne pentru validarea manuală a aplicației în browser; testele automate nu o înlocuiesc.

## 10. Reguli pentru următoarea sesiune

1. Începe prin a citi acest document și issue #4 (validarea manuală rămasă).
2. Nu cere utilizatorului să reexplice proiectul sau să refacă pași verificați.
3. Nu crea o nouă versiune ZIP pentru o modificare mică dacă se poate integra în branch/PR-ul curent.
4. Nu afirma că un bug este reparat doar pentru că există un test; separă testele automate de validarea manuală în browser.
5. Nu modifica datele din exportul utilizatorului și nu solicita reimport decât dacă există o justificare tehnică și un backup confirmat.
6. Integrarea v11 este deja în `main`; pentru modificări viitoare, lucrează prin branch/PR și verifică diff-ul înainte de merge.
7. Marchează explicit ce este implementat, ce este testat automat, ce este testat manual și ce este doar planificat.

## 11. Artifacte de referință

- Release testat: `Collector-MVP-v11-AI-Foundation-Attribute-Range-Fix-v0.7.zip`.
- Snapshot continuare arhivat în Library: `/Collector/Collector-MVP-v11-CONTINUARE-v0.7.zip`.
- Audit faza 0: `docs/architecture/AI-FOUNDATION-PHASE0-AUDIT.md`.
- AI Foundation: `docs/architecture/Collector-AI-Foundation-v0.1.md`.
- Registrul de decizii: `Decizio.md`.
- Issue P0 închis (integrare): https://github.com/davidlucian-ioan/Aplicatie/issues/2
- Issue curent P1 (validare manuală în browser): https://github.com/davidlucian-ioan/Aplicatie/issues/4
- Issue P1 (faza 3 testare: mutation, cross-browser, offline, migrare): https://github.com/davidlucian-ioan/Aplicatie/issues/5
- Strategie de testare: `docs/testing/TEST-STRATEGY-v1.md`.
- PR de integrare v11: https://github.com/davidlucian-ioan/Aplicatie/pull/3
- PR testare faza 1: https://github.com/davidlucian-ioan/Aplicatie/pull/6
- PR hardening Core faza 2: https://github.com/davidlucian-ioan/Aplicatie/pull/7
- Workflow CI: `.github/workflows/collector-quality.yml` — se execută la schimbări în aplicație, documentația root/testing, PR-uri și nocturn.

**Actualizare 2026-11-23:** PR #17 este integrat (`dcabf912c4c32abe53e69b3afdb8b14e5c0bf067`): corectarea unei mutări supersedate este idempotentă, fără să afecteze locația curentă sau soldul; testele `stock.reverse` acoperă inversarea vânzărilor și mutărilor, evenimente fără efecte de stoc și rollback după consum parțial. PR #18 este integrat (`e713ff35d54f6d54f541dd88ee3b6a29b3848ae2`): validatorul timestamp respinge offset-uri ISO 8601 în afara ±14:00 și acceptă limita validă. PR #19 este integrat (`37ee6fc07111869b234313618f5550f5af8072df`): testele acoperă corectarea mai multor relații dintr-un eveniment, relații deja închise, evenimente fără relații și rollback la inversarea unei mutări după vânzare parțială în destinație. PR #20 este integrat (`3d627eb7d119a16f71f6adbab5694b143f940bb2`): o corecție stale este marcată separat ca ignorată (`ignoredCorrectionByEventId`), nu ca relație anulată; o corecție ulterioară a mutării descendente poate redeschide relația precedentă corect, iar Replay reproduce starea. CI a trecut pentru PR #17–#20 (runs #45245225951, #45245432917, #45246231904 și #45246497191). Următorul pas este trierea supraviețuitorilor Stryker relevanți (`stock.reverse`, `relation.create.correct`, `commit`) și revizuirea performanței la 50.000 de evenimente. Nu compara scorul focalizat de 31,35% cu baseline-ul complet de 65,81%; raportul complet este pre-PR #15–#20. Validarea manuală din issue #4 rămâne separată și necesită confirmarea utilizatorului în browser; nu afirma că a fost făcută automat.

**Actualizare 2026-11-23 — PR #21 integrat:** `3c79d5bd8b43e1396919172c0b87e6a9d828a0bc`. Idempotency verificat explicit pentru duplicate după event ID și intentKey; operațiile duplicate nu sunt aplicate din nou și întorc evenimentul original. Commit-urile compuse sunt atomice la eșecul unei operații ulterioare. CI complet trecut (run #45247173561).

**PR #22 în lucru:** https://github.com/davidlucian-ioan/Aplicatie/pull/22. Se întărește validarea `stock.reverse` pentru toate categoriile de stoc, nu doar soldul activ. Testele țintesc situația în care o ajustare ulterioară epuizează categoria `sold` sau `disposed`, iar inversarea unui eveniment istoric ar crea un sold negativ. Primele două rulari CI au eșuat din cauza unor aserțiuni/fixture-uri incorecte; testele au fost revizuite și noua rulare este în desfășurare. Nu se integrează până la CI complet verde.


Actualizare 2026-11-23: PR #22 a fost integrat; vezi commitul și verificarea de mai jos. PR #23 și PR #24 tratează corecțiile relațiilor, iar PR #25 validează allowlist-ul acțiunilor de stoc. Toate folosesc date sintetice.


PR #22 integrat (`27c7d41bb69691dfa46f3adbf5783649b606f77e`): `stock.reverse` și `stock.adjust` verifică soldurile nenegative pentru toate dispozițiile (`active`, `sold`, `disposed`); CI complet trecut (run #45248325717). PR #23 integrat (`72dd222ec214e26ddb7ac09358adb7d6f41d2b21`): `relation.close.correct` nu poate reactiva o relație a cărei creare a fost anulată și nu poate crea două relații `located_in` active pentru aceeași entitate; CI complet trecut (run #45249096170). PR #24 integrat (`ce7b6da569e0383dd2006a82c26808c850f34e71`): `relation.move.correct` nu mai redeschide o relație precedentă al cărei eveniment de creare a fost anulat; CI complet trecut după sincronizarea branch-ului cu main (run #45249873030).


PR #24 în lucru: `relation.move.correct` nu mai poate redeschide o relație precedentă al cărei eveniment de creare a fost anulat. Branch-ul a fost sincronizat cu main pentru a elimina conflictul introdus de PR #23; CI pe merge commit este în așteptare. PR #25 integrat (`c5c8571f46b7c1ddee47cf190d108dd1bb38c81b`): `stock.change` acceptă doar `add`, `sell`, `dispose`, `move_out`; `move_in` rămâne efect ledger intern, iar acțiunile necunoscute sunt respinse atomic. CI complet trecut (run #45249483938).


Benchmark Replay după PR #22 (run #45248706376, Node 22.23.5, Linux x64, AMD EPYC 9V45): 100 evenimente = 0,316 ms (~316k/s); 1.000 = 2,535 ms (~394k/s); 10.000 = 15,866 ms (~630k/s); 50.000 = 82,946 ms (~603k/s), heap delta median 8.964.824 bytes. Mix sintetic cu șase tipuri de operații, mediană din repetări; heap delta este orientativ, nu GC-normalizat. Nu este SLA și trebuie comparat doar pe aceeași platformă/metodologie.


PR #25 în lucru: stock.change folosește allowlist pentru acțiunile publice (add, sell, dispose, move_out); move_in rămâne efect ledger intern generat de move_out. Acțiunile necunoscute sunt respinse în loc să fie tratate implicit ca add. Teste de regresie și CI în așteptare.


PR #26 integrat (`8703993a5f7de3997b7ea50aef96c71d4af741bf`): `stock.adjust` validează referințele `locationId` nenule și respinge locațiile inexistente sau entitățile care nu sunt de tip `location`; teste de rollback atomic. CI complet trecut (run #45250493556).


PR #27 integrat (`68c58d15b3b3ad3ddc100874656a286b67da5feb`): `finance.adjust` validează `entityId` nenul împotriva entităților existente, la fel ca `finance.record`; test de regresie pentru referință lipsă. CI complet trecut (run #45251550928).


PR #28 integrat (`bc5a60a7097bd2a6832d48a8af7c43aef8734c39`): `event.attribute.set` trim-uiește numele și respinge valorile goale sau formate doar din spații; teste de rollback atomic. CI complet trecut (run #45251169429).


PR #29 este înlocuit de PR #32 după integrarea PR #30. PR #32 păstrează guard-ul de idempotency pentru `event.attribute.correct`, cu branch sincronizat la `main` și CI complet nou obligatoriu înainte de integrare.

**PR #30 integrat:** https://github.com/davidlucian-ioan/Aplicatie/pull/30
**Merge commit:** `43c385c7bfcfbe823a462e20c7325e9d48b09695`
- [x] Eveniment compus sell + dispose + move_out inversat atomic pe mai multe locații și dispoziții.
- [x] `balances()` tratează rândurile legacy fără `disposition` ca `active`.
- [x] Inversarea unui eveniment `stock.adjust` este testată; o corecție manuală deja legată blochează inversarea originalului.
- [x] Replay păstrează proiecțiile când o inversare ar produce sold negativ și înregistrează warning.
- [x] Triage semantic pentru raportul Stryker istoric (33 supraviețuitori și un timeout); nu se revendică un scor nou.
- [x] CI complet pentru head-ul PR #30: run #45252517108; CI post-merge pe `main`: run #45252907794.

**Verificare de integrare 2026-11-23:**
- PR #27 și #28 sunt integrate, cu CI complet trecut (run #45251550928, respectiv #45251169429).
- PR #30 este integrat, iar `main` este la `43c385c7bfcfbe823a462e20c7325e9d48b09695`; CI post-merge a trecut.
- PR #29 rămâne deschis doar până când PR #32, care conține aceeași corecție pe un branch sincronizat, trece CI complet.
- Nu există deploy; s-au folosit exclusiv date sintetice.


## Actualizare continuare — 23.11.2026 (PR #27–#38)

**Main curent la această actualizare:** `ce2d8d5b1a171c3276de2788ab9e82e307361f47`. CI post-merge pentru PR #37 a trecut (run #45259431332).

- **PR #27 integrat:** `finance.adjust` validează referințele `entityId`; CI PR #45251550928 și verificările post-merge au trecut.
- **PR #29 nu a fost integrat:** branch-ul vechi a fost închis după ce fixul `event.attribute.correct` a fost mutat pe branch sincronizat în PR #32. PR #32 a trecut CI (#45254003367), a fost integrat în `main` (`2ac1f6ed5a2f5977b2f51f896c14705309c5b4bf`), iar CI post-merge a trecut (#45254408338).
- **PR #37 integrat:** `relation.create.correct` respinge evenimentele de mutare; acestea trebuie corectate prin `relation.move.correct`, care inversează atât relația, cât și ledger-ul de stoc. Testul acoperă commit și Replay rollback. PR CI #45259027370 și post-merge #45259431332 au trecut. Merge commit: `ce2d8d5b1a171c3276de2788ab9e82e307361f47`.
- **PR #38 deschis:** validare pentru cantități financiare, referințe de corecție și corecții legate duplicate. Head curent `21540641f4b7aaffcae9f654d067756aa3560a24`; testele Core/property/Replay/benchmark au trecut, dar instalarea Firefox/WebKit și E2E cross-browser sunt încă în desfășurare (run #45259804511). Nu se integrează până la CI complet verde.

**Stryker:** ultimul full-suite rămâne 65,81% (run #45237194442), raport istoric pre-PR #15–#38. Nu există scor complet nou pentru codul curent; testele PR nu rulează full Stryker, care rămâne nocturn. Triage semantic pentru finance, relații, atribute și Replay este în issue #5.

**Următorii pași:** finalizează PR #38 numai după CI complet verde; apoi extinde protecția la redefinirea atributelor deja folosite în proiecțiile entity/relation/event și continuă trierea mutanților pe comportament real. Validarea manuală din issue #4 rămâne restantă; date sintetice, fără provider AI real și fără deploy.

## Continuare checkpoint — 2026-11-25 (PR #55 / Work UX hardening)

**Branch:** `feature/openai-provider-integration` · **PR #55 draft, target main**. Nu se face merge și nu se configurează servicii de producție fără aprobare explicită.

### Modificări recente
- Draft Work autosave folosește StorageAdapter (web/local, SQLite nativ), fără acces direct din app la localStorage.
- Restore asincron este protejat de input race: draftul recuperat nu suprascrie textul introdus între timp.
- Clear draft invalidează restore-ul pending chiar și când textarea este deja goală; eliminarea draftului este confirmată de storage/status.
- Controls/template quick actions aliniate în toate cele 3 entry points: `index.html`, `index-server.html`, `Deschide-prin-dublu-click.html`.
- Work draft status este aria-live; clear control și quick templates sunt vizibile, draftul nu este event până la preview/confirm.
- Test static de wiring adăugat pentru controale și race guard.

### CI
- Head verificat după modificări: `ea653506ee3b428b5703083a9600822c54601f50` (CI în curs la momentul checkpointului).
- O rundă quality a detectat o aserțiune regex incorect escapata în testul nou, nu defect în UI; aserțiunea a fost înlocuită cu verificare exactă `includes()` și runda nouă a fost pornită.
- Cloud API pe head-ul anterior `72975b774e43910016537b5a3eaff415ea91eada` a trecut. Mobile și quality pentru head-ul curent trebuie confirmate complet, non-cancelled.
- E2E existent acoperă autosave, reload/restore, clear-confirm și templates; trebuie urmărită runda CI nouă pentru rezultate.

### Next actions
1. Confirmă CI complet pe head curent; dacă runda este anulată de commits noi, verifică ultima rundă completă, nu cea anulată.
2. Inspectează rapoartele Playwright/cross-browser și repară regresiile.
3. Continuă Work: teste de draft race, audio/voice lifecycle, notificări și UX pentru confirmarea preview.
4. Revizuire securitate cloud/billing și checklist de testare sandbox, fără deploy sau tranzacții reale.
5. Păstrează PR #55 draft până la acceptanța manuală și aprobarea utilizatorului.

## Launch hardening checkpoint — 2026-11-25 (PR #55)

**Branch:** `feature/openai-provider-integration` · **HEAD:** `bef71efdc306f4db13554ba5931af2a53ab45a1b` · **PR #55 remains draft**.

### Work / UI / recorder
- All three HTML entry points (`index.html`, `index-server.html`, `Deschide-prin-dublu-click.html`) are aligned for Think page headers/filters and Work-first DOM order (recorder → command → reminders); subscriptions client is loaded in all three.
- Fixed malformed CSS `repeat()` in finance metrics that caused browsers to ignore later Work layout rules. Removed a stray `</div>` from Work markup and normalized escaped line breaks in Work styles.
- Fixed E2E navigation tests to open the mobile sidebar before selecting a Think page, verify filters only while their page is active, and target the actual Add Attribute action.
- Browser audio checkpoint chunks are now persisted as ArrayBuffer, with MIME metadata and ordered recovery; recovery can still read the previous Blob row shape. This fixed WebKit IndexedDB rejection seen in the previous cross-browser run.
- Native AAC checkpoint/recovery remains in place; recovery is best-effort if the OS terminates the recording process before a native URI/private file is available.

### CI evidence on this HEAD
- Collector Cloud API: **success**, run #402.
- Collector Quality Suite: **success**, run #1601 — Core/unit/property/Replay/benchmark plus Chromium, Firefox and WebKit Playwright E2E.
- Collector Mobile Build: Android debug APK job **success**, run #704; iOS simulator job is still queued/pending. Do not describe the whole mobile workflow as fully passed until iOS job succeeds.
- Android artifact: `collector-android-debug`, APK debug only (not signed Play Store AAB). Artifact was downloaded for manual device testing.
- Earlier WebKit run #1599 failed only in browser-chunk persistence; ArrayBuffer serialization was the targeted fix validated by the new #1601 E2E pass.
- Earlier Chromium E2E failures were traced to bad test navigation/selector assumptions, malformed CSS and extra markup close tag; fixes are covered by tests.

### Additional launch risk identified
- There is no unified in-app “erase all local data” flow in the inspected app. Current capabilities include export/import, individual record deletion, Work draft clearing and separate cloud account deletion, but deleting the cloud account explicitly leaves device-local data. Treat a documented and tested full-local-erasure workflow (Core journal, drafts, audio files/checkpoints, reminder metadata and native notifications) as a **P0 privacy launch gate**. Do not imply the current UI already provides it.
- SQLite is still configured with `encrypted:false` / `no-encryption`. Do not toggle it without secure-key management and a tested migration path for existing databases.
- Supabase/RevenueCat production projects, Cloud API HTTPS deployment, production secrets, real webhook configuration, purchase/restore/refund sandbox tests and account lifecycle verification remain unconfigured/unverified.
- Android artifact is debug. Signed AAB/Play App Signing and signed iOS Archive/IPA/TestFlight are not complete.
- No real-device acceptance has been performed for Android/iOS audio interruption/background, Bluetooth routing, native notifications/Doze/Focus, upgrade/migration and storage-full cases.
- Privacy/Terms docs remain internal drafts with operator/contact/vendor/region/retention/legal-review placeholders. Do not publish them.
- Multi-device sync/cloud backup is not implemented and must not be marketed as available.
- Mobile dependency versions are directly pinned in the workflow but the full native toolchain/transitive graph is not yet locked in the main package-lock; deterministic mobile installs remain a reproducibility task.

### Next actions
1. Confirm iOS simulator build for run #704; Android debug passed, but the mobile workflow is not fully green while iOS is queued.
2. Install the debug APK on a real Android phone and run audio capture/playback/recovery, app restart, notification permissions, Doze/background and upgrade/migration checks with synthetic data.
3. Implement and test a full local-data erasure flow before public beta; include reminders/native notifications and audio files, with explicit irreversible confirmation and clear cloud-subscription separation.
4. Design/implement encrypted SQLite storage using secure key storage and non-destructive migration; verify recovery and uninstall/reinstall behavior.
5. Configure staging Supabase/Cloud API/RevenueCat/OpenAI and complete sandbox purchase/restore/refund/expiry tests before production keys/deploy.
6. Produce signed Android/iOS store artifacts, publish reviewed privacy/terms/support URLs, and complete store data-safety declarations.
7. Keep PR #55 draft; no merge, production deployment, real billing or public store release without explicit approval.
