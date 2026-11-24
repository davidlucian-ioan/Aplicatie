'use strict';

const { test, expect } = require('@playwright/test');

test('voice transcription is blocked while the native recorder owns the microphone', async ({ page }) => {
  await page.addInitScript(() => {
    window.__recognitionStarts = 0;
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: class {
      start() { window.__recognitionStarts += 1; this.onstart?.(); }
      stop() { this.onend?.(); }
    } });
    window.CollectorAndroidRecorder = {
      isAvailable: () => true,
      getRecordingState: async () => ({ status: 'recording', id: 'native-active' })
    };
  });
  await page.goto('/index-server.html');
  await page.locator('.nav[data-page="work"]').click();
  await expect(page.locator('#audioRecorderStatus')).toContainText('Înregistrarea nativă este activă');
  await page.locator('#voiceSessionButton').click();
  await expect(page.locator('#commandResult')).toContainText('Reportofonul folosește microfonul');
  await page.locator('#voiceButton').click();
  await expect(page.locator('#commandResult')).toContainText('Reportofonul folosește microfonul');
  expect(await page.evaluate(() => window.__recognitionStarts)).toBe(0);
});

test('audio recording is blocked while a voice transcription session owns the microphone', async ({ page }) => {
  await page.addInitScript(() => {
    window.__getUserMediaCalls = 0;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia: async () => { window.__getUserMediaCalls += 1; return { getTracks: () => [{ stop() {} }] }; }
    } });
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: class {
      start() { this.onstart?.(); }
      stop() { this.onend?.(); }
    } });
  });
  await page.goto('/index-server.html');
  await page.locator('.nav[data-page="work"]').click();
  await page.locator('#voiceSessionButton').click();
  await expect(page.locator('#appStatus')).toContainText('Sesiune vocală activă');
  await page.locator('#audioRecordStart').click();
  await expect(page.locator('#audioRecorderStatus')).toContainText('Oprește sesiunea vocală');
  expect(await page.evaluate(() => window.__getUserMediaCalls)).toBe(0);
});

test('voice transcription is blocked during the asynchronous recorder-start window', async ({ page }) => {
  await page.addInitScript(() => {
    window.__startRequested = false;
    window.__recognitionStarts = 0;
    window.CollectorAndroidRecorder = {
      isAvailable: () => true,
      getRecordingState: async () => ({ status: 'inactive' }),
      startRecording: () => { window.__startRequested = true; return new Promise(() => {}); }
    };
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: class {
      start() { window.__recognitionStarts += 1; this.onstart?.(); }
      stop() { this.onend?.(); }
    } });
  });
  await page.goto('/index-server.html');
  await page.locator('.nav[data-page="work"]').click();
  await page.locator('#audioRecordStart').click();
  await expect.poll(() => page.evaluate(() => window.__startRequested)).toBe(true);
  await page.locator('#voiceSessionButton').click();
  await expect(page.locator('#commandResult')).toContainText('Reportofonul folosește microfonul');
  expect(await page.evaluate(() => window.__recognitionStarts)).toBe(0);
});

test('voice capture fails closed until the native recorder state is confirmed', async ({ page }) => {
  await page.addInitScript(() => {
    window.__recognitionStarts = 0;
    window.__stateChecks = 0;
    window.CollectorAndroidRecorder = {
      isAvailable: () => true,
      getRecordingState: () => { window.__stateChecks += 1; return new Promise(() => {}); }
    };
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: class {
      start() { window.__recognitionStarts += 1; this.onstart?.(); }
      stop() { this.onend?.(); }
    } });
  });
  await page.goto('/index-server.html');
  await page.locator('.nav[data-page="work"]').click();
  await page.locator('#voiceSessionButton').click();
  await expect(page.locator('#appStatus')).toContainText('Verific starea reportofonului Android');
  await page.locator('#voiceButton').click();
  await expect(page.locator('#appStatus')).toContainText('Verific starea reportofonului Android');
  expect(await page.evaluate(() => window.__stateChecks)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__recognitionStarts)).toBe(0);
});

test('native recorder start fails closed until its existing service state is confirmed', async ({ page }) => {
  await page.addInitScript(() => {
    window.__nativeStarts = 0;
    window.CollectorAndroidRecorder = {
      isAvailable: () => true,
      getRecordingState: () => new Promise(() => {}),
      startRecording: () => { window.__nativeStarts += 1; return Promise.resolve({ recordingId: 'unexpected' }); }
    };
  });
  await page.goto('/index-server.html');
  await page.locator('.nav[data-page="work"]').click();
  await page.locator('#audioRecordStart').click();
  await expect(page.locator('#audioRecorderStatus')).toContainText('Verific starea reportofonului Android');
  expect(await page.evaluate(() => window.__nativeStarts)).toBe(0);
});
