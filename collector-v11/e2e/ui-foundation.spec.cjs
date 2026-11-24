'use strict';

const { test, expect } = require('@playwright/test');

test('mobile navigation opens, selects a section and closes accessibly', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/index-server.html');

  const sidebar = page.locator('#appSidebar');
  const toggle = page.getByRole('button', { name: 'Deschide meniul' });
  await expect(toggle).toBeVisible();
  await expect(sidebar).toBeHidden();

  await toggle.click();
  await expect(sidebar).toBeVisible();
  await expect(page.locator('#menuToggle')).toHaveAttribute('aria-expanded', 'true');

  await page.getByRole('button', { name: 'Entități' }).click();
  await expect(page.locator('#entities')).toBeVisible();
  await expect(sidebar).toBeHidden();
  await expect(page.locator('.nav[data-page="entities"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#menuToggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#menuToggle')).toBeFocused();
});

test('global action starts a local audio recording without committing an event', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() { window.__audioTrackStopped = true; } }] }) } });
    window.__audioTrackStopped = false;
    window.__wakeLockRequests = 0;
    window.__wakeLockReleases = 0;
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => { window.__wakeLockRequests += 1; let released = false; return { get released() { return released; }, addEventListener() {}, release: async () => { if (!released) { released = true; window.__wakeLockReleases += 1; } } }; } } });
    window.MediaRecorder = class {
      static isTypeSupported() { return true; }
      constructor(stream, options) { this.stream = stream; this.mimeType = options?.mimeType || 'audio/webm'; this.state = 'inactive'; }
      start() { this.state = 'recording'; this.onstart?.(); }
      pause() { this.state = 'paused'; this.onpause?.(); }
      resume() { this.state = 'recording'; this.onresume?.(); }
      stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['audio-sample'], { type: this.mimeType }) }); this.onstop?.(); }
    };
  });
  await page.goto('/index-server.html');
  await page.locator('.nav[data-page="work"]').click();
  await page.locator('#globalVoice').click();
  await expect(page.locator('#work')).toBeVisible();
  await expect(page.locator('#audioRecorderStatus')).toContainText('Înregistrare audio activă');
  await expect(page.locator('#audioRecorderStatus')).toContainText('Ecranul este menținut activ');
  expect(await page.evaluate(() => window.__wakeLockRequests)).toBe(1);
  await expect(page.locator('#audioRecordPause')).toBeEnabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events.length)).toBe(0);
  await page.locator('#audioRecordPause').click();
  await expect(page.locator('#audioRecordResume')).toBeEnabled();
  await expect.poll(() => page.evaluate(() => window.__wakeLockReleases)).toBe(1);
  await page.locator('#audioRecordResume').click();
  await expect(page.locator('#audioRecordStop')).toBeEnabled();
  await expect.poll(() => page.evaluate(() => window.__wakeLockRequests)).toBe(2);
  await page.locator('#audioRecordStop').click();
  await expect(page.locator('#audioRecorderStatus')).toContainText('Înregistrare salvată local');
  await expect.poll(() => page.evaluate(() => window.__wakeLockReleases)).toBe(2);
  await expect(page.locator('#audioRecordingList')).toContainText('KB');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events.length)).toBe(0);
  expect(await page.evaluate(() => window.__audioTrackStopped)).toBe(true);
  await page.reload();
  await page.locator('.nav[data-page="work"]').click();
  await expect(page.locator('#audioRecordingList')).toContainText('KB');
  expect(await page.evaluate(async () => (await window.CollectorAudioStore.list()).length)).toBe(1);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: /Șterge înregistrarea din/ }).click();
  await expect(page.locator('#audioRecordingList')).toContainText('Nu există înregistrări audio locale');
  expect(await page.evaluate(async () => (await window.CollectorAudioStore.list()).length)).toBe(0);
});

test('desktop navigation exposes the current section to assistive technology', async ({ page }) => {
  await page.goto('/index-server.html');
  await expect(page.getByRole('navigation', { name: 'Spații de lucru' })).toBeVisible();
  await expect(page.locator('.nav[data-page="work"]')).toHaveAttribute('aria-current', 'page');

  await page.getByRole('button', { name: 'Istoric' }).click();
  await expect(page.locator('#history')).toBeVisible();
  await expect(page.locator('.nav[data-page="history"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.nav[data-page="dashboard"]')).not.toHaveAttribute('aria-current', 'page');
});

