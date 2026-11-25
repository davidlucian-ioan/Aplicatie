# Collector — Product Strategy Workshop
**Date:** 25 November 2026
**Participants (simulated multidisciplinary review):** Project Manager, IT/Architecture Engineer, QA/Test Engineer, Finance/Accounting, Representative End User.
**Basis:** PRE-LAUNCH-SWOT-AUDIT-2026-11-25.md and current Collector v11 repository state. This is a simulated expert review, not interviews with real people.

## Executive decision
Collector should not compete as another generic spreadsheet/database or as a specialist catalog with a huge preloaded database. Position it as **the easiest, most trustworthy way to capture, organize, understand, and grow any personal collection** — voice-first/mobile-first, customizable, local-first, AI-assisted but user-controlled.

**North-star outcome:** a user can add/update an item in under 20 seconds with voice/photo/manual, without losing control or needing to understand schemas; later they can find it, know where it is, what changed, what it is worth (where reliable), and what to do next.

## Meeting notes by role

### 1) Project Manager
- Do not add feature breadth before stabilizing launch blockers.
- Product must be understandable in the first minute: create a collection, add an item, see a useful result.
- Use staged delivery: launch with excellent capture/catalog/search; add AI enrichment and specialist add-ons only after usage proves demand.
- Avoid a launch message that promises sync, background recording, or valuation accuracy before these are implemented/validated.
- Proposed product KPI: activation = first collection created + first 3 items captured in first session; retention = user returns and adds/updates/finds items weekly.

### 2) IT / Architecture Engineer
- Keep Core local-first and AI outside the execution boundary. AI outputs proposals; Core validates; user confirms.
- Build one generic collection model with templates/packs, not one app or hard-coded schema per hobby.
- Templates should define field sets, validation, views, lifecycle/relationship types, reminders and starter dashboards. Templates are configuration, not separate code paths.
- Do not rush sync: first define stable IDs, event semantics, schema migrations, conflict model, deletion/restore and offline behavior.
- AI should be tool/action constrained, allowlisted, context-minimized, cost-metered, and auditable.
- Priority architecture work: dependency lock reproducibility, physical device reliability, migration recovery, export/backup integrity, release automation.

### 3) QA / Test Engineer
- User trust is the product: incorrect AI identification, lost recordings, false reminders, corrupted migration or duplicate records can kill retention.
- Release gates should test the end-to-end happy path and destructive/recovery paths on real devices.
- Required capture test: voice/photo -> candidate extraction -> review -> save -> search -> edit -> export -> restore.
- Add adversarial tests: noisy voice, ambiguity, duplicate, multiple entities, partial transcript, incorrect dates/quantities, offline, app killed, storage full, permissions denied.
- Measure defects per 100 capture sessions, capture success rate, recovery success, duplicate rate and AI proposal acceptance/rejection.
- AI must visibly distinguish **known**, **inferred**, and **unknown**; never silently invent provenance, price, dates, identity or condition.

### 4) Finance / Accounting
- Avoid unlimited AI usage bundled into a cheap subscription until unit economics are known.
- Use free core to lower adoption barrier; monetize advanced convenience and heavy usage, not the user's ownership/access to their data.
- AI usage should have fair-use allowance or credits, cost caps, transparent usage and refunds/failed-scan policy.
- Before price finalization, measure: cost per active user, AI cost per successful capture/enrichment, cloud/storage cost, store fees, support cost, gross margin, conversion, churn and refund rate.
- Do not launch too many tiers. Test one Pro tier plus optional consumable AI credits only if usage/cost data supports it.
- Keep export/backup and basic collection access available; subscription cancellation should not trap user data.

### 5) Representative End User
- Wants to add an item while hands are busy; doesn't want 20 fields or category setup.
- Wants the app to understand a photo/voice note but asks to review before it changes the record.
- Wants quick search and filters, locations/containers, duplicate warning, notes, photos, history and reminders.
- Needs custom fields because no two collections are alike.
- Wants useful results immediately: collection count, what is missing, where items are stored, recent changes and a simple value/condition overview.
- Does not want an “AI chat” that is separate from the collection and doesn't actually update it.
- Strong preference: the app should remain usable offline, fast, and never force cloud/AI for ordinary capture.

