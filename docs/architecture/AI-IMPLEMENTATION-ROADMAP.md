# Collector — AI implementation roadmap

Updated: 2026-11-24

## Product constraints

- Collector remains local-first. Core is the source of operational truth.
- AI interprets and proposes; Collector Core validates, previews, persists and projects.
- No provider receives the database object or direct access to Core writes.
- WORK remains voice-first and usable when AI, network, speech recognition or a provider is unavailable.
- Context expires after 30 minutes; permanent memory and operational history remain separate.
- D-001–D-044 remain authoritative.

## Gate A — safe AI/Core boundary

Status: implemented in `feature/ai-foundation-core-contract`; CI validation pending.

- [x] Strict input, interpretation, command, read-request and Core-result validation.
- [x] Core-aligned operation shape: `{ operation, target?, data }`.
- [x] Explicit AI write allowlist and high-risk confirmation policy.
- [x] Preview does not persist.
- [x] Execute persists before publishing UI state.
- [x] Concurrent AI writes are serialized.
- [x] Idempotency key is supplied by the trusted gateway, not the model.
- [x] Proposal is stored and explicit confirmation executes the exact pending command.
- [x] Operational answers are generated only after Core retrieval.
- [x] Browser and Node Core Port parity tests.
- [x] Provider payload excludes gateway identifiers and forwards only whitelisted transcript metadata.
- [x] Core read requests are scoped; unfiltered entity-registry reads are rejected and entity details are returned only by resolved ID.
- [ ] GitHub Quality CI and Android build pass on the final PR head.

## Gate B — reliable voice input

Status: partially implemented.

- [x] Local audio capture and playback.
- [x] Android foreground recorder architecture and permission flow.
- [x] Recorder/STT microphone ownership arbitration.
- [x] Spoken read-back and explicit confirmation.
- [x] Android on-device Romanian model capability probe (does not capture audio).
- [ ] Implement actual Android on-device `SpeechRecognizer` capture using only `createOnDeviceSpeechRecognizer`; no generic/cloud fallback.
- [ ] Stream interim/final transcript updates to WORK without committing events.
- [ ] Preserve segment-level timestamps, language, recognition confidence and source metadata.
- [ ] Link each transcript segment to its originating audio recording and time range.
- [ ] Test pause/resume/stop, Activity recreation, screen-off, app switching, interruptions and recorder handoff on physical Android devices.
- [ ] Validate Romanian transcription quality on a representative local test set.

## Gate C — real provider integration

Status: not started; provider choice intentionally remains open.

- [ ] Choose deployment mode: cloud provider behind a server-side gateway, local model runtime, or hybrid.
- [ ] Agree on data policy: which text/context can leave the device, retention, consent and budget.
- [ ] Implement provider adapter methods `interpret()` and `respond()` with strict structured output.
- [ ] Keep all provider credentials server-side. Never bundle API keys in browser assets or Android APK.
- [ ] Add authentication/rate limits/timeouts/retry and safe provider error handling at the gateway.
- [ ] Add model/provider/version telemetry without logging unnecessary personal or operational data.
- [ ] Connect AI to WORK text and transcript input; do not make AI required for deterministic local capture.
- [ ] Use Core Read Adapter for questions about current data; never let the model invent balances, attributes or history.
- [ ] Route every write through proposal → preview → explicit confirmation → Core execute.
- [ ] Keep model-generated output untrusted, including any instructions found in imported documents or stored notes.

## Gate D — quality and release

- [ ] Build a Romanian evaluation set covering plants, aquariums, inventory, finance and projects.
- [ ] Measure intent accuracy, entity resolution, ambiguity detection, quantity/unit extraction, confidence calibration and unsupported claims.
- [ ] Include adversarial tests: duplicate names, missing targets, uncertain quantities, stale context, prompt injection, retries, network loss and duplicate submissions.
- [ ] Require zero unauthorized writes and zero write-path bypasses in regression tests.
- [ ] Benchmark latency and cost for the selected provider/model.
- [ ] Confirm offline degradation: recording, local data, preview of deterministic commands and manual workflows remain available.
- [ ] Physical-device acceptance and backup/restore verification before release.

## Next execution order

1. Merge/validate the safe Core boundary PR after CI.
2. Finish actual Android on-device Romanian STT and timestamp-linked transcript.
3. Run a Romanian quality benchmark and document the result.
4. Select provider mode and data policy.
5. Implement the server-side provider gateway and connect the Orchestrator.
6. Add AI UI to WORK, then expand to THINK/read-only analytics.