test('voice entry degrades to accessible text input when speech recognition is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: undefined });
    Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: undefined });
  });
  await page.goto('/index-server.html');
  await page.locator('.nav[data-page="work"]').click();
  await page.locator('#voiceSessionButton').click();

  await expect(page.locator('#work')).toBeVisible();
  await expect(page.locator('#commandResult')).toContainText('Sesiunea vocală nu este disponibilă');
  await expect(page.locator('#commandInput')).toBeFocused();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events.length)).toBe(0);
});


test('voice session preserves separate utterances in one atomic batch preview', async ({ page }) => {
  await page.addInitScript(() => {
    window.__collectorRecognition = null;
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: class {
      start() { window.__collectorRecognition = this; this.onstart?.(); }
      stop() { this.onend?.(); }
    } });
  });
  await page.goto('/index-server.html');
  await page.locator('.nav[data-page="work"]').click();
  await page.locator('#voiceSessionButton').click();
  await expect(page.locator('#voiceSessionButton')).toContainText('Oprește transcrierea');
  await page.evaluate(() => {
    const rec = window.__collectorRecognition;
    const first = [{ transcript: 'B3 are pH 6.4' }]; first.isFinal = true;
    const second = [{ transcript: 'Temperatura este 22 de grade' }]; second.isFinal = true;
    rec.onresult({ resultIndex: 0, results: [first, second] });
  });
  await expect(page.locator('#commandInput')).toHaveValue('B3 are pH 6.4 · Temperatura este 22 de grade');
  await page.locator('#voiceSessionButton').click();
  await expect(page.locator('#confirmCoreCommand')).toBeVisible();
  await expect(page.locator('#commandResult')).toContainText('Lot vocal · 2 fraze');
  await expect(page.locator('#commandResult')).toContainText('Observație 1: „B3 are pH 6.4”');
  await expect(page.locator('#commandResult')).toContainText('Observație 2: „Temperatura este 22 de grade”');
  await expect(page.locator('#commandResult')).toContainText('Operații în lot: 2');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events.length)).toBe(0);
  await page.locator('#confirmCoreCommand').click();
  await expect(page.locator('#commandResult')).toContainText('Salvat cu succes');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events);
  expect(saved).toHaveLength(1);
  expect(saved[0].operations).toHaveLength(2);
  expect(saved[0].operations.map(operation => operation.data.description)).toEqual(['B3 are pH 6.4', 'Temperatura este 22 de grade']);
});



test('voice batch requires explicit selection when an entity name is ambiguous', async ({ page }) => {
  await page.addInitScript(() => {
    window.__collectorRecognition = null;
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: class {
      start() { window.__collectorRecognition = this; this.onstart?.(); }
      stop() { this.onend?.(); }
    } });
  });
  await page.goto('/index-server.html');
  await page.locator('.nav[data-page="entities"]').click();
  for (let index = 0; index < 2; index++) {
    await page.locator('#entities .toolbar button.primary').click();
    await page.locator('#newName').fill('B3 duplicat');
    await page.locator('#newType').fill(index ? 'aquarium' : 'tank');
    await page.locator('#modal button.primary').click();
  }
  await page.locator('.nav[data-page="attributes"]').click();
  await page.locator('#attributes .toolbar button.primary').click();
  await page.locator('#attrName').fill('pH');
  await page.locator('#attrType').selectOption('number');
  await page.locator('#modal button.primary').click();

  const ids = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).entities.filter(entity => entity.name === 'B3 duplicat').map(entity => entity.id));
  expect(ids).toHaveLength(2);
  await page.locator('.nav[data-page="work"]').click();
  await page.locator('#voiceSessionButton').click();
  await page.evaluate(() => {
    const phrase = [{ transcript: 'setează pH pentru B3 duplicat = 6.4' }];
    phrase.isFinal = true;
    window.__collectorRecognition.onresult({ resultIndex: 0, results: [phrase] });
  });
  await page.locator('#voiceSessionButton').click();

  await expect(page.locator('#resolveVoiceBatch')).toBeVisible();
  await expect(page.locator('#commandResult')).toContainText('Nu am ales automat nicio entitate');
  expect(await page.locator('#commandResult [id^="voiceChoice_entity"]').count()).toBe(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events.length)).toBe(3);
  await expect(page.locator('#confirmCoreCommand')).toHaveCount(0);

  await page.locator('#commandResult select[data-voice-choice-key^="entity:"]').selectOption(ids[1]);
  await page.locator('#resolveVoiceBatch').click();
  await expect(page.locator('#confirmCoreCommand')).toBeVisible();
  await expect(page.locator('#commandResult')).toContainText('B3 duplicat · pH = 6.4');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events.length)).toBe(3);
  await page.locator('#confirmCoreCommand').click();
  await expect(page.locator('#commandResult')).toContainText('Salvat cu succes');
  const events = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events);
  expect(events).toHaveLength(4);
  expect(events[3].operations[0].target).toBe(ids[1]);
});


