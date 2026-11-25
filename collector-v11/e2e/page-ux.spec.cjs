'use strict';

const { test, expect } = require('@playwright/test');

test('Think pages expose consistent titles and searchable list controls', async ({ page }) => {
  await page.goto('/index-server.html');
  for (const [pageName, heading] of [
    ['entities', 'Entități'],
    ['relations', 'Relații și locații'],
    ['inventory', 'Populații și solduri'],
    ['finance', 'Financiar'],
    ['attributes', 'Atribute'],
    ['events', 'Evenimente'],
    ['history', 'Istoric'],
    ['audit', 'Audit și integritate']
  ]) {
    await page.locator('.nav[data-page="' + pageName + '"]').click();
    await expect(page.locator('#' + pageName + ' .page-intro h2')).toHaveText(heading);
  }
  for (const target of ['relationList','locationList','stockList','financeList','attributeList','eventList','auditList']) {
    await expect(page.locator('[data-filter-target="' + target + '"]')).toBeVisible();
  }
});

test('generic list filters are case-insensitive and restore rows when cleared', async ({ page }) => {
  await page.goto('/index-server.html');
  await page.locator('.nav[data-page="events"]').click();
  const list = page.locator('#eventList');
  await list.evaluate(el => { el.innerHTML = '<div class="row">Greenhouse PH check</div><div class="row">Plant moved to shelf</div>'; });
  const filter = page.locator('[data-filter-target="eventList"]');
  await filter.fill('GREENHOUSE');
  await expect(list.locator('.row:visible')).toHaveCount(1);
  await expect(list).toContainText('Greenhouse PH check');
  await filter.clear();
  await expect(list.locator('.row:visible')).toHaveCount(2);
});

test('Work layout is single-column on mobile and touch controls remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/index-server.html');
  await page.locator('.nav[data-page="assistant"]').click();
  const columns = await page.locator('#assistant').evaluate(el => getComputedStyle(el).gridTemplateColumns);
  expect(columns.trim().split(/\\s+/).length).toBe(1);
  await expect(page.locator('#audioRecordStart')).toBeVisible();
  await expect(page.locator('#reminderTitle')).toBeVisible();
  await expect(page.locator('#commandInput')).toBeVisible();
});
