'use strict';

const { test, expect } = require('@playwright/test');
const legacyV6Fixture = require('./fixtures/v6-missing-entity-create.json');
const legacyOldKeyFixture = require('./fixtures/legacy-old-key-no-schema.json');

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

test('Basic offline păstrează Work, Core local și jurnal fără acces AI cloud',async({page})=>{
 let aiRequests=0;
 await page.route('**/api/ai/interpret',async route=>{aiRequests++;await route.fulfill({status:503,body:'not available'})});
 await createEntity(page,'Collector Basic offline','generic');
 await page.locator('.nav[data-page="assistant"]').click();
 await page.locator('#commandInput').fill('Observație: test local fără abonament');
 await page.locator('#parseCommand').click();
 await expect(page.locator('#commandResult')).toContainText('Observație');
 await expect(page.locator('#workDraftStatus')).toContainText('salvat local');
 await page.reload();
 await page.locator('.nav[data-page="assistant"]').click();
 await expect(page.locator('#commandInput')).toHaveValue('Observație: test local fără abonament');
 const stored=await page.evaluate(()=>{const db=JSON.parse(localStorage.getItem('collector_mvp_v2'));return {entity:db.entities.some(e=>e.name==='Collector Basic offline'),events:db.events.map(e=>e.type),draft:localStorage.getItem('collector_work_command_draft_v1')}});
 expect(stored.entity).toBe(true);
 expect(stored.events.some(type=>String(type).toLowerCase().includes('note'))).toBe(false,'parse-only note command must not auto-commit');
 expect(stored.draft).toContain('test local fără abonament');
 expect(aiRequests).toBe(0,'local mode must not call AI endpoint');
 await expect(page.locator('#parseWithAI')).toBeDisabled();
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

test('Collector Basic fără entitlement păstrează funcțiile locale și exportul', async ({ page }) => {
  // Browser platform has no RevenueCat entitlement; local functionality must not depend on Pro.
  await createEntity(page, 'Entitate Basic păstrată', 'plant');
  const before = await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('collector_mvp_v2'));
    return { entityCount: db.entities.length, eventCount: db.events.length, names: db.entities.map(e => e.name) };
  });
  expect(before.entityCount).toBe(1);
  expect(before.eventCount).toBeGreaterThan(0);
  expect(before.names).toContain('Entitate Basic păstrată');

  await page.locator('.nav[data-page="audit"]').click();
  await expect(page.locator('#audit')).toContainText('Jurnal:');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export JSON' }).click()
  ]);
  const backup = JSON.parse(await require('node:fs/promises').readFile(await download.path(), 'utf8'));
  expect(backup.db.entities.map(e => e.name)).toContain('Entitate Basic păstrată');
  expect(backup.db.events.length).toBeGreaterThan(0);
  expect(backup.db.schemaVersion).toBe(7);
  expect(backup.format).toBe('collector-backup.v1');
  expect(backup.audioIncluded).toBe(false);
  expect(backup.audioNote).toContain('nu sunt incluse');
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
  const exportedBackup = JSON.parse(backupBuffer.toString('utf8'));
  expect(exportedBackup.audioIncluded).toBe(false);

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

test('import malformed JSON și backup fără schema validă sunt respinse fără a modifica datele', async ({ page }) => {
  await createEntity(page, 'Date locale protejate', 'generic');
  const before = await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('collector_mvp_v2'));
    return { events: db.events.map(event => event.id), names: db.entities.map(entity => entity.name), schemaVersion: db.schemaVersion };
  });

  await page.locator('.nav[data-page="audit"]').click();
  const invalidFiles = [
    { name: 'malformed.json', mimeType: 'application/json', buffer: Buffer.from('{broken-json') },
    { name: 'missing-schema.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ entities: [{ id: 'injected', name: 'Injected' }], events: [] })) }
  ];
  const errors = [];
  for (const file of invalidFiles) {
    const dialogPromise = page.waitForEvent('dialog');
    await page.locator('#importFile').setInputFiles(file);
    const dialog = await dialogPromise;
    errors.push(dialog.message());
    await dialog.accept();
  }
  expect(errors).toHaveLength(2);
  expect(errors.every(message => message.includes('Import eșuat'))).toBe(true);

  const after = await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('collector_mvp_v2'));
    return { events: db.events.map(event => event.id), names: db.entities.map(entity => entity.name), schemaVersion: db.schemaVersion };
  });
  expect(after).toEqual(before);
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

  // The failed form remains open so the user can correct or retry it.
  await page.locator('#modalContent .form-actions button.secondary').click();
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


