# Collector — Stage C native validation checklist

Status: prepared for manual execution. These tests are **not** represented as completed by CI.
Target: PR #55 / mobile alpha. Use synthetic test data only; preserve user data.

## Preconditions
- [ ] Install the latest CI-generated Android debug APK on a physical device.
- [ ] Install the latest iOS simulator build on a simulator; physical iPhone validation requires a signed device build later.
- [ ] Record app version, commit SHA, OS version, device model, and test date.
- [ ] Confirm cloud/AI is disabled or points to a staging environment; no production secrets in test builds.
- [ ] Use a fresh test account and synthetic records.

## Work screen / capture
- [ ] Work is the initial screen after launch.
- [ ] Primary recorder controls are reachable with one hand and have accessible labels.
- [ ] Start → pause/resume (if supported) → stop → save produces a playable recording.
- [ ] Recording indicator and elapsed time remain correct during capture.
- [ ] Save, cancel, and delete have distinct, understandable outcomes.
- [ ] Rapid taps do not create duplicate recordings or corrupt state.
- [ ] Text draft autosaves; clear action does not resurrect stale text after relaunch.
- [ ] Voice/text capture failures are reported without losing the draft.

## Audio lifecycle / interruptions
- [ ] Denied microphone permission: explanation and recovery path; app does not crash.
- [ ] Permission granted after denial: recording works without force-restart if supported.
- [ ] Incoming call / audio interruption during recording: safe stop or interruption handling, no corrupt file.
- [ ] App background/foreground during recording: observe and document platform behavior; do not claim continuous background recording unless validated.
- [ ] Bluetooth headset route and wired/headset route where available.
- [ ] Long recording smoke test (30+ minutes) with screen lock/background; check file, playback, metadata and storage.
- [ ] Stop, playback, delete while playback active, then relaunch: no orphan player or stale metadata.
- [ ] Low-storage condition: graceful error, no silent data loss.
- [ ] Playback after relaunch and after device restart.

## Reminders / notifications
- [ ] Notification permission granted and denied flows.
- [ ] Create reminder, receive notification at expected time.
- [ ] Snooze, reschedule, cancel; confirm native notification state matches app state.
- [ ] Relaunch app and restart device; reminders persist and fire correctly.
- [ ] Android Doze/battery restrictions and iOS Focus behavior recorded.
- [ ] Time-zone/time change behavior and daylight-saving transition policy checked.

## Storage / upgrade / recovery
- [ ] Fresh install creates usable local store.
- [ ] Upgrade from legacy v7 data preserves entities, events, attributes, relationships and settings.
- [ ] Migration interrupted (test-only environment) recovers or fails closed without deleting source.
- [ ] SQLite corruption / missing secure key test is performed only on disposable fixture; recovery path is clear.
- [ ] Encryption gate is confirmed OFF in current build; do not test activation on user data.
- [ ] Temporary plaintext migration backup and cleanup behavior reviewed; no claim of encryption-at-rest until native validation and gate activation are approved.
- [ ] Cloud opt-out survives migration and remains respected.
- [ ] Export/backup expectations are communicated accurately (no multi-device sync/cloud backup promise).

## Offline-first and AI boundaries
- [ ] Core CRUD, Work capture, timeline and local data remain usable with airplane mode.
- [ ] AI unavailable, timeout, quota exhausted, unauthorized and rate-limited states are understandable.
- [ ] AI proposal is previewed and requires explicit confirmation before Core execution.
- [ ] Ambiguous/invalid AI proposal is rejected or asks clarification; no automatic execution.
- [ ] Confirm context minimization: audio/full journal not sent; only allowed text/context is sent.
- [ ] Verify no API key or service-role secret is present in client bundle/logs.

## Account / subscription sandbox (later, once external staging is configured)
- [ ] Email confirmation, sign-in, recovery and account deletion.
- [ ] Purchase, restore after reinstall, renewal, cancellation, refund, expiry and billing issue/grace period.
- [ ] Restore behavior is configured as “Keep with original App User ID” until transfer behavior is implemented/tested.
- [ ] Account deletion warning explains that store subscription cancellation is separate.
- [ ] Entitlement changes propagate safely; local-first features remain available if cloud is down.

## Results / release gate
For each test, record PASS / FAIL / BLOCKED / NOT TESTED, evidence, device/OS, and issue link.
- [ ] Android physical-device matrix completed.
- [ ] iOS physical-device matrix completed.
- [ ] All P0 failures fixed and retested.
- [ ] Full CI is green on one final SHA (Quality, Cloud API, Android, iOS).
- [ ] Signed release builds and store metadata are still separate gates.
- [ ] SQLite encryption is not enabled until migration, crash/quota/recovery, secure key, Core validation and physical-device tests all pass.