test('voice batch previews and commits mixed attribute and stock operations atomically', async ({ page }) => {
  await page.addInitScript(() => {
    window.__collectorRecognition = null;
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: class {
      start() { window.__collectorRecognition = this; this.onstart?.(); }
      stop() { this.onend?.(); }
    } });
  });
  await page.goto('/index-server.html');
  await page.locator('.nav[data-page="entities"]').click();
  await page.locator('#entities .toolbar button.primary').click();
  await page.locator('#newName').fill('Plantă test');
  await page.locator('#newType').fill('plant');
  await page.locator('#modal button.primary').click();
  const plantId = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).entities.find(entity => entity.name === 'Plantă test').id);

  await page.locator('.nav[data-page="attributes"]').click();
  await page.locator('#attributes .toolbar button.primary').click();
  await page.locator('#attrName').fill('pH');
  await page.locator('#attrType').selectOption('number');
  await page.locator('#modal button.primary').click();

  await page.locator('.nav[data-page="inventory"]').click();
  await page.locator('#inventory .toolbar button.secondary').click();
  await page.locator('#popName').fill('Fancy Tiger');
  await page.locator('#popType').fill('Caridina');
  await page.locator('#popQty').fill('10');
  await page.locator('#modal button.primary').click();
  const populationId = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).entities.find(entity => entity.name === 'Fancy Tiger').id);
  const initialEvents = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events.length);

  await page.locator('.nav[data-page="work"]').click();
  await page.locator('#voiceSessionButton').click();
  await page.evaluate(() => {
    const first = [{ transcript: 'setează pH pentru Plantă test = 6.4' }]; first.isFinal = true;
    const second = [{ transcript: 'am vândut 2 Fancy Tiger' }]; second.isFinal = true;
    window.__collectorRecognition.onresult({ resultIndex: 0, results: [first, second] });
  });
  await page.locator('#voiceSessionButton').click();
  await expect(page.locator('#confirmCoreCommand')).toBeVisible();
  await expect(page.locator('#commandResult')).toContainText('Plantă test · pH = 6.4');
  await expect(page.locator('#commandResult')).toContainText('Vânzare 2 × Fancy Tiger');
  await expect(page.locator('#commandResult')).toContainText('Operații în lot: 2');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events.length)).toBe(initialEvents);

  await page.locator('#confirmCoreCommand').click();
  await expect(page.locator('#commandResult')).toContainText('Salvat cu succes');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')));
  expect(saved.events).toHaveLength(initialEvents + 1);
  const event = saved.events[saved.events.length - 1];
  expect(event.operations.map(operation => operation.operation)).toEqual(['attribute.set', 'stock.change']);
  expect(event.operations[0].target).toBe(plantId);
  expect(event.operations[1].data.populationId).toBe(populationId);
  expect(event.operations[1].data.quantity).toBe(2);
  expect(saved.entities.find(entity => entity.id === plantId).attributes.pH).toBe(6.4);
  const activeBalance = await page.evaluate(() => window.CollectorEngine.balances(JSON.parse(localStorage.getItem('collector_mvp_v2'))).filter(balance => balance.populationId === JSON.parse(localStorage.getItem('collector_mvp_v2')).entities.find(entity => entity.name === 'Fancy Tiger').id && balance.disposition === 'active').reduce((sum, balance) => sum + balance.quantity, 0));
  expect(activeBalance).toBe(8);
});

