'use strict';

const { test, expect } = require('@playwright/test');

test('Android web bundle starts cleanly and mobile navigation responds', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/www/index.html');
  await expect(page.locator('#work')).toBeVisible();
  await page.locator('#menuToggle').click();
  await page.locator('.nav[data-page="dashboard"]').click();
  await expect(page.locator('#dashboard')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__collectorStartupDiagnostics && window.__collectorStartupDiagnostics.ready)).toBe(true);
  const startupDiagnostics = await page.evaluate(() => window.__collectorStartupDiagnostics.snapshot());
  expect(startupDiagnostics.appReady).toBe(true);
  expect(startupDiagnostics.engine).toBe(true);
  expect(startupDiagnostics.corePort).toBe(true);
  expect(startupDiagnostics.nativeRecorder).toBe(true);
  expect(startupDiagnostics.errors).toEqual([]);

  const scriptStatus = await page.evaluate(() => ({
    engine: Boolean(window.CollectorEngine),
    corePort: Boolean(window.CollectorBrowserCorePort),
    androidBridge: Boolean(window.CollectorAndroidRecorder),
    appScript: Array.from(document.scripts).some(script => script.src.endsWith('/app.js?v=0.7')),
    nativeScript: Array.from(document.scripts).some(script => script.src.endsWith('/android-native-entry.js'))
  }));
  expect(scriptStatus.engine).toBe(true);
  expect(scriptStatus.corePort).toBe(true);
  expect(scriptStatus.androidBridge).toBe(true);
  expect(scriptStatus.appScript).toBe(true);
  expect(scriptStatus.nativeScript).toBe(true);

  await page.locator('#menuToggle').click();
  await expect(page.locator('#appSidebar')).toHaveClass(/open/);
  await page.locator('.nav[data-page="entities"]').click();
  await expect(page.locator('#entities')).toBeVisible();
  await expect(page.locator('#appSidebar')).not.toHaveClass(/open/);

  await page.locator('#entities .toolbar button.primary').click();
  await expect(page.locator('#modal')).not.toHaveClass(/hidden/);
  await expect(page.locator('#modalContent')).toContainText(/entitate|nume/i);

  expect(pageErrors).toEqual([]);
});
