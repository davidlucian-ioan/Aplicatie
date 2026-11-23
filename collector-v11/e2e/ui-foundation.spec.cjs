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
});

test('global voice action opens assistant and starts microphone capture without committing', async ({ page }) => {
  await page.addInitScript(() => {
    window.__collectorVoiceStarts = 0;
    window.SpeechRecognition = class {
      start() {
        window.__collectorVoiceStarts += 1;
        this.onstart?.();
      }
      stop() {
        this.onend?.();
      }
    };
  });

  await page.goto('/index-server.html');
  await page.getByRole('button', { name: 'Începe introducerea vocală' }).click();

  await expect(page.locator('#assistant')).toBeVisible();
  await expect(page.locator('#globalVoice')).toContainText('Ascult');
  await expect(page.locator('#appStatus')).toContainText('Ascult');
  expect(await page.evaluate(() => window.__collectorVoiceStarts)).toBe(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events.length)).toBe(0);

  await page.locator('#voiceButton').click();
  await expect(page.locator('#globalVoice')).toContainText('Vorbește');
  await expect(page.locator('#voiceButton')).toContainText('Dictează');
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
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
  });
  await page.goto('/index-server.html');
  await page.getByRole('button', { name: 'Începe introducerea vocală' }).click();

  await expect(page.locator('#assistant')).toBeVisible();
  await expect(page.locator('#commandResult')).toContainText('Dictarea vocală nu este disponibilă');
  await expect(page.locator('#commandInput')).toBeFocused();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events.length)).toBe(0);
});