test('voice batch rejects atomically when a sale exceeds available stock', async ({ page }) => {
  await page.addInitScript(() => {
    window.__collectorRecognition = null;
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: class {
      start() { window.__collectorRecognition = this; this.onstart?.(); }
      stop() { this.onend?.(); }
    } });
  });
  await page.goto('/index-server.html');

  await page.locator('.nav[data-page="entities"]').click();
  await page.locator('#entities .toolbar button.primary').click();
  await page.locator('#newName').fill('Plantă atomicitate');
  await page.locator('#newType').fill('plant');
  await page.locator('#modal button.primary').click();
  const plantId = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).entities.find(entity => entity.name === 'Plantă atomicitate').id);

  await page.locator('.nav[data-page="attributes"]').click();
  await page.locator('#attributes .toolbar button.primary').click();
  await page.locator('#attrName').fill('pH');
  await page.locator('#attrType').selectOption('number');
  await page.locator('#modal button.primary').click();

  await page.locator('.nav[data-page="inventory"]').click();
  await page.locator('#inventory .toolbar button.secondary').click();
  await page.locator('#popName').fill('Fancy Tiger atomic');
  await page.locator('#popType').fill('Caridina');
  await page.locator('#popQty').fill('2');
  await page.locator('#modal button.primary').click();
  const populationId = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).entities.find(entity => entity.name === 'Fancy Tiger atomic').id);
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')));

  await page.locator('.nav[data-page="work"]').click();
  await page.locator('#voiceSessionButton').click();
  await page.evaluate(() => {
    const first = [{ transcript: 'setează pH pentru Plantă atomicitate = 6.4' }]; first.isFinal = true;
    const second = [{ transcript: 'am vândut 3 Fancy Tiger atomic' }]; second.isFinal = true;
    window.__collectorRecognition.onresult({ resultIndex: 0, results: [first, second] });
  });
  await page.locator('#voiceSessionButton').click();

  await expect(page.locator('#commandResult')).toContainText('Cantitate insuficientă');
  await expect(page.locator('#confirmCoreCommand')).toHaveCount(0);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')));
  expect(after.events).toHaveLength(before.events.length);
  expect(after.entities.find(entity => entity.id === plantId).attributes?.pH).toBeUndefined();
  expect(after.stock).toEqual(before.stock);
  expect(after.events).toEqual(before.events);
  expect(after.entities.find(entity => entity.id === populationId)).toBeTruthy();
});


test('voice context uses only the last confirmed target and expires after 30 minutes', async ({ page }) => {
  await page.addInitScript(() => {
    window.__collectorRecognition = null;
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: class {
      start() { window.__collectorRecognition = this; this.onstart?.(); }
      stop() { this.onend?.(); }
    } });
  });
  await page.goto('/index-server.html');

  await page.locator('.nav[data-page="entities"]').click();
  await page.locator('#entities .toolbar button.primary').click();
  await page.locator('#newName').fill('Plantă context vocal');
  await page.locator('#newType').fill('plant');
  await page.locator('#modal button.primary').click();
  const plantId = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).entities.find(entity => entity.name === 'Plantă context vocal').id);

  await page.locator('.nav[data-page="attributes"]').click();
  await page.locator('#attributes .toolbar button.primary').click();
  await page.locator('#attrName').fill('pH');
  await page.locator('#attrType').selectOption('number');
  await page.locator('#modal button.primary').click();

  await page.locator('.nav[data-page="work"]').click();
  await page.locator('#voiceSessionButton').click();
  await page.evaluate(() => {
    const phrase = [{ transcript: 'setează pH pentru Plantă context vocal = 6.1' }]; phrase.isFinal = true;
    window.__collectorRecognition.onresult({ resultIndex: 0, results: [phrase] });
  });
  await page.locator('#voiceSessionButton').click();
  await expect(page.locator('#confirmCoreCommand')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('collector_voice_context_v1'))).toBeNull();
  await page.locator('#confirmCoreCommand').click();
  await expect(page.locator('#commandResult')).toContainText('Salvat cu succes');
  await expect(page.locator('#voiceContextCard')).toContainText('Context vocal activ');
  await expect(page.locator('#voiceContextCard')).toContainText('Plantă context vocal');
  const firstContext = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_voice_context_v1')));
  expect(firstContext.entityId).toBe(plantId);
  expect(firstContext.expiresAt - firstContext.updatedAt).toBe(30 * 60 * 1000);

  await page.reload();
  await page.locator('.nav[data-page="work"]').click();
  await expect(page.locator('#voiceContextCard')).toContainText('Context vocal activ');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('collector_voice_context_v1')).expiresAt)).toBe(firstContext.expiresAt);

  await page.locator('#commandInput').fill('setează pH pentru Plantă context vocal = 6.2');
  await page.locator('#parseCommand').click();
  await expect(page.locator('#confirmCoreCommand')).toBeVisible();
  await page.locator('#cancelCoreCommand').click();
  const afterManualCancel = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_voice_context_v1')));
  expect(afterManualCancel.expiresAt).toBe(firstContext.expiresAt);

  await page.locator('#voiceSessionButton').click();
  await page.evaluate(() => {
    const phrase = [{ transcript: 'setează pH pentru aceeași entitate = 6.4' }]; phrase.isFinal = true;
    window.__collectorRecognition.onresult({ resultIndex: 0, results: [phrase] });
  });
  await page.locator('#voiceSessionButton').click();
  await expect(page.locator('#confirmCoreCommand')).toBeVisible();
  await expect(page.locator('#commandResult')).toContainText('Plantă context vocal · pH = 6.4');
  await page.locator('#confirmCoreCommand').click();
  await expect(page.locator('#commandResult')).toContainText('Salvat cu succes');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')));
  expect(saved.entities.find(entity => entity.id === plantId).attributes.pH).toBe(6.4);
  expect(saved.events).toHaveLength(4);

  await page.evaluate(() => {
    const context = JSON.parse(localStorage.getItem('collector_voice_context_v1'));
    context.expiresAt = Date.now() - 1;
    localStorage.setItem('collector_voice_context_v1', JSON.stringify(context));
  });
  await page.reload();
  await page.locator('.nav[data-page="work"]').click();
  await expect(page.locator('#voiceContextCard')).toContainText('Fără context vocal activ');
  expect(await page.evaluate(() => localStorage.getItem('collector_voice_context_v1'))).toBeNull();
});

