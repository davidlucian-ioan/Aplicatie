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
    .filter(range => range.count > 0)
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
  await session.detach();

  expect(coveredBytes).toBeGreaterThan(0);
  expect(totalBytes).toBeGreaterThan(0);
});