## Market / competitor read (web research, current at review)
- iCollect Everything offers many built-in collection types, custom collections, barcode scanning, photo AI lookup, cloud sync, wishlist, estimated value, filtering/bulk edit and export. This means generic cataloging and AI identification alone are not enough to differentiate.
- Libib offers mixed-media cataloging, ISBN/UPC scanning, metadata, tags, notes, cloud sync, import/export and free tier up to 5,000 items across up to 100 collections; Pro adds circulation, custom fields, management and reporting. This makes easy catalog + free cloud sync a competitive baseline in media/library niches.
- Sortly emphasizes inventory workflow: custom fields/folders, QR/barcodes, photos, offline access, sync, alerts, reports and team/job workflows. Collector should not attempt to out-enterprise it initially.
- Notion/Airtable are flexible general-purpose systems but users have to build workflows; Collector's opportunity is an opinionated collection-native experience and effortless capture, not more table features.
- Kolekto positions as collector-built, unlimited collection/category/item/image organization, custom attributes and a marketplace. It reinforces the importance of specialist community and collection sharing as future opportunities.

Sources:
- iCollect Everything guide: https://www.icollecteverything.com/support/
- Libib pricing/features: https://www.libib.com/pricing
- Sortly features: https://www.sortly.com/features/
- Airtable mobile differences: https://support.airtable.com/articles/9609457174-airtable-desktop-and-mobile-feature-differences
- Kolekto: https://www.kolekto.io/

## Product positioning decision
**Collector = personal collection operating system.**
Tagline direction (not final marketing copy): *“Your collection, captured in seconds. Organized your way.”*

Primary differentiators to prove:
1. Voice-first capture for hands-busy contexts.
2. Universal customizable collection model, with ready-made templates.
3. AI-assisted enrichment that is safe, explainable and confirm-before-save.
4. Timeline/history and relationships—not just static item rows.
5. Local-first privacy and reliable offline capture.
6. Collection insights that answer practical questions, not vanity graphs.

## Product roadmap: recommended priorities

### P0 — Launch foundation (no new feature scope)
1. CI green on one exact SHA and checkpoint.
2. Lock native toolchain and dependencies; clean npm ci reproducibility.
3. Physical Android/iOS validation: audio, interruptions, background, notifications, storage, restart/recovery.
4. Data safety: migration/encryption recovery, backup/export and clear deletion semantics. Encryption stays OFF until sign-off.
5. Fix onboarding and first-use UX: create collection -> add first item -> see value.
6. Reliability instrumentation (privacy-preserving): capture success/failure, crash, latency, AI acceptance and cost. Consent and disclosure required.
7. Release pipeline, staging, billing sandbox, privacy/legal/store readiness.

### P1 — “Wow” value in first week
1. **Quick Capture:** one tap, voice/photo/text, no form first; review a concise extracted card; save.
2. **Universal templates:** Plants, books/media, electronics, collectibles, tools, aquarium livestock, etc. Starter templates should be illustrative and expandable—not permanent category lock-in.
3. **Smart search:** natural-language search across names, tags, notes, attributes and relationships; local-first where possible.
4. **Duplicate detection:** exact and fuzzy candidates with review; never merge automatically.
5. **Locations & containers:** room/shelf/box/zone; QR labels later.
6. **Collection dashboard:** total items, additions, missing fields, recent changes, reminders and value only when user-defined or supported by credible sources.
7. **Import/export:** CSV/XLSX (phase), clean mapping preview, validation, duplicate handling, undo/backup.
8. **Bulk operations:** safe multi-select edits, tag, move, location update, export.

### P2 — Premium features with validated demand
1. AI enrichment from photos/voice and web sources with source citations, confidence and “not found” state.
2. AI collection assistant grounded only in user's records: “What did I buy last month?”, “Which plants need attention?”, “Do I already own X?”, “Show duplicates/missing information.”
3. Smart reminders and recurring care/maintenance/inspection/renewal rules configurable by template.
4. Advanced analytics: acquisition timeline, category distribution, cost basis, user-entered value, condition changes, growth/progression.
5. Public read-only collection pages, share selected collection/item and privacy controls.
6. Wishlist/targets, acquisition planning, budget and “avoid duplicate purchase” alerts.
7. Optional QR/NFC physical labels and scan-to-open item.
8. Photo timeline / condition tracking and comparisons.

### P3 — Future add-ons / moat
1. **Collection Packs/vertical modules:** domain-specific workflows, field sets, reminders, calculators and AI prompts, installed as add-ons without fragmenting app.
2. **Expert/community verification:** opt-in, moderated corrections, source-backed identification of rare/ambiguous items; reputation and versioned data.
3. **Market data integrations:** valuation ranges, sales comparables, provenance, source freshness and confidence; never present an AI guess as market price.
4. **Marketplace / trade / lending:** only after audience density and trust; optional, no dark patterns.
5. **Multi-user/family/teams:** shared collections, permissions, change history and sync conflict handling.
6. **Automations:** rules such as “when acquired, create care/maintenance reminders,” “if item missing data, ask next capture,” or “when value changes materially, notify”—with user approval.
7. **AI memory scoped to collection:** persistent user-approved preferences and domain context, not uncontrolled cross-collection memory.
8. **Open integrations/API/export:** interoperability to avoid lock-in; potential ecosystem advantage.
9. **Advanced offline/local AI:** evaluate only if hardware, latency and accuracy economics justify.
10. **AR inventory / visual shelf map:** later, niche and expensive; validate before development.