test('startup-ul blochează proiecțiile divergente și reconstruiește numai după salvare reușită', async ({ page }) => {
  await createEntity(page, 'Entitate din jurnal', 'plant');
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('collector_mvp_v2'));
    db.entities[0].name = 'Proiecție divergentă';
    localStorage.setItem('collector_mvp_v2', JSON.stringify(db));
  });
  await page.reload();
  await page.locator('.nav[data-page="audit"]').click();
  await expect(page.locator('#auditSummary')).toContainText('MOD NUMAI CITIRE');

  await page.getByRole('button', { name: 'Verifică replay' }).click();
  await expect(page.locator('#modalContent pre')).toContainText('"warnings": []');

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
  let failedSaveMessage = '';
  page.once('dialog', async dialog => { failedSaveMessage = dialog.message(); await dialog.accept(); });
  await page.locator('#modalContent').getByRole('button', { name: 'Reconstruiește proiecțiile' }).click();
  expect(failedSaveMessage).toContain('nu a fost salvată');

  await page.locator('#modalContent button.secondary').click();
  await page.locator('.nav[data-page="entities"]').click();
  await expect(page.locator('#entityList')).toContainText('Proiecție divergentă');
  const stillDivergent = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).entities[0].name);
  expect(stillDivergent).toBe('Proiecție divergentă');

  await page.locator('.nav[data-page="audit"]').click();
  await page.getByRole('button', { name: 'Verifică replay' }).click();
  let successMessage = '';
  page.once('dialog', async dialog => { successMessage = dialog.message(); await dialog.accept(); });
  await page.locator('#modalContent').getByRole('button', { name: 'Reconstruiește proiecțiile' }).click();
  expect(successMessage).toContain('salvate cu succes');

  await page.locator('.nav[data-page="entities"]').click();
  await expect(page.locator('#entityList')).toContainText('Entitate din jurnal');
  await expect(page.locator('#entityList')).not.toContainText('Proiecție divergentă');
  await page.locator('.nav[data-page="audit"]').click();
  await expect(page.locator('#auditSummary')).not.toContainText('MOD NUMAI CITIRE');
});

test('rebuild refuză jurnalul invalid și păstrează proiecțiile existente', async ({ page }) => {
  await createEntity(page, 'Entitate păstrată', 'plant');
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('collector_mvp_v2'));
    db.events.push({
      id: 'invalid-startup-replay-event',
      type: 'invalid.test',
      timestamp: new Date().toISOString(),
      status: 'committed',
      operations: [{ operation: 'entity.rename', target: 'missing-entity', data: { name: 'Must not apply' } }]
    });
    localStorage.setItem('collector_mvp_v2', JSON.stringify(db));
  });
  await page.reload();
  await page.locator('.nav[data-page="audit"]').click();
  await expect(page.locator('#auditSummary')).toContainText('MOD NUMAI CITIRE');
  await expect(page.locator('#auditSummary')).toContainText(/Erori la replay: 1/);

  await page.getByRole('button', { name: 'Verifică replay' }).click();
  await expect(page.locator('#modalContent pre')).toContainText('invalid-startup-replay-event');
  let blockedMessage = '';
  page.once('dialog', async dialog => { blockedMessage = dialog.message(); await dialog.accept(); });
  await page.locator('#modalContent').getByRole('button', { name: 'Reconstruiește proiecțiile' }).click();
  expect(blockedMessage).toContain('Reconstruirea a fost blocată');

  const after = await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('collector_mvp_v2'));
    return { names: db.entities.map(entity => entity.name), hasInvalidEvent: db.events.some(event => event.id === 'invalid-startup-replay-event') };
  });
  expect(after.names).toContain('Entitate păstrată');
  expect(after.hasInvalidEvent).toBe(true);
});