test('voice confirmation does not publish or retain context when local persistence fails', async ({ page }) => {
  await page.addInitScript(() => {
    window.__collectorRecognition = null;
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: class {
      start() { window.__collectorRecognition = this; this.onstart?.(); }
      stop() { this.onend?.(); }
    } });
  });
  await page.goto('/index-server.html');

  await page.locator('.nav[data-page="entities"]').click();
  await page.locator('#entities .toolbar button.primary').click();
  await page.locator('#newName').fill('Plantă fără persistență');
  await page.locator('#newType').fill('plant');
  await page.locator('#modal button.primary').click();

  await page.locator('.nav[data-page="attributes"]').click();
  await page.locator('#attributes .toolbar button.primary').click();
  await page.locator('#attrName').fill('pH');
  await page.locator('#attrType').selectOption('number');
  await page.locator('#modal button.primary').click();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')));

  await page.locator('.nav[data-page="work"]').click();
  await page.locator('#voiceSessionButton').click();
  await page.evaluate(() => {
    const phrase = [{ transcript: 'setează pH pentru Plantă fără persistență = 6.4' }]; phrase.isFinal = true;
    window.__collectorRecognition.onresult({ resultIndex: 0, results: [phrase] });
  });
  await page.locator('#voiceSessionButton').click();
  await expect(page.locator('#confirmCoreCommand')).toBeVisible();

  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'collector_mvp_v2') throw new Error('simulated quota failure');
      return original.call(this, key, value);
    };
  });
  await page.locator('#confirmCoreCommand').click();
  await expect(page.locator('#commandResult')).toContainText('Execuție nefinalizată (unavailable)');
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')));
  expect(after.events).toEqual(before.events);
  expect(after.entities.find(entity => entity.name === 'Plantă fără persistență').attributes?.pH).toBeUndefined();
  expect(await page.evaluate(() => localStorage.getItem('collector_voice_context_v1'))).toBeNull();

  await page.evaluate(() => { Storage.prototype.setItem = Storage.prototype.__originalSetItem || Storage.prototype.setItem; });
});

