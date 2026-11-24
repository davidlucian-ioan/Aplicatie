'use strict';

const { test, expect } = require('@playwright/test');

test('mobile navigation opens, selects a section and closes accessibly', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/index-server.html');

  const sidebar = page.locator('#appSidebar');
  const toggle = page.getByRole('button', { name: 'Deschide meniul' });
  await expect(toggle).toBeVisible();
  await expect(sidebar).toBeHidden();

  await toggle.click();
  await expect(sidebar).toBeVisible();
  await expect(page.locator('#menuToggle')).toHaveAttribute('aria-expanded', 'true');

  await page.getByRole('button', { name: 'Entități' }).click();
  await expect(page.locator('#entities')).toBeVisible();
  await expect(sidebar).toBeHidden();
  await expect(page.locator('.nav[data-page="entities"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#menuToggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#menuToggle')).toBeFocused();
});

test('global action starts a local audio recording without committing an event', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() { window.__audioTrackStopped = true; } }] }) } });
    window.__audioTrackStopped = false;
    window.__wakeLockRequests = 0;
    window.__wakeLockReleases = 0;
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => { window.__wakeLockRequests += 1; let released = false; return { get released() { return released; }, addEventListener() {}, release: async () => { if (!released) { released = true; window.__wakeLockReleases += 1; } } }; } } });
    window.MediaRecorder = class {
      static isTypeSupported() { return true; }
      constructor(stream, options) { this.stream = stream; this.mimeType = options?.mimeType || 'audio/webm'; this.state = 'inactive'; }
      start() { this.state = 'recording'; this.onstart?.(); }
      pause() { this.state = 'paused'; this.onpause?.(); }
      resume() { this.state = 'recording'; this.onresume?.(); }
      stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['audio-sample'], { type: this.mimeType }) }); this.onstop?.(); }
    };
  });
  await page.goto('/index-server.html');
  await page.locator('.nav[data-page="work"]').click();
  await page.locator('#globalVoice').click();
  await expect(page.locator('#work')).toBeVisible();
  await expect(page.locator('#audioRecorderStatus')).toContainText('Înregistrare audio activă');
  await expect(page.locator('#audioRecorderStatus')).toContainText('Ecranul este menținut activ');
  expect(await page.evaluate(() => window.__wakeLockRequests)).toBe(1);
  await expect(page.locator('#audioRecordPause')).toBeEnabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events.length)).toBe(0);
  await page.locator('#audioRecordPause').click();
  await expect(page.locator('#audioRecordResume')).toBeEnabled();
  await expect.poll(() => page.evaluate(() => window.__wakeLockReleases)).toBe(1);
  await page.locator('#audioRecordResume').click();
  await expect(page.locator('#audioRecordStop')).toBeEnabled();
  await expect.poll(() => page.evaluate(() => window.__wakeLockRequests)).toBe(2);
  await page.locator('#audioRecordStop').click();
  await expect(page.locator('#audioRecorderStatus')).toContainText('Înregistrare salvată local');
  await expect.poll(() => page.evaluate(() => window.__wakeLockReleases)).toBe(2);
  await expect(page.locator('#audioRecordingList')).toContainText('KB');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events.length)).toBe(0);
  expect(await page.evaluate(() => window.__audioTrackStopped)).toBe(true);
  await page.reload();
  await page.locator('.nav[data-page="work"]').click();
  await expect(page.locator('#audioRecordingList')).toContainText('KB');
  expect(await page.evaluate(async () => (await window.CollectorAudioStore.list()).length)).toBe(1);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: /Șterge înregistrarea din/ }).click();
  await expect(page.locator('#audioRecordingList')).toContainText('Nu există înregistrări audio locale');
  expect(await page.evaluate(async () => (await window.CollectorAudioStore.list()).length)).toBe(0);
});

