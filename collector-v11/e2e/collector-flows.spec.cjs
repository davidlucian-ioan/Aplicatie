'use strict';

const { test, expect } = require('@playwright/test');

async function createLocation(page, name) {
  await page.locator('.nav[data-page="relations"]').click();
  await page.locator('#relations .toolbar button.primary').first().click();
  await page.locator('#locName').fill(name);
  await page.locator('#modal button.primary').click();
}

async function createEntity(page, name, type = 'generic') {
  await page.locator('.nav[data-page="entities"]').click();
  await page.locator('#entities .toolbar button.primary').click();
  await page.locator('#newName').fill(name);
  await page.locator('#newType').fill(type);
  await page.locator('#modal button.primary').click();
  return page.evaluate(entityName => {
    const db = JSON.parse(localStorage.getItem('collector_mvp_v2'));
    return db.entities.find(entity => entity.name === entityName)?.id;
  }, name);
}

async function createPopulation(page, name, quantity, locationId) {
  await page.locator('.nav[data-page="inventory"]').click();
  await page.locator('#inventory .toolbar button.secondary').click();
  await page.locator('#popName').fill(name);
  await page.locator('#popType').fill('Fancy Tiger');
  await page.locator('#popQty').fill(String(quantity));
  if (locationId) await page.locator('#popLoc').selectOption(locationId);
  await page.locator('#modal button.primary').click();
  return page.evaluate(populationName => {
    const db = JSON.parse(localStorage.getItem('collector_mvp_v2'));
    return db.entities.find(entity => entity.name === populationName)?.id;
  }, name);
}

async function readBalances(page, populationName) {
  return page.evaluate(name => {
    const db = JSON.parse(localStorage.getItem('collector_mvp_v2'));
    const population = db.entities.find(entity => entity.name === name);
    const names = new Map(db.entities.map(entity => [entity.id, entity.name]));
    return window.CollectorEngine.balances(db)
      .filter(row => row.populationId === population?.id)
      .map(row => ({
        location: names.get(row.locationId) || null,
        disposition: row.disposition,
        quantity: row.quantity
      }))
      .sort((a, b) => `${a.location}:${a.disposition}`.localeCompare(`${b.location}:${b.disposition}`));
  }, populationName);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/index-server.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('mută și vinde stoc, apoi păstrează soldurile după refresh', async ({ page }) => {
  await createLocation(page, 'B1');
  await createLocation(page, 'B2');
  const locations = await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('collector_mvp_v2'));
    return Object.fromEntries(db.entities.filter(entity => entity.type === 'location').map(entity => [entity.name, entity.id]));
  });

  const populationId = await createPopulation(page, 'Fancy E2E', 10, locations.B1);
  expect(populationId).toBeTruthy();

  await page.locator('#inventory .toolbar button.primary').click();
  await page.locator('#stockPop').selectOption(populationId);
  await page.locator('#stockAction').selectOption('move_out');
  await page.locator('#stockLoc').selectOption(locations.B1);
  await page.locator('#stockDest').selectOption(locations.B2);
  await page.locator('#stockQty').fill('3');
  page.on('dialog', async dialog => {
    if (dialog.type() === 'prompt') await dialog.dismiss();
    else await dialog.accept();
  });
  await page.locator('#modal button.primary').click();

  let balances = await readBalances(page, 'Fancy E2E');
  expect(balances).toEqual([
    { location: 'B1', disposition: 'active', quantity: 7 },
    { location: 'B2', disposition: 'active', quantity: 3 }
  ]);

  await page.reload();
  await page.locator('.nav[data-page="inventory"]').click();
  balances = await readBalances(page, 'Fancy E2E');
  expect(balances).toEqual([
    { location: 'B1', disposition: 'active', quantity: 7 },
    { location: 'B2', disposition: 'active', quantity: 3 }
  ]);

  await page.locator('#inventory .toolbar button.primary').click();
  await page.locator('#stockPop').selectOption(populationId);
  await page.locator('#stockAction').selectOption('sell');
  await page.locator('#stockLoc').selectOption(locations.B2);
  await page.locator('#stockQty').fill('2');
  await page.locator('#modal button.primary').click();

  balances = await readBalances(page, 'Fancy E2E');
  expect(balances).toEqual([
    { location: 'B1', disposition: 'active', quantity: 7 },
    { location: 'B2', disposition: 'active', quantity: 1 },
    { location: 'B2', disposition: 'sold', quantity: 2 }
  ]);
});

test('înregistrează pH 5.2 în afara intervalului recomandat, cu avertisment', async ({ page }) => {
  await createEntity(page, 'Acvariu E2E', 'aquarium');

  await page.locator('.nav[data-page="attributes"]').click();
  await page.locator('#attributes .toolbar button.primary').click();
  await page.locator('#attrName').fill('pH');
  await page.locator('#attrType').selectOption('number');
  await page.locator('#attrOwner').selectOption('entity');
  await page.locator('#attrMin').fill('5.5');
  await page.locator('#attrMax').fill('6.5');
  await page.locator('#modal button.primary').click();

  await page.locator('.nav[data-page="assistant"]').click();
  await page.locator('#commandInput').fill('Înregistrează atributul pH pentru Acvariu E2E = 5.2');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#parseCommand').click();

  await expect(page.locator('#confirmCoreCommand')).toBeVisible();
  await page.locator('#confirmCoreCommand').click();
  await expect(page.locator('#commandResult')).toContainText('Salvat cu succes');

  await page.reload();
  const value = await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('collector_mvp_v2'));
    return db.entities.find(entity => entity.name === 'Acvariu E2E')?.attributes?.pH;
  });
  expect(value).toBe(5.2);
});

test('preview anulat nu persistă evenimentul', async ({ page }) => {
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events.length);

  await page.locator('.nav[data-page="assistant"]').click();
  await page.locator('#commandInput').fill('Observație: această comandă va fi anulată');
  await page.locator('#parseCommand').click();
  await expect(page.locator('#confirmCoreCommand')).toBeVisible();
  await page.locator('#cancelCoreCommand').click();
  await expect(page.locator('#commandResult')).toContainText('Comandă anulată');

  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events.length);
  expect(after).toBe(before);
});

test('importul cu proiecții incompatibile nu înlocuiește datele existente', async ({ page }) => {
  await createEntity(page, 'Date de păstrat', 'generic');
  const before = await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('collector_mvp_v2'));
    return { events: db.events.map(event => event.id), names: db.entities.map(entity => entity.name) };
  });

  await page.locator('.nav[data-page="audit"]').click();
  const dialogPromise = page.waitForEvent('dialog');
  await page.locator('#importFile').setInputFiles({
    name: 'import-corupt.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      db: {
        events: [],
        entities: [{ id: 'ghost', name: 'Date injectate', type: 'generic', attributes: {} }]
      }
    }))
  });
  const dialog = await dialogPromise;
  expect(dialog.message()).toContain('Import eșuat');
  await dialog.accept();

  const after = await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('collector_mvp_v2'));
    return { events: db.events.map(event => event.id), names: db.entities.map(entity => entity.name) };
  });
  expect(after).toEqual(before);
});