test('voice preview is revalidated and requires confirmation again after another session changes stock', async ({ page }) => {
  await page.addInitScript(() => {
    window.__collectorRecognition = null;
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: class {
      start() { window.__collectorRecognition = this; this.onstart?.(); }
      stop() { this.onend?.(); }
    } });
  });
  await page.goto('/index-server.html');

  await page.locator('.nav[data-page="entities"]').click();
  await page.locator('#entities .toolbar button.primary').click();
  await page.locator('#newName').fill('Plantă concurență');
  await page.locator('#newType').fill('plant');
  await page.locator('#modal button.primary').click();
  const plantId = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).entities.find(entity => entity.name === 'Plantă concurență').id);

  await page.locator('.nav[data-page="attributes"]').click();
  await page.locator('#attributes .toolbar button.primary').click();
  await page.locator('#attrName').fill('pH');
  await page.locator('#attrType').selectOption('number');
  await page.locator('#modal button.primary').click();

  await page.locator('.nav[data-page="inventory"]').click();
  await page.locator('#inventory .toolbar button.secondary').click();
  await page.locator('#popName').fill('Fancy Tiger concurență');
  await page.locator('#popType').fill('Caridina');
  await page.locator('#popQty').fill('3');
  await page.locator('#modal button.primary').click();
  const populationId = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).entities.find(entity => entity.name === 'Fancy Tiger concurență').id);
  const baselineCount = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events.length);

  await page.locator('.nav[data-page="work"]').click();
  await page.locator('#voiceSessionButton').click();
  await page.evaluate(() => {
    const phrases = ['setează pH pentru Plantă concurență = 6.4', 'am vândut 1 Fancy Tiger concurență'].map(transcript => {
      const result = [{ transcript }]; result.isFinal = true; return result;
    });
    window.__collectorRecognition.onresult({ resultIndex: 0, results: phrases });
  });
  await page.locator('#voiceSessionButton').click();
  await expect(page.locator('#confirmCoreCommand')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events.length)).toBe(baselineCount);

  await page.evaluate((population) => {
    const state = JSON.parse(localStorage.getItem('collector_mvp_v2'));
    const event = {
      id: 'external-concurrent-stock-sale',
      type: 'external.stock.sale',
      timestamp: new Date().toISOString(),
      source: 'user',
      actor: 'other-session',
      certainty: 'certain',
      operations: [{ operation: 'stock.change', data: { populationId: population, action: 'sell', locationId: null, quantity: 1, disposition: 'sold' } }]
    };
    const result = window.CollectorEngine.commit(state, event);
    localStorage.setItem('collector_mvp_v2', JSON.stringify(result.db));
  }, populationId);

  await page.locator('#confirmCoreCommand').click();
  await expect(page.locator('#commandResult')).toContainText('Preview actualizat');
  await expect(page.locator('#confirmCoreCommand')).toContainText('Confirmă preview-ul actualizat');
  const afterRefresh = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')));
  expect(afterRefresh.events).toHaveLength(baselineCount + 1);
  expect(afterRefresh.entities.find(entity => entity.id === plantId).attributes?.pH).toBeUndefined();
  const balanceAfterExternalSale = await page.evaluate((population) => window.CollectorEngine.balances(JSON.parse(localStorage.getItem('collector_mvp_v2'))).filter(row => row.populationId === population && row.disposition === 'active').reduce((sum, row) => sum + row.quantity, 0), populationId);
  expect(balanceAfterExternalSale).toBe(2);

  await page.locator('#confirmCoreCommand').click();
  await expect(page.locator('#commandResult')).toContainText('Salvat cu succes');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')));
  expect(saved.events).toHaveLength(baselineCount + 2);
  expect(saved.entities.find(entity => entity.id === plantId).attributes.pH).toBe(6.4);
  const finalBalance = await page.evaluate((population) => window.CollectorEngine.balances(JSON.parse(localStorage.getItem('collector_mvp_v2'))).filter(row => row.populationId === population && row.disposition === 'active').reduce((sum, row) => sum + row.quantity, 0), populationId);
  expect(finalBalance).toBe(1);
});

