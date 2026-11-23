'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

test('măsoară coverage-ul browser pentru app.js', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP precise coverage este disponibil numai în Chromium.');

  const session = await page.context().newCDPSession(page);
  await session.send('Debugger.enable');
  await session.send('Profiler.enable');
  await session.send('Profiler.startPreciseCoverage', { callCount: true, detailed: true });

  await page.goto('/index-server.html');
  await expect(page.locator('#dashboard')).toBeVisible();

  for (const pageName of ['entities', 'relations', 'inventory', 'finance', 'attributes', 'events', 'history', 'assistant', 'audit', 'dashboard']) {
    await page.locator('.nav[data-page="' + pageName + '"]').click();
    await expect(page.locator('#' + pageName)).toBeVisible();
  }


  // Exercise representative create/edit workflows in addition to view rendering.
  await page.locator('.nav[data-page="entities"]').click();
  await page.locator('#entities .toolbar button.primary').click();
  await page.locator('#newName').fill('Coverage plant');
  await page.locator('#newType').fill('plant');
  await page.locator('#modal button.primary').click();
  const plantId = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).entities.find(entity => entity.name === 'Coverage plant').id);

  await page.locator('.nav[data-page="relations"]').click();
  await page.locator('#relations .toolbar button.primary').first().click();
  await page.locator('#locName').fill('Coverage greenhouse');
  await page.locator('#modal button.primary').click();
  const locationId = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).entities.find(entity => entity.name === 'Coverage greenhouse').id);

  await page.locator('#relations .toolbar button.primary').nth(1).click();
  await page.locator('#relSource').selectOption(plantId);
  await page.locator('#relType').selectOption('located_in');
  await page.locator('#relTarget').selectOption(locationId);
  await page.locator('#modal button.primary').click();

  await page.locator('.nav[data-page="entities"]').click();
  await page.getByRole('button', { name: 'Deschide' }).first().click();
  await page.locator('.entity-detail .row-actions button').first().click();
  await page.locator('#attrName').fill('pH');
  await page.locator('#attrMin').fill('5.5');
  await page.locator('#attrMax').fill('6.5');
  await page.locator('#attrValue').fill('6.1');
  await page.locator('#modal button.primary').click();
  await expect(page.locator('#entityList')).toContainText('pH');
  const chart = page.locator('#entityChartSelect');
  if (await chart.count()) await chart.selectOption('pH');

  await page.locator('.nav[data-page="attributes"]').click();
  await page.locator('#attributes .toolbar button.primary').click();
  await page.locator('#attrName').fill('relation_rating');
  await page.locator('#attrType').selectOption('number');
  await page.locator('#attrOwner').selectOption('relation');
  await page.locator('#modal button.primary').click();

  await page.locator('#attributes .toolbar button.primary').click();
  await page.locator('#attrName').fill('event_weather');
  await page.locator('#attrType').selectOption('text');
  await page.locator('#attrOwner').selectOption('event');
  await page.locator('#modal button.primary').click();

  await page.locator('.nav[data-page="relations"]').click();
  await page.locator('#relationList button').filter({ hasText: 'Atribut' }).first().click();
  await page.locator('#relAttrName').selectOption('relation_rating');
  await page.locator('#relAttrValue').fill('7');
  await page.locator('#modal button.primary').click();

  await page.locator('.nav[data-page="inventory"]').click();
  await page.locator('#inventory .toolbar button.secondary').click();
  await page.locator('#popName').fill('Coverage population');
  await page.locator('#popType').fill('Fancy Tiger');
  await page.locator('#popQty').fill('4');
  await page.locator('#popLoc').selectOption(locationId);
  await page.locator('#modal button.primary').click();
  const populationId = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).entities.find(entity => entity.name === 'Coverage population').id);

  await page.locator('#inventory .toolbar button.primary').click();
  await page.locator('#stockPop').selectOption(populationId);
  await page.locator('#stockAction').selectOption('add');
  await page.locator('#stockLoc').selectOption(locationId);
  await page.locator('#stockQty').fill('1');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#modal button.primary').click();

  await page.locator('.nav[data-page="finance"]').click();
  await page.locator('#finance .toolbar button.primary').click();
  await page.locator('#finAmount').fill('12.5');
  await page.locator('#finDescription').fill('Coverage purchase');
  await page.locator('#finEntity').selectOption(plantId);
  await page.locator('#modal button.primary').click();

  await page.locator('.nav[data-page="events"]').click();
  await page.locator('#events .toolbar button.primary').click();
  await page.locator('#noteType').fill('observation');
  await page.locator('#noteText').fill('Coverage note');
  await page.locator('#noteEntity').selectOption(plantId);
  await page.locator('#modal button.primary').click();
  await page.locator('#eventList button').filter({ hasText: 'Atribut' }).first().click();
  await page.locator('#eventAttrName').selectOption('event_weather');
  await page.locator('#eventAttrValue').fill('sunny');
  await page.locator('#modal button.primary').click();

  await page.locator('.nav[data-page="assistant"]').click();
  await page.locator('#commandInput').fill('Observație: coverage assistant note');
  await page.locator('#parseCommand').click();
  await expect(page.locator('#confirmCoreCommand')).toBeVisible();
  await page.locator('#confirmCoreCommand').click();

  await page.locator('.nav[data-page="history"]').click();
  await page.locator('#historyEntityFilter').selectOption(plantId);
  await page.locator('#historyTypeFilter').selectOption({ index: 0 });
  await page.locator('.nav[data-page="audit"]').click();
  await page.getByRole('button', { name: 'Verifică replay' }).click();
  await expect(page.locator('#modalContent pre')).toContainText('"warnings": []');
  await page.locator('#modal .close').click();

  const coverage = await session.send('Profiler.takePreciseCoverage');
  const appScript = coverage.result.find(entry => {
    try {
      return new URL(entry.url).pathname.endsWith('/app.js');
    } catch {
      return false;
    }
  });
  expect(appScript, 'app.js must be present in Chromium precise coverage').toBeTruthy();

  const source = await session.send('Debugger.getScriptSource', { scriptId: appScript.scriptId });
  const coveredRanges = appScript.functions
    .flatMap(fn => fn.ranges)
    .filter(range => range.count > 0 && !(range.startOffset === 0 && range.endOffset === source.scriptSource.length))
    .map(range => [range.startOffset, range.endOffset])
    .sort((a, b) => a[0] - b[0]);

  const merged = [];
  for (const range of coveredRanges) {
    const last = merged[merged.length - 1];
    if (!last || range[0] > last[1]) merged.push([...range]);
    else last[1] = Math.max(last[1], range[1]);
  }
  const coveredBytes = merged.reduce((sum, [start, end]) => sum + end - start, 0);
  const totalBytes = source.scriptSource.length;
  const report = {
    file: 'app.js',
    browser: 'chromium',
    metric: 'byte coverage from V8 precise coverage ranges',
    coveredBytes,
    totalBytes,
    coveragePercent: Number((totalBytes ? coveredBytes / totalBytes * 100 : 0).toFixed(2)),
    measuredAt: new Date().toISOString(),
    exercisedViews: ['dashboard', 'entities', 'relations', 'inventory', 'finance', 'attributes', 'events', 'history', 'assistant', 'audit'],
    threshold: null
  };

  const outputPath = path.join(__dirname, '..', 'test-results', 'app-ui-coverage.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log('APP_UI_COVERAGE ' + JSON.stringify(report));
  await session.detach();

  expect(coveredBytes).toBeGreaterThan(0);
  expect(totalBytes).toBeGreaterThan(0);
});
