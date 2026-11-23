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


test('Replay din interfață reconstruiește proiecțiile fără avertismente', async ({ page }) => {
  await createLocation(page, 'Replay B1');
  const locationId = await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('collector_mvp_v2'));
    return db.entities.find(entity => entity.name === 'Replay B1')?.id;
  });
  await createPopulation(page, 'Replay Fancy', 9, locationId);

  const before = await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('collector_mvp_v2'));
    return {
      eventCount: db.events.length,
      entityCount: db.entities.length,
      balances: window.CollectorEngine.balances(db)
    };
  });

  await page.locator('.nav[data-page="audit"]').click();
  await page.getByRole('button', { name: 'Verifică replay' }).click();
  await expect(page.locator('#modalContent pre')).toContainText('"warnings": []');
  await expect(page.locator('#modalContent pre')).toContainText('"events":');

  page.once('dialog', dialog => dialog.accept());
  await page.locator('#modalContent').getByRole('button', { name: 'Reconstruiește proiecțiile' }).click();

  const after = await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('collector_mvp_v2'));
    return {
      eventCount: db.events.length,
      entityCount: db.entities.length,
      balances: window.CollectorEngine.balances(db),
      warnings: db.meta.replayWarnings || []
    };
  });
  expect(after.eventCount).toBe(before.eventCount);
  expect(after.entityCount).toBe(before.entityCount);
  expect(after.balances).toEqual(before.balances);
  expect(after.warnings).toEqual([]);
});

test('backup JSON valid poate fi exportat și restaurat fără datele adăugate ulterior', async ({ page }) => {
  await createEntity(page, 'Entitate backup originală', 'plant');
  await page.locator('.nav[data-page="audit"]').click();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export JSON' }).click()
  ]);
  const backupPath = await download.path();
  expect(backupPath).toBeTruthy();
  const backupBuffer = await require('node:fs/promises').readFile(backupPath);

  await createEntity(page, 'Entitate adăugată după backup', 'plant');
  const currentCount = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).entities.length);
  expect(currentCount).toBe(2);

  const dialogMessages = [];
  page.on('dialog', async dialog => {
    dialogMessages.push(dialog.message());
    await dialog.accept();
  });
  await page.locator('.nav[data-page="audit"]').click();
  await page.locator('#importFile').setInputFiles({
    name: 'collector-backup-e2e.json',
    mimeType: 'application/json',
    buffer: backupBuffer
  });
  await expect.poll(() => dialogMessages.length).toBe(2);
  expect(dialogMessages[0]).toContain('Jurnal valid');
  expect(dialogMessages[1]).toContain('Import reușit');

  const restored = await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('collector_mvp_v2'));
    return db.entities.map(entity => entity.name);
  });
  expect(restored).toContain('Entitate backup originală');
  expect(restored).not.toContain('Entitate adăugată după backup');
  expect(restored).toHaveLength(1);
});

test('numele cu markup HTML sunt afișate ca text și nu execută scripturi', async ({ page }) => {
  await page.evaluate(() => { window.__collectorXssExecuted = false; });
  const maliciousName = '<img src=x onerror="window.__collectorXssExecuted=true">';
  await page.locator('.nav[data-page="entities"]').click();
  await page.locator('#entities .toolbar button.primary').click();
  await page.locator('#newName').fill(maliciousName);
  await page.locator('#newType').fill('generic');
  await page.locator('#modal button.primary').click();

  await expect(page.locator('#entityList')).toContainText(maliciousName);
  await expect(page.locator('#entityList img')).toHaveCount(0);
  expect(await page.evaluate(() => window.__collectorXssExecuted)).toBe(false);

  await page.locator('.nav[data-page="audit"]').click();
  await expect(page.locator('#auditList')).toContainText(maliciousName);
  expect(await page.evaluate(() => window.__collectorXssExecuted)).toBe(false);
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

test('eșecul localStorage nu păstrează în memorie un eveniment neconfirmat de persistență', async ({ page }) => {
  await page.evaluate(() => {
    const originalSetItem = Storage.prototype.setItem;
    window.__collectorFailNextPersist = true;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'collector_mvp_v2' && window.__collectorFailNextPersist) {
        window.__collectorFailNextPersist = false;
        throw new DOMException('Simulated storage quota failure', 'QuotaExceededError');
      }
      return originalSetItem.call(this, key, value);
    };
  });

  page.once('dialog', dialog => dialog.accept());
  await page.locator('.nav[data-page="entities"]').click();
  await page.locator('#entities .toolbar button.primary').click();
  await page.locator('#newName').fill('Entitate eșuată');
  await page.locator('#newType').fill('generic');
  await page.locator('#modal button.primary').click();

  const afterFailure = await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('collector_mvp_v2'));
    return db.entities.map(entity => entity.name);
  });
  expect(afterFailure).not.toContain('Entitate eșuată');

  await page.locator('#entities .toolbar button.primary').click();
  await page.locator('#newName').fill('Entitate salvată ulterior');
  await page.locator('#newType').fill('generic');
  await page.locator('#modal button.primary').click();

  await page.reload();
  const afterReload = await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('collector_mvp_v2'));
    return db.entities.map(entity => entity.name);
  });
  expect(afterReload).toContain('Entitate salvată ulterior');
  expect(afterReload).not.toContain('Entitate eșuată');
});