test('voice batch fails closed for missing populations and non-location targets', async ({ page }) => {
  await page.addInitScript(() => {
    window.__collectorRecognition = null;
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: class {
      start() { window.__collectorRecognition = this; this.onstart?.(); }
      stop() { this.onend?.(); }
    } });
  });
  await page.goto('/index-server.html');

  await page.locator('.nav[data-page="entities"]').click();
  await page.locator('#entities .toolbar button.primary').click();
  await page.locator('#newName').fill('Plantă invalid target');
  await page.locator('#newType').fill('plant');
  await page.locator('#modal button.primary').click();

  await page.locator('#entities .toolbar button.primary').click();
  await page.locator('#newName').fill('Fancy Tiger generic');
  await page.locator('#newType').fill('generic');
  await page.locator('#modal button.primary').click();

  await page.locator('#entities .toolbar button.primary').click();
  await page.locator('#newName').fill('Sera generic');
  await page.locator('#newType').fill('generic');
  await page.locator('#modal button.primary').click();

  await page.locator('.nav[data-page="attributes"]').click();
  await page.locator('#attributes .toolbar button.primary').click();
  await page.locator('#attrName').fill('pH');
  await page.locator('#attrType').selectOption('number');
  await page.locator('#modal button.primary').click();

  await page.locator('.nav[data-page="inventory"]').click();
  await page.locator('#inventory .toolbar button.secondary').click();
  await page.locator('#popName').fill('Fancy Tiger valid');
  await page.locator('#popType').fill('Caridina');
  await page.locator('#popQty').fill('2');
  await page.locator('#modal button.primary').click();

  const baseline = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')));
  const submitBatch = async (salePhrase, expectedError) => {
    await page.locator('.nav[data-page="work"]').click();
    await page.locator('#voiceSessionButton').click();
    await page.evaluate((sale) => {
      const phrases = ['setează pH pentru Plantă invalid target = 6.4', sale].map(transcript => {
        const result = [{ transcript }]; result.isFinal = true; return result;
      });
      window.__collectorRecognition.onresult({ resultIndex: 0, results: phrases });
    }, salePhrase);
    await page.locator('#voiceSessionButton').click();
    await expect(page.locator('#commandResult')).toContainText(expectedError);
    await expect(page.locator('#confirmCoreCommand')).toHaveCount(0);
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')));
    expect(after.events).toHaveLength(baseline.events.length);
    expect(after.stock).toEqual(baseline.stock);
    expect(after.entities.find(entity => entity.name === 'Plantă invalid target').attributes?.pH).toBeUndefined();
  };

  await submitBatch('am vândut 1 Fancy Tiger inexistent', 'nu am găsit populația');
  await submitBatch('am vândut 1 Fancy Tiger generic', 'nu am găsit populația');
  await submitBatch('am vândut 1 Fancy Tiger valid din Sera generic', 'nu am găsit locația');
});

test('voice contextual reference fails closed when no confirmed local context exists', async ({ page }) => {
  await page.addInitScript(() => {
    window.__collectorRecognition = null;
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: class {
      start() { window.__collectorRecognition = this; this.onstart?.(); }
      stop() { this.onend?.(); }
    } });
  });
  await page.goto('/index-server.html');
  await page.locator('.nav[data-page="work"]').click();
  await page.locator('#voiceSessionButton').click();
  await page.evaluate(() => {
    const phrase = [{ transcript: 'setează pH pentru aceeași entitate = 6.4' }]; phrase.isFinal = true;
    window.__collectorRecognition.onresult({ resultIndex: 0, results: [phrase] });
  });
  await page.locator('#voiceSessionButton').click();
  await expect(page.locator('#commandResult')).toContainText('Nu există un context vocal activ');
  await expect(page.locator('#confirmCoreCommand')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events.length)).toBe(0);
});

test('voice batch cancellation discards all utterances without committing', async ({ page }) => {
  await page.addInitScript(() => {
    window.__collectorRecognition = null;
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: class {
      start() { window.__collectorRecognition = this; this.onstart?.(); }
      stop() { this.onend?.(); }
    } });
  });
  await page.goto('/index-server.html');
  await page.locator('.nav[data-page="work"]').click();
  await page.locator('#voiceSessionButton').click();
  await page.evaluate(() => {
    const first = [{ transcript: 'Prima observație' }]; first.isFinal = true;
    const second = [{ transcript: 'A doua observație' }]; second.isFinal = true;
    window.__collectorRecognition.onresult({ resultIndex: 0, results: [first, second] });
  });
  await page.locator('#voiceSessionButton').click();
  await expect(page.locator('#confirmCoreCommand')).toBeVisible();
  await page.locator('#cancelCoreCommand').click();
  await expect(page.locator('#commandResult')).toContainText('Lot anulat');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events.length)).toBe(0);
});

test('voice session fallback keeps text entry available when speech recognition is unsupported', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: undefined });
    Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: undefined });
  });
  await page.goto('/index-server.html');
  await page.locator('.nav[data-page="work"]').click();
  await page.locator('#voiceSessionButton').click();
  await expect(page.locator('#commandResult')).toContainText('Sesiunea vocală nu este disponibilă');
  await expect(page.locator('#commandInput')).toBeFocused();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events.length)).toBe(0);
});


test('one-shot dictation remains available for structured commands', async ({ page }) => {
  await page.addInitScript(() => {
    window.__oneShotStarts = 0;
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: class {
      start() { window.__oneShotStarts += 1; this.onstart?.(); }
      stop() { this.onend?.(); }
    } });
  });
  await page.goto('/index-server.html');
  await page.locator('.nav[data-page="work"]').click();
  await page.getByRole('button', { name: 'Începe dictarea' }).click();
  await expect(page.locator('#voiceButton')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.__oneShotStarts)).toBe(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events.length)).toBe(0);
  await page.locator('#voiceButton').click();
  await expect(page.locator('#voiceButton')).toHaveAttribute('aria-pressed', 'false');
});