test('focus-ul nu suprascrie date locale mai noi cu un snapshot vechi din memorie', async ({ page }) => {
  await page.clock.install();
  await createEntity(page, 'Valoare inițială', 'plant');
  await page.clock.fastForward(31 * 60 * 1000);
  await page.evaluate(() => {
    // Simulate another tab or an external writer updating the persisted projection.
    const newer = JSON.parse(localStorage.getItem('collector_mvp_v2'));
    newer.entities[0].name = 'Valoare mai nouă';
    localStorage.setItem('collector_mvp_v2', JSON.stringify(newer));
    window.dispatchEvent(new Event('focus'));
  });
  const storedName = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).entities[0].name);
  expect(storedName).toBe('Valoare mai nouă');
});


test('JSON local corupt este păstrat pentru export și blochează scrierile', async ({ page }) => {
  const corrupt = '{"events": [ this is not valid JSON';
  await page.evaluate(value => localStorage.setItem('collector_mvp_v2', value), corrupt);
  await page.reload();
  await page.locator('.nav[data-page="audit"]').click();
  await expect(page.locator('#auditSummary')).toContainText('MOD NUMAI CITIRE');
  const stored = await page.evaluate(() => localStorage.getItem('collector_mvp_v2'));
  expect(stored).toBe(corrupt);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export JSON' }).click()
  ]);
  const backup = JSON.parse(await require('node:fs/promises').readFile(await download.path(), 'utf8'));
  expect(backup.db.rawStorageValue).toBe(corrupt);
  expect(backup.db.storageKey).toBe('collector_mvp_v2');
  await page.getByRole('button', { name: 'Verifică replay' }).click();
  let rebuildMessage = '';
  page.once('dialog', async dialog => { rebuildMessage = dialog.message(); await dialog.accept(); });
  await page.locator('#modalContent').getByRole('button', { name: 'Reconstruiește proiecțiile' }).click();
  expect(rebuildMessage).toContain('Reconstruirea a fost blocată');
  expect(await page.evaluate(() => localStorage.getItem('collector_mvp_v2'))).toBe(corrupt);
});

test('migrarea legacy jurnalizează definițiile și rămâne validă la următorul startup', async ({ page }) => {
  await createEntity(page, 'Plantă legacy', 'plant');
  await page.locator('.nav[data-page="attributes"]').click();
  await page.locator('#attributes .toolbar button.primary').click();
  await page.locator('#attrName').fill('pH');
  await page.locator('#attrType').selectOption('number');
  await page.locator('#attrOwner').selectOption('entity');
  await page.locator('#modal button.primary').click();
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('collector_mvp_v2'));
    db.schemaVersion = 6;
    localStorage.setItem('collector_mvp_v2', JSON.stringify(db));
  });
  await page.reload();
  await page.locator('.nav[data-page="audit"]').click();
  await expect(page.locator('#auditSummary')).not.toContainText('MOD NUMAI CITIRE');
  const migrated = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')));
  expect(migrated.schemaVersion).toBe(7);
  expect(migrated.events.some(event => event.operations?.some(op => op.operation === 'attribute.define' && op.data?.name === 'pH'))).toBe(true);
  await page.reload();
  await page.locator('.nav[data-page="audit"]').click();
  await expect(page.locator('#auditSummary')).not.toContainText('MOD NUMAI CITIRE');
});

