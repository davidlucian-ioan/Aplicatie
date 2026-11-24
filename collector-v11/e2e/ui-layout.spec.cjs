'use strict';

const { test, expect } = require('@playwright/test');

test('layout mobil: meniu lateral, continut fara overflow si actiuni accesibile', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Regresie de layout măsurată în Chromium.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/index-server.html');

  const menu = page.locator('#menuToggle');
  const sidebar = page.locator('#appSidebar');
  await expect(menu).toBeVisible();
  await expect(sidebar).not.toHaveClass(/open/);

  await menu.click();
  await expect(sidebar).toHaveClass(/open/);
  await expect(page.locator('.sidebar-backdrop')).toHaveClass(/visible/);
  await page.locator('.nav[data-page="inventory"]').click();
  await expect(page.locator('#inventory')).toBeVisible();
  await expect(sidebar).not.toHaveClass(/open/);

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    main: Math.round(document.querySelector('main').getBoundingClientRect().width)
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.main).toBeGreaterThan(340);
  await expect(page.locator('#inventory .toolbar button')).toHaveCount(2);
  await expect(page.locator('#inventory .toolbar button').first()).toBeVisible();
});

test('layout desktop: sidebar fixa si dashboard cu actiuni grupate', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Regresie de layout măsurată în Chromium.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/index-server.html');

  await expect(page.locator('#appSidebar')).toBeVisible();
  await expect(page.locator('#dashboard')).toBeVisible();
  await expect(page.locator('#dashboard .cards .card')).toHaveCount(4);
  await expect(page.locator('#dashboard .quick-grid button')).toHaveCount(5);

  const layout = await page.evaluate(() => {
    const sidebar = document.querySelector('#appSidebar').getBoundingClientRect();
    const main = document.querySelector('main').getBoundingClientRect();
    const cards = document.querySelector('#dashboard .cards').getBoundingClientRect();
    return { sidebarRight: sidebar.right, mainLeft: main.left, cardsWidth: cards.width };
  });
  expect(layout.mainLeft).toBeGreaterThanOrEqual(layout.sidebarRight);
  expect(layout.cardsWidth).toBeGreaterThan(900);
});