test('audio recorder reports denied microphone permission and keeps Core journal unchanged', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => { const error = new Error('permission denied'); error.name = 'NotAllowedError'; throw error; } } });
    window.MediaRecorder = class {};
  });
  await page.goto('/index-server.html');
  await page.locator('#globalVoice').click();
  await expect(page.locator('#audioRecorderStatus')).toContainText('Accesul la microfon a fost refuzat');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events.length)).toBe(0);
  expect(await page.evaluate(async () => (await window.CollectorAudioStore.list()).length)).toBe(0);
});


test('WORK exposes local reminder controls and explains browser limitation', async ({ page }) => {
  await page.goto('/index-server.html');
  await page.locator('.nav[data-page="work"]').click();
  await expect(page.locator('#workAlarmTitle')).toBeVisible();
  await expect(page.locator('#workAlarmWhen')).toBeVisible();
  await page.locator('#workAlarmTitle').fill('Verifică B3');
  await page.locator('#workAlarmWhen').fill('2030-01-01T10:00');
  await page.locator('#workAlarmAdd').click();
  await expect(page.locator('#workAlarmStatus')).toContainText('necesită aplicația Android');
  await expect(page.locator('#workAlarmList')).toContainText('disponibilă în aplicația Android');
});

test('voice read-back waits for microphone release and never commits without explicit confirmation', async ({ page }) => {
  await page.addInitScript(() => {
    window.__spokenReadbacks = [];
    window.__speechCancelCount = 0;
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: class {
      constructor(text) { this.text = text; }
    } });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => [{ lang: 'ro-RO', name: 'Romanian test voice' }],
      cancel() { window.__speechCancelCount += 1; },
      speak(utterance) {
        window.__spokenReadbacks.push(utterance.text);
        utterance.onstart?.();
        utterance.onend?.();
      }
    } });
    window.__collectorRecognition = null;
    window.SpeechRecognition = class {
      start() { window.__collectorRecognition = this; this.onstart?.(); }
      stop() { this.onend?.(); }
    };
  });
  await page.goto('/index-server.html');
  await page.locator('.nav[data-page="work"]').click();
  await page.locator('#voiceSessionButton').click();
  await page.evaluate(() => {
    const finalPhrase = [{ transcript: 'Pom B3 are frunze noi' }];
    finalPhrase.isFinal = true;
    window.__collectorRecognition.onresult({ resultIndex: 0, results: [finalPhrase] });
  });
  await page.locator('#voiceSessionButton').click();
  await expect(page.locator('#confirmCoreCommand')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__spokenReadbacks.length)).toBe(1);
  const readback = await page.evaluate(() => window.__spokenReadbacks[0]);
  expect(readback).toContain('Observație');
  expect(readback).toContain('Nu am salvat nimic');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events.length)).toBe(0);

  await page.locator('#confirmCoreCommand').click();
  await expect(page.locator('#commandResult')).toContainText('Salvat cu succes');
  await expect.poll(() => page.evaluate(() => window.__spokenReadbacks.length)).toBe(2);
  expect(await page.evaluate(() => window.__spokenReadbacks[1])).toContain('salvată cu succes');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events.length)).toBe(1);
});

test('voice preview remains usable when speech synthesis is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: undefined });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: undefined });
    window.__collectorRecognition = null;
    window.SpeechRecognition = class {
      start() { window.__collectorRecognition = this; this.onstart?.(); }
      stop() { this.onend?.(); }
    };
  });
  await page.goto('/index-server.html');
  await page.locator('.nav[data-page="work"]').click();
  await page.locator('#voiceSessionButton').click();
  await page.evaluate(() => {
    const phrase = [{ transcript: 'Observație fără sinteză vocală' }];
    phrase.isFinal = true;
    window.__collectorRecognition.onresult({ resultIndex: 0, results: [phrase] });
  });
  await page.locator('#voiceSessionButton').click();
  await expect(page.locator('#confirmCoreCommand')).toBeVisible();
  await expect(page.locator('#commandResult')).toContainText('Observație');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events.length)).toBe(0);
  await page.locator('#confirmCoreCommand').click();
  await expect(page.locator('#commandResult')).toContainText('Salvat cu succes');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events.length)).toBe(1);
});