test('migrarea legacy refuză o proiecție de relații divergentă fără să o suprascrie', async ({ page }) => {
  const sourceId = await createEntity(page, 'Sursă legacy', 'plant');
  const targetId = await createEntity(page, 'Destinație legacy', 'location');
  await page.locator('.nav[data-page="relations"]').click();
  await page.locator('#relations .toolbar button.primary').last().click();
  await page.locator('#relSource').selectOption(sourceId);
  await page.locator('#relType').selectOption('related_to');
  await page.locator('#relTarget').selectOption(targetId);
  await page.locator('#modal button.primary').click();
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('collector_mvp_v2'));
    db.schemaVersion = 6;
    db.relations[0].type = 'tampered_relation';
    localStorage.setItem('collector_mvp_v2', JSON.stringify(db));
  });
  await page.reload();
  await page.locator('.nav[data-page="audit"]').click();
  await expect(page.locator('#auditSummary')).toContainText('MOD NUMAI CITIRE');
  const preserved = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')));
  expect(preserved.schemaVersion).toBe(6);
  expect(preserved.relations[0].type).toBe('tampered_relation');
  await page.getByRole('button', { name: 'Verifică replay' }).click();
  let rebuildMessage = '';
  page.once('dialog', async dialog => { rebuildMessage = dialog.message(); await dialog.accept(); });
  await page.locator('#modalContent').getByRole('button', { name: 'Reconstruiește proiecțiile' }).click();
  expect(rebuildMessage).toContain('Reconstruirea a fost blocată');
  const stillPreserved = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')));
  expect(stillPreserved.schemaVersion).toBe(6);
  expect(stillPreserved.relations[0].type).toBe('tampered_relation');
});


test('startup-ul păstrează datele unei versiuni de schemă viitoare și nu le retrogradează', async ({ page }) => {
  await createEntity(page, 'Entitate schema viitoare', 'plant');
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('collector_mvp_v2'));
    db.schemaVersion = 8;
    localStorage.setItem('collector_mvp_v2', JSON.stringify(db));
  });
  await page.reload();
  await page.locator('.nav[data-page="audit"]').click();
  await expect(page.locator('#auditSummary')).toContainText('MOD NUMAI CITIRE');
  const preserved = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')));
  expect(preserved.schemaVersion).toBe(8);
  expect(preserved.entities[0].name).toBe('Entitate schema viitoare');
});


test('migrarea legacy păstrează colecțiile de proiecție malformate în loc să le golească', async ({ page }) => {
  await createEntity(page, 'Entitate cu stoc corupt', 'plant');
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('collector_mvp_v2'));
    db.schemaVersion = 6;
    db.stock = { quantity: 42 };
    localStorage.setItem('collector_mvp_v2', JSON.stringify(db));
  });
  await page.reload();
  await page.locator('.nav[data-page="audit"]').click();
  await expect(page.locator('#auditSummary')).toContainText('MOD NUMAI CITIRE');
  const preserved = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')));
  expect(preserved.schemaVersion).toBe(6);
  expect(preserved.stock).toEqual({ quantity: 42 });
});


