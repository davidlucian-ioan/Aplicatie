'use strict';

const { test, expect } = require('@playwright/test');

test('THINK oferă analiză de activitate și navigare către zonele de date', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/index-server.html');

  await expect(page.locator('#work')).toBeVisible();
  await page.locator('#menuToggle').click();
  await page.locator('.nav[data-page="dashboard"]').click();
  await expect(page.locator('#dashboard')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Înțelege ce se întâmplă.' })).toBeVisible();
  await expect(page.locator('#thinkActivityChart .think-day')).toHaveCount(7);
  await expect(page.locator('#thinkActivitySummary')).toContainText('ultimele 7 zile');

  for (const target of ['entities', 'relations', 'inventory', 'finance', 'attributes', 'audit']) {
    await page.locator('[data-think-target="' + target + '"]').click();
    await expect(page.locator('#' + target)).toBeVisible();
    await page.locator('#menuToggle').click();
    await page.locator('.nav[data-page="dashboard"]').click();
  }

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
});

test('THINK poate reveni direct în WORK', async ({ page }) => {
  await page.goto('/index-server.html');
  await page.locator('.nav[data-page="dashboard"]').click();
  await page.locator('.think-return-work').click();
  await expect(page.locator('#work')).toBeVisible();
});
