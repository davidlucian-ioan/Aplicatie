'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const projectDir = path.resolve(__dirname, '..');
const port = 4174;
const baseURL = `http://127.0.0.1:${port}`;
const outputDir = path.join(projectDir, 'test-results');
const server = spawn(process.execPath, [path.join(__dirname, 'static-server.cjs')], {
  cwd: projectDir,
  env: { ...process.env, PORT: String(port) },
  stdio: 'ignore'
});

async function waitForServer() {
  const deadline = Date.now() + 20_000;
  let lastError;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`UI coverage server exited with code ${server.exitCode}`);
    }
    try {
      const response = await fetch(`${baseURL}/index-server.html`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`UI coverage server did not start: ${lastError?.message || 'timeout'}`);
}

function summarizeFunctionCoverage(entry) {
  const functions = entry.functions || [];
  const covered = functions.filter(fn => (fn.ranges || []).some(range => range.count > 0)).length;
  return {
    url: entry.url,
    functionCount: functions.length,
    coveredFunctionCount: covered,
    uncoveredFunctionCount: functions.length - covered,
    functionCoveragePercent: functions.length
      ? Number((covered / functions.length * 100).toFixed(2))
      : 0
  };
}

async function main() {
  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.coverage.startJSCoverage({ resetOnNavigation: false });
    await page.goto(`${baseURL}/index-server.html`);

    // Exercise the main UI render paths and a small set of local write paths.
    const pages = [
      'dashboard', 'entities', 'relations', 'inventory', 'finance',
      'attributes', 'events', 'history', 'assistant', 'audit'
    ];
    for (const section of pages) {
      await page.locator(`.nav[data-page="${section}"]`).click();
    }

    await page.locator('.nav[data-page="entities"]').click();
    await page.locator('#entities .toolbar button.primary').click();
    await page.locator('#newName').fill('UI coverage synthetic plant');
    await page.locator('#newType').fill('plant');
    await page.locator('#modal button.primary').click();

    await page.locator('.nav[data-page="relations"]').click();
    await page.locator('#relations .toolbar button.primary').first().click();
    await page.locator('#locName').fill('UI coverage synthetic location');
    await page.locator('#modal button.primary').click();

    await page.locator('.nav[data-page="inventory"]').click();
    await page.locator('#inventory .toolbar button.secondary').click();
    await page.locator('#popName').fill('UI coverage synthetic population');
    await page.locator('#popType').fill('Fancy Tiger');
    await page.locator('#popQty').fill('3');
    await page.locator('#modal button.primary').click();

    for (const section of pages) {
      await page.locator(`.nav[data-page="${section}"]`).click();
    }

    const rawCoverage = await page.coverage.stopJSCoverage();
    const appScripts = rawCoverage.filter(entry =>
      /\/(app|engine)\.js(?:\?|$)/.test(entry.url)
      || /\/ai\/[^/]+\.js(?:\?|$)/.test(entry.url)
    );
    const byFile = appScripts.map(summarizeFunctionCoverage);
    const report = {
      tool: 'Playwright Chromium V8 JavaScript coverage',
      scope: 'Function coverage for production scripts loaded by the UI; this is not line or branch coverage.',
      measuredAt: new Date().toISOString(),
      browser: 'chromium',
      exercisedSections: pages,
      scripts: byFile,
      totals: {
        functionCount: byFile.reduce((sum, item) => sum + item.functionCount, 0),
        coveredFunctionCount: byFile.reduce((sum, item) => sum + item.coveredFunctionCount, 0)
      }
    };
    report.totals.functionCoveragePercent = report.totals.functionCount
      ? Number((report.totals.coveredFunctionCount / report.totals.functionCount * 100).toFixed(2))
      : 0;

    const appFound = byFile.some(item => /\/app\.js(?:\?|$)/.test(item.url));
    const engineFound = byFile.some(item => /\/engine\.js(?:\?|$)/.test(item.url));
    if (!appFound || !engineFound) {
      throw new Error(`UI coverage did not capture app.js and engine.js. Captured: ${byFile.map(x => x.url).join(', ')}`);
    }
    if (report.totals.coveredFunctionCount === 0) {
      throw new Error('UI coverage captured no executed production functions.');
    }

    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(
      path.join(outputDir, 'ui-coverage-v8.json'),
      JSON.stringify(report, null, 2) + '\n',
      'utf8'
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    if (browser) await browser.close();
    if (server.exitCode === null) {
      server.kill('SIGTERM');
      await new Promise(resolve => {
        const timer = setTimeout(resolve, 2_000);
        server.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