## Recommended business model (test, not commit)
- **Free:** core collection, capture, custom fields/templates, search, basic reminders, local access, export/backup path. Avoid artificially restricting ownership of user data.
- **Pro:** higher limits/convenience, advanced analytics, cross-device sync/cloud backup (only once built), advanced AI allowance, richer templates, bulk tools, history, share controls.
- **AI add-on credits:** optional only if heavy AI use creates variable costs; transparent pricing and refund failed/low-confidence scans.
- **Collection Packs:** one-time purchase or included in Pro; validate user demand before marketplace-style monetization.
- No final prices until cost and conversion tests.

## UX principles
1. Capture before classification: don't force a form to start.
2. Every AI action shows proposed changes and confidence/source; user can accept/edit/reject.
3. One primary action per screen; Work stays focused on capture and alarms.
4. Think provides search, review, insights, settings, bulk, analytics.
5. Empty states teach by doing, not lengthy tutorials.
6. Templates are reversible; user can change schema without losing data.
7. Fast and offline behavior are explicit.
8. Accessibility, large text, one-handed use and localization from launch.

## Metrics / experiments
North star: **weekly useful collection actions per active user** (capture, update, find, export, reminder action) with quality guardrails.
- Activation: first collection + 3 items captured in first session.
- Time-to-capture: median under 20 seconds for simple item.
- Capture success: target >95% for supported conditions; establish baseline before claim.
- AI proposal acceptance: track accepted/edited/rejected by field, not only total.
- Duplicate rate and correction rate.
- D7/D30 retention; weekly active collectors.
- Pro conversion, churn, refunds.
- AI cost per active user and per successful enrichment; gross margin.
- Crash-free sessions, data-loss incidents (target zero), recovery success.
- User satisfaction after first capture and first search.

## Decisions / next actions
1. **Do not add new major features before P0 stability and launch gates.**
2. Focus Work screen on the best-in-class quick capture flow.
3. Validate user needs with 5–10 target users from different collection types before deciding initial templates.
4. Build 3–5 high-quality starter templates based on actual users, not a long generic list.
5. Make AI the assistant layer, not the app's identity.
6. Ensure export/ownership/trust are strong differentiators.
7. Design Pro around proven recurring value; not a paywall around basic record keeping.
8. Add a post-launch feedback/feature voting mechanism with transparent roadmap.
9. Plan add-ons modularly; do not implement marketplace, valuation, sync, QR/NFC, community or AR until usage data proves priority.

## Proposed first 90 days after stability
- Phase 1: closed beta, capture reliability, first-use UX and templates.
- Phase 2: improve search, duplicates, locations, bulk/import/export based on feedback.
- Phase 3: cloud sync/account recovery/Pro and AI enrichment only after privacy/cost/reliability validated.
- Phase 4: one add-on pack chosen by usage data; test willingness to pay.


## Product direction correction — Collection Intelligence is CORE (user clarified)

The user clarified that **Collection Intelligence is standard/core, not a paid add-on**. Collector is intended to be an intelligent voice recorder and app-wide memory that knows the user's actions and records across the app and can retrieve/replay relevant history whenever asked.

### Product promise
“Collector remembers what you captured and did in the app, so you can ask later and recover the relevant details.” It must cover app activity, not only audio transcripts: recordings, transcripts, summaries, saved items/collection records, edits, confirmed AI actions, reminders, decisions, notes and relationships—subject to privacy settings and what the user explicitly records/does.

### Core memory architecture (proposed; do not imply already implemented)
- **Event/Activity Ledger:** append-only, provenance-aware records of meaningful user actions, confirmed changes and captured content; distinguish user statements, user-confirmed facts, inferred AI suggestions and system events.
- **Knowledge/Memory Index:** derived searchable index across records (keyword + semantic retrieval when available); references source record IDs, timestamps and collection/item IDs.
- **Temporal retrieval:** answer “what did I do/decide/change/buy/record last week/month?”; filter by date, collection, item, type and source.
- **Grounded answers:** every factual response should link to source(s), with timestamps or jump-to-audio/transcript; explicitly say unknown or insufficient evidence rather than fabricate.
- **Replay/recall UX:** return a concise answer and the underlying timeline/evidence; user can open the exact recording, transcript segment, event or item record.
- **Memory lifecycle:** user can review, correct, pin, exclude, delete/export; deletion must propagate to derived indexes. Respect retention, consent, privacy and local/cloud boundaries.
- **Core data semantics:** standard collection intelligence is available to all users; advanced AI processing may be subject to transparent usage limits/cost controls, but basic history/search/retrieval should not be positioned as a Pro-only feature.