test('migrarea v6 păstrează ordinea append-only și trece export/import/replay', async ({ page }) => {
  await page.addInitScript(fixture => {
    localStorage.setItem('collector_mvp_v2', JSON.stringify(fixture));
  }, legacyV6Fixture);
  await page.goto('/index-server.html');
  await page.locator('.nav[data-page="audit"]').click();
  await expect(page.locator('#auditSummary')).not.toContainText('MOD NUMAI CITIRE');

  const result = await page.evaluate(() => {
    const migrated = JSON.parse(localStorage.getItem('collector_mvp_v2'));
    const validation = window.CollectorEngine.validateImport(migrated);
    const originalNoteIndex = migrated.events.findIndex(event => event.id === 'legacy-journal-note-001');
    const migratedCreateIndex = migrated.events.findIndex(event => event.type === 'migration.entity_imported');
    return {
      schemaVersion: migrated.schemaVersion,
      entityName: migrated.entities.find(entity => entity.id === 'legacy-entity-missing-create')?.name,
      originalNoteIndex,
      migratedCreateIndex,
      originalNoteTimestamp: migrated.events[originalNoteIndex]?.timestamp,
      migratedCreateTimestamp: migrated.events[migratedCreateIndex]?.timestamp,
      replayWarnings: validation.meta.replayWarnings || [],
      replayEntityName: validation.entities.find(entity => entity.id === 'legacy-entity-missing-create')?.name
    };
  });
  expect(result.schemaVersion).toBe(7);
  expect(result.entityName).toBe('Legacy specimen');
  expect(result.originalNoteIndex).toBe(0);
  expect(result.migratedCreateIndex).toBe(1);
  expect(Date.parse(result.migratedCreateTimestamp)).toBeGreaterThan(Date.parse(result.originalNoteTimestamp));
  expect(result.replayWarnings).toEqual([]);
  expect(result.replayEntityName).toBe('Legacy specimen');
});

test('aplicația poate înregistra date offline și le recuperează după reconectare', async ({ page, context }) => {
  await context.setOffline(true);
  const entityId = await createEntity(page, 'Plantă înregistrată offline', 'plant');
  expect(entityId).toBeTruthy();
  const offlineState = await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('collector_mvp_v2'));
    return { name: db.entities[0]?.name, eventCount: db.events.length };
  });
  expect(offlineState.name).toBe('Plantă înregistrată offline');
  expect(offlineState.eventCount).toBeGreaterThan(0);

  await context.setOffline(false);
  await page.reload();
  await page.locator('.nav[data-page="entities"]').click();
  await expect(page.locator('#entityList')).toContainText('Plantă înregistrată offline');
  await page.locator('.nav[data-page="audit"]').click();
  await expect(page.locator('#auditSummary')).not.toContainText('MOD NUMAI CITIRE');
});


test('startup-ul nu aplică migrarea v6 unei scheme legacy neverificate', async ({ page }) => {
  const unsupported = { ...legacyV6Fixture, schemaVersion: 5 };
  await page.addInitScript(fixture => {
    localStorage.setItem('collector_mvp_v2', JSON.stringify(fixture));
  }, unsupported);
  await page.goto('/index-server.html');
  await page.locator('.nav[data-page="audit"]').click();
  await expect(page.locator('#auditSummary')).toContainText('MOD NUMAI CITIRE');
  const preserved = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')));
  expect(preserved.schemaVersion).toBe(5);
  expect(preserved.entities[0].id).toBe('legacy-entity-missing-create');
});


test('old storage key fără schemaVersion este migrat și verificat prin Replay', async ({ page }) => {
  await page.evaluate(fixture => {
    localStorage.removeItem('collector_mvp_v2');
    localStorage.setItem('collector_mvp_v1', JSON.stringify(fixture));
  }, legacyOldKeyFixture);

  await page.reload();

  const migrated = await page.evaluate(() => {
    const raw = localStorage.getItem('collector_mvp_v2');
    const db = raw ? JSON.parse(raw) : null;
    return {
      db,
      legacyKeyStillPreserved: localStorage.getItem('collector_mvp_v1') !== null
    };
  });

  expect(migrated.db).toBeTruthy();
  expect(migrated.db.schemaVersion).toBe(7);
  expect(migrated.db.entities.map(entity => entity.id)).toContain('legacy-old-key-plant');
  expect(migrated.db.events.map(event => event.id)).toContain('legacy-old-key-note');
  expect(migrated.db.events.at(-1).type).toBe('migration.entity_imported');
  expect(Date.parse(migrated.db.events.at(-1).timestamp)).toBeGreaterThan(Date.parse('2026-01-01T00:00:00.000Z'));
  expect(migrated.legacyKeyStillPreserved).toBe(true);

  const validation = await page.evaluate(db => {
    const checked = window.CollectorEngine.validateImport(db);
    return {
      warnings: checked.meta.replayWarnings || [],
      entityNames: checked.entities.map(entity => entity.name)
    };
  }, migrated.db);
  expect(validation.warnings).toEqual([]);
  expect(validation.entityNames).toContain('Legacy key plant');
  await page.locator('.nav[data-page="audit"]').click();
  await expect(page.locator('#auditSummary')).not.toContainText('MOD NUMAI CITIRE');
});

