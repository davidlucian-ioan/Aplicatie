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

test('Think list filters remain usable without horizontal overflow on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/index-server.html');
  for (const [pageName, filterId] of [
    ['relations', 'relationList'],
    ['inventory', 'stockList'],
    ['finance', 'financeList'],
    ['attributes', 'attributeList'],
    ['events', 'eventList'],
    ['audit', 'auditList']
  ]) {
    await page.locator('.nav[data-page="' + pageName + '"]').click();
    const filter = page.locator('[data-filter-target="' + filterId + '"]');
    await expect(filter).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow, pageName + ' should not overflow horizontally').toBe(false);
  }
});

test('Work prioritizes the recorder before reminders on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/index-server.html');
  await page.locator('.nav[data-page="assistant"]').click();
  const recorderTop = await page.locator('.work-recorder').evaluate(el => el.getBoundingClientRect().top);
  const remindersTop = await page.locator('.work-reminders').evaluate(el => el.getBoundingClientRect().top);
  expect(recorderTop).toBeLessThan(remindersTop);
});

test('relations workspace uses a split desktop layout and stacks on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/index-server.html');
  await page.locator('.nav[data-page="relations"]').click();
  const desktop = await page.locator('.relations-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns);
  expect(desktop.trim().split(/\\s+/).length).toBe(2);
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.locator('.relations-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns);
  expect(mobile.trim().split(/\\s+/).length).toBe(1);
});
