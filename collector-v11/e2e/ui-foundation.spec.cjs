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

test('global voice action opens assistant and starts microphone capture without committing', async ({ page }) => {
  await page.addInitScript(() => {
    window.__collectorVoiceStarts = 0;
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: class {
      start() {
        window.__collectorVoiceStarts += 1;
        this.onstart?.();
      }
      stop() {
        this.onend?.();
      }
    } });
  });

  await page.goto('/index-server.html');
  await page.locator('#globalVoice').click();

  await expect(page.locator('#assistant')).toBeVisible();
  await expect(page.locator('#globalVoice')).toContainText('Sesiune activă');
  await expect(page.locator('#appStatus')).toContainText('Sesiune vocală activă');
  expect(await page.evaluate(() => window.__collectorVoiceStarts)).toBe(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events.length)).toBe(0);

  await expect(page.locator('#voiceSessionButton')).toHaveAttribute('aria-label', 'Oprește sesiunea vocală');
  await page.locator('#globalVoice').click();
  await expect(page.locator('#globalVoice')).toContainText('Sesiune vocală');
  await expect(page.locator('#voiceSessionButton')).toContainText('Sesiune vocală');
});

test('desktop navigation exposes the current section to assistive technology', async ({ page }) => {
  await page.goto('/index-server.html');
  await expect(page.getByRole('navigation', { name: 'Secțiuni Collector' })).toBeVisible();
  await expect(page.locator('.nav[data-page="dashboard"]')).toHaveAttribute('aria-current', 'page');

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
  await page.locator('#globalVoice').click();

  await expect(page.locator('#assistant')).toBeVisible();
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
  await page.locator('#globalVoice').click();
  await expect(page.locator('#globalVoice')).toContainText('Sesiune activă');
  await page.evaluate(() => {
    const rec = window.__collectorRecognition;
    const first = [{ transcript: 'B3 are pH 6.4' }]; first.isFinal = true;
    const second = [{ transcript: 'Temperatura este 22 de grade' }]; second.isFinal = true;
    rec.onresult({ resultIndex: 0, results: [first, second] });
  });
  await expect(page.locator('#commandInput')).toHaveValue('B3 are pH 6.4 Temperatura este 22 de grade');
  await page.locator('#globalVoice').click();
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
  await page.locator('#globalVoice').click();
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
  await page.locator('.nav[data-page="assistant"]').click();
  await page.getByRole('button', { name: 'Începe dictarea' }).click();
  await expect(page.locator('#voiceButton')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.__oneShotStarts)).toBe(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events.length)).toBe(0);
  await page.locator('#voiceButton').click();
  await expect(page.locator('#voiceButton')).toHaveAttribute('aria-pressed', 'false');
});