### Core experience examples
- “What have I done with this collection this month?”
- “When did I last change this item's location and why?”
- “What did I say about this issue last time?”
- “Which reminders or tasks did I create, and which are completed?”
- “Summarize everything I recorded about X and show me the source moments.”
- “What changed since my previous update?”

### Product positioning revised
Collector is **an intelligent recorder + persistent, searchable memory of the user's activity and collections**, with capture-first Work and recall/analysis in Think. Collection Intelligence is part of the base product value, not a separate add-on. Future paid add-ons may include specialist packs, sync/storage, advanced external research/market data or integrations—not the basic ability to remember and query what the user did in Collector.

### Next engineering discovery
Before implementation, audit existing data/event structures and identify a canonical event model; map current records (audio, transcripts, reminders, item/collection changes, confirmed AI actions) to that model without duplicating authoritative Core state. Create a source-linked retrieval architecture and a phased implementation/test plan. Prioritize reliable retrieval and provenance over a large “AI memory” feature. Do not change D-001–D-044 without an impact review.


## Product/business model correction — trial-led subscription (user clarified, 26 Nov 2026)

### Decision
Collector will **not be Free forever with a broad feature set**. The acquisition/retention strategy is a generous time-limited full-featured trial (initial test: 30 days; campaigns/early adopters may test 60–90 days), followed by a paid subscription. The objective is habit formation and recurring long-term value: user captures naturally, Collector organizes and remembers, and recall becomes useful enough to justify continuing.

### Trial experience
During trial, provide a coherent, near-complete Pro experience, including Work capture, app-wide Collection Intelligence/recall, AI assistance, collection organization, reminders, history and advanced insights, within transparent fair-use/cost limits. Avoid feature-tour overload: optimize for habitual workflows and the first meaningful value moments.

Activation targets to validate: create a collection, capture 3 items, make at least one voice capture, and successfully retrieve/recall something. These are hypotheses/experiments, not established benchmarks.

### Post-trial product boundary
- Keep user data, recordings, collection records and export/access rights intact; never hold data hostage.
- A limited Basic mode may preserve local access and basic management after trial, but premium/costly processing and advanced convenience may require subscription.
- Collection Intelligence is a core product promise, not a separately marketed addon. Basic history/data access should remain available; the subscription can fund full conversational/advanced recall, processing capacity and premium workflows, with clear limits and no deceptive paywall.
- AI usage caps, fair-use policy, cost alerts and transparent failure/low-confidence handling are needed to protect unit economics.

### Subscription hypotheses (not final pricing)
- Full trial: initially 30 days; test 60/90-day acquisition campaigns only where justified.
- One primary Pro subscription with monthly and discounted annual options; keep tiers simple.
- Basic post-trial fallback: access/ownership, local basic use, and export; define exact capabilities after entitlement audit.
- No final prices until measured AI/cloud/store/support costs, conversion, retention, refunds and gross margin.

### Habit and conversion design
- Optimize for repeated useful capture and recall, not a feature checklist.
- Trigger contextual subscription messaging at meaningful premium moments (advanced AI analysis, high-cost processing, advanced insight), not aggressive generic nags.
- Trial-expiry messaging should summarize demonstrated value/usage and explain what changes; preserve data and avoid manipulative urgency.
- Offer annual plan as a transparent long-term value option; don't use dark patterns.

### Metrics
Track trial activation and conversion by behavior cohort: first collection/3 items, voice capture, active days/weeks, recall queries and successful source-grounded retrieval, accepted AI proposals, trial-to-paid, monthly-to-annual, churn at 1/3/6 months, refunds, cost per trial/paid active user, AI cost per successful outcome, gross margin and crash/data-loss guardrails. Instrument only with disclosure/consent and privacy minimization.

### Required implementation impact audit before code changes
Audit existing RevenueCat/subscription/entitlement/usage-metering implementation, app onboarding, paywall, trial messaging, expiry handling, settings/restore purchases, backend authorization, and launch checklist. Map what already exists, identify mismatches, and change only after confirming current state. Trial entitlement must be server/store-authoritative and testable in sandbox; don't hard-code an expiry or unlock premium solely client-side. Trial/expiry, cancellation, renewal, grace/billing issue, restore and account deletion require tests. No live billing configuration or production deployment without explicit approval.