test('desktop navigation exposes the current section to assistive technology', async ({ page }) => {
  await page.goto('/index-server.html');
  await expect(page.getByRole('navigation', { name: 'Secțiuni Collector' })).toBeVisible();
  await expect(page.locator('.nav[data-page="work"]')).toHaveAttribute('aria-current', 'page');

  await page.getByRole('button', { name: 'Istoric' }).click();
  await expect(page.locator('#history')).toBeVisible();
  await expect(page.locator('.nav[data-page="history"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.nav[data-page="dashboard"]')).not.toHaveAttribute('aria-current', 'page');
});

test('voice entry degrades to accessible text input when speech recognition is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: undefined });
    Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: undefined });
  });
  await page.goto('/index-server.html');
  await page.locator('.nav[data-page="work"]').click();
  await page.locator('#voiceSessionButton').click();

  await expect(page.locator('#work')).toBeVisible();
  await expect(page.locator('#commandResult')).toContainText('Sesiunea vocală nu este disponibilă');
  await expect(page.locator('#commandInput')).toBeFocused();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events.length)).toBe(0);
});


test('voice session accumulates multiple phrases and previews one note without auto-committing', async ({ page }) => {
  await page.addInitScript(() => {
    window.__collectorRecognition = null;
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: class {
      start() { window.__collectorRecognition = this; this.onstart?.(); }
      stop() { this.onend?.(); }
    } });
  });
  await page.goto('/index-server.html');
  await page.locator('.nav[data-page="work"]').click();
  await page.locator('#voiceSessionButton').click();
  await expect(page.locator('#voiceSessionButton')).toContainText('Oprește transcrierea');
  await page.evaluate(() => {
    const rec = window.__collectorRecognition;
    const first = [{ transcript: 'B3 are pH 6.4' }]; first.isFinal = true;
    const second = [{ transcript: 'Temperatura este 22 de grade' }]; second.isFinal = true;
    rec.onresult({ resultIndex: 0, results: [first, second] });
  });
  await expect(page.locator('#commandInput')).toHaveValue('B3 are pH 6.4 Temperatura este 22 de grade');
  await page.locator('#voiceSessionButton').click();
  await expect(page.locator('#confirmCoreCommand')).toBeVisible();
  await expect(page.locator('#commandResult')).toContainText('Observație');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events.length)).toBe(0);
  await page.locator('#confirmCoreCommand').click();
  await expect(page.locator('#commandResult')).toContainText('Salvat cu succes');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events.length)).toBe(1);
});

test('voice session fallback keeps text entry available when speech recognition is unsupported', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: undefined });
    Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: undefined });
  });
  await page.goto('/index-server.html');
  await page.locator('.nav[data-page="work"]').click();
  await page.locator('#voiceSessionButton').click();
  await expect(page.locator('#commandResult')).toContainText('Sesiunea vocală nu este disponibilă');
  await expect(page.locator('#commandInput')).toBeFocused();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events.length)).toBe(0);
});


test('one-shot dictation remains available for structured commands', async ({ page }) => {
  await page.addInitScript(() => {
    window.__oneShotStarts = 0;
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: class {
      start() { window.__oneShotStarts += 1; this.onstart?.(); }
      stop() { this.onend?.(); }
    } });
  });
  await page.goto('/index-server.html');
  await page.locator('.nav[data-page="work"]').click();
  await page.getByRole('button', { name: 'Începe dictarea' }).click();
  await expect(page.locator('#voiceButton')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.__oneShotStarts)).toBe(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events.length)).toBe(0);
  await page.locator('#voiceButton').click();
  await expect(page.locator('#voiceButton')).toHaveAttribute('aria-pressed', 'false');
});


test('audio recorder reports denied microphone permission and keeps Core journal unchanged', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => { const error = new Error('permission denied'); error.name = 'NotAllowedError'; throw error; } } });
    window.MediaRecorder = class {};
  });
  await page.goto('/index-server.html');
  await page.locator('#globalVoice').click();
  await expect(page.locator('#audioRecorderStatus')).toContainText('Accesul la microfon a fost refuzat');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events.length)).toBe(0);
  expect(await page.evaluate(async () => (await window.CollectorAudioStore.list()).length)).toBe(0);
});