test('caută entități live după nume, tip și locație și permite resetarea filtrului', async ({ page }) => {
  await createLocation(page, 'Greenhouse B3');
  await createEntity(page, 'Fancy Tiger Red', 'shrimp');
  await createEntity(page, 'Philodendron Micans', 'plant');
  const ids = await page.evaluate(() => { const db=JSON.parse(localStorage.getItem('collector_mvp_v2')); return {location:db.entities.find(e=>e.name==='Greenhouse B3').id,plant:db.entities.find(e=>e.name==='Philodendron Micans').id}; });
  await page.locator('.nav[data-page="relations"]').click();
  await page.locator('#relations .toolbar button.primary').nth(1).click();
  await page.locator('#relSource').selectOption(ids.plant);
  await page.locator('#relType').selectOption('located_in');
  await page.locator('#relTarget').selectOption(ids.location);
  await page.locator('#modal button.primary').click();
  await page.locator('.nav[data-page="entities"]').click();

  const search = page.locator('#entitySearch');
  await expect(search).toBeVisible();
  await expect(page.locator('#entityList .row')).toHaveCount(3);

  await search.fill('fancy');
  await expect(page.locator('#entityList .row')).toHaveCount(1);
  await expect(page.locator('#entityList')).toContainText('Fancy Tiger Red');
  await expect(page.locator('#entityList')).not.toContainText('Philodendron Micans');
  await expect(page.locator('#entitySearchCount')).toContainText('1 / 3');

  await search.fill('shrimp');
  await expect(page.locator('#entityList .row')).toHaveCount(1);
  await expect(page.locator('#entityList')).toContainText('Fancy Tiger Red');

  await search.fill('greenhouse');
  await expect(page.locator('#entityList .row')).toHaveCount(2);
  await expect(page.locator('#entityList')).toContainText('Philodendron Micans');
  await expect(page.locator('#entityList')).toContainText('Greenhouse B3');
  await expect(page.locator('#entityList')).not.toContainText('Fancy Tiger Red');

  await search.fill('does-not-exist');
  await expect(page.locator('#entityList')).toContainText('Nu există entități care corespund căutării.');
  await expect(page.locator('#entitySearchCount')).toContainText('0 / 3');

  await search.fill('');
  await expect(page.locator('#entityList .row')).toHaveCount(3);
  await expect(page.locator('#entitySearchCount')).toBeEmpty();
});


test('Work Recall caută memorie structurată și navighează la evenimentul sursă',async({page})=>{
 await createEntity(page,'Pompa acvariu recall','object');
 await page.locator('#memoryRecallQuery').fill('Pompa acvariu recall');
 await page.locator('#memoryRecallForm').getByRole('button',{name:'Caută în memorie'}).click();
 await expect(page.locator('#memoryRecallStatus')).toContainText('dovezi găsite');
 await expect(page.locator('#memoryRecallResults')).toContainText('Pompa acvariu recall');
 const source=page.locator('[data-recall-open-event]').first();await expect(source).toBeVisible();
 const eventId=await source.getAttribute('data-recall-open-event');await source.click();
 await expect(page.locator('#events')).toBeVisible();
 await expect(page.locator('[data-event-id="'+eventId+'"]')).toBeVisible();
});
