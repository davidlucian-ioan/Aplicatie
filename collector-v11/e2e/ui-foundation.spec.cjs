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


test('voice context persists only after confirmation, expires after 30 minutes and can be cleared', async ({ page }) => {
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
  await page.locator('#newName').fill('B3 context');
  await page.locator('#newType').fill('aquarium');
  await page.locator('#modal button.primary').click();
  const entityId = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).entities.find(entity => entity.name === 'B3 context').id);

  await page.locator('.nav[data-page="attributes"]').click();
  await page.locator('#attributes .toolbar button.primary').click();
  await page.locator('#attrName').fill('pH');
  await page.locator('#attrType').selectOption('number');
  await page.locator('#modal button.primary').click();

  await page.locator('.nav[data-page="work"]').click();
  await expect(page.locator('#voiceContextLabel')).toContainText('niciun element selectat');
  await page.locator('#voiceSessionButton').click();
  await page.evaluate(() => {
    const phrase = [{ transcript: 'setează pH pentru B3 context = 6.4' }]; phrase.isFinal = true;
    window.__collectorRecognition.onresult({ resultIndex: 0, results: [phrase] });
  });
  await page.locator('#voiceSessionButton').click();
  await expect(page.locator('#confirmCoreCommand')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('collector_voice_context_v1'))).toBeNull();
  await page.locator('#confirmCoreCommand').click();
  await expect(page.locator('#commandResult')).toContainText('Salvat cu succes');
  await expect(page.locator('#voiceContextLabel')).toContainText('B3 context');
  const context = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_voice_context_v1')));
  expect(context.entityId).toBe(entityId);
  expect(context.expiresAt - context.updatedAt).toBe(30 * 60 * 1000);

  await page.reload();
  await page.locator('.nav[data-page="work"]').click();
  await expect(page.locator('#voiceContextLabel')).toContainText('B3 context');
  await page.locator('#voiceSessionButton').click();
  await page.evaluate(() => {
    const phrase = [{ transcript: 'setează pH = 6.5' }]; phrase.isFinal = true;
    window.__collectorRecognition.onresult({ resultIndex: 0, results: [phrase] });
  });
  await page.locator('#voiceSessionButton').click();
  await expect(page.locator('#confirmCoreCommand')).toBeVisible();
  await expect(page.locator('#commandResult')).toContainText('B3 context · context activ · pH = 6.5');
  await page.locator('#confirmCoreCommand').click();
  await expect(page.locator('#commandResult')).toContainText('Salvat cu succes');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).entities.find(entity => entity.name === 'B3 context').attributes.pH)).toBe(6.5);

  await page.evaluate(() => {
    const context = JSON.parse(localStorage.getItem('collector_voice_context_v1'));
    context.expiresAt = Date.now() - 1;
    localStorage.setItem('collector_voice_context_v1', JSON.stringify(context));
  });
  await page.reload();
  await page.locator('.nav[data-page="work"]').click();
  await expect(page.locator('#voiceContextLabel')).toContainText('niciun element selectat');
  await expect(page.locator('#clearVoiceContext')).toBeHidden();
  await page.locator('#voiceSessionButton').click();
  await page.evaluate(() => {
    const phrase = [{ transcript: 'setează pH = 6.7' }]; phrase.isFinal = true;
    window.__collectorRecognition.onresult({ resultIndex: 0, results: [phrase] });
  });
  await page.locator('#voiceSessionButton').click();
  await expect(page.locator('#commandResult')).toContainText('nu există context vocal activ');
  await expect(page.locator('#confirmCoreCommand')).toHaveCount(0);
});
test('voice context can be cleared explicitly by the user', async ({ page }) => {
  await page.goto('/index-server.html');
  await page.locator('.nav[data-page="entities"]').click();
  await page.locator('#entities .toolbar button.primary').click();
  await page.locator('#newName').fill('Context de șters');
  await page.locator('#newType').fill('plant');
  await page.locator('#modal button.primary').click();
  const entityId = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).entities.find(entity => entity.name === 'Context de șters').id);
  await page.evaluate(id => localStorage.setItem('collector_voice_context_v1', JSON.stringify({ entityId: id, updatedAt: Date.now(), expiresAt: Date.now() + 60000 })), entityId);
  await page.reload();
  await page.locator('.nav[data-page="work"]').click();
  await expect(page.locator('#voiceContextLabel')).toContainText('Context de șters');
  await expect(page.locator('#clearVoiceContext')).toBeVisible();
  await page.locator('#clearVoiceContext').click();
  await expect(page.locator('#voiceContextLabel')).toContainText('niciun element selectat');
  expect(await page.evaluate(() => localStorage.getItem('collector_voice_context_v1'))).toBeNull();
});
test('voice batch rejects the whole mixed batch when stock is insufficient', async ({ page }) => {
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
  await page.locator('#newName').fill('Plantă atomică');
  await page.locator('#newType').fill('plant');
  await page.locator('#modal button.primary').click();
  const plantId = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).entities.find(entity => entity.name === 'Plantă atomică').id);
  await page.locator('.nav[data-page="attributes"]').click();
  await page.locator('#attributes .toolbar button.primary').click();
  await page.locator('#attrName').fill('pH');
  await page.locator('#attrType').selectOption('number');
  await page.locator('#modal button.primary').click();
  await page.locator('.nav[data-page="inventory"]').click();
  await page.locator('#inventory .toolbar button.secondary').click();
  await page.locator('#popName').fill('Fancy insuficient');
  await page.locator('#popQty').fill('2');
  await page.locator('#modal button.primary').click();
  const populationId = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).entities.find(entity => entity.name === 'Fancy insuficient').id);
  const initialEvents = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events.length);

  await page.locator('.nav[data-page="work"]').click();
  await page.locator('#voiceSessionButton').click();
  await page.evaluate(() => {
    const first = [{ transcript: 'setează pH pentru Plantă atomică = 6.8' }]; first.isFinal = true;
    const second = [{ transcript: 'am vândut 3 Fancy insuficient' }]; second.isFinal = true;
    window.__collectorRecognition.onresult({ resultIndex: 0, results: [first, second] });
  });
  await page.locator('#voiceSessionButton').click();
  await expect(page.locator('#commandResult')).toContainText('Cantitate insuficientă');
  await expect(page.locator('#confirmCoreCommand')).toHaveCount(0);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')));
  expect(after.events).toHaveLength(initialEvents);
  expect(after.entities.find(entity => entity.id === plantId).attributes.pH).toBeUndefined();
  const balance = await page.evaluate((id) => window.CollectorEngine.balances(JSON.parse(localStorage.getItem('collector_mvp_v2'))).filter(item => item.populationId === id && item.disposition === 'active').reduce((sum, item) => sum + item.quantity, 0), populationId);
  expect(balance).toBe(2);
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


test('offline STT capability probe stays Android-only in the browser build', async ({ page }) => {
  await page.goto('/index-server.html');
  await page.locator('.nav[data-page="work"]').click();
  const initialEvents = await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events.length);
  await page.locator('#checkOfflineSpeech').click();
  await expect(page.locator('#offlineSpeechStatus')).toContainText('numai în aplicația Android');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events.length)).toBe(initialEvents);
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


test('Android live STT uses native on-device events and persists timestamped transcripts locally', async ({ page }) => {
  await page.addInitScript(() => {
    window.__nativeSpeechListeners = {};
    window.__nativeSpeechStarts = [];
    window.__browserRecognitionStarts = 0;
    window.CollectorAndroidSpeech = {
      isAvailable: () => true,
      addListener: async (name, listener) => {
        window.__nativeSpeechListeners[name] = listener;
        return { remove: async () => { delete window.__nativeSpeechListeners[name]; } };
      },
      startListening: async (language, continuous) => {
        window.__nativeSpeechStarts.push({ language, continuous });
        return { sessionId: 'native-session-e2e', startedAt: Date.now() };
      },
      stopListening: async sessionId => {
        window.__nativeSpeechListeners.speechState?.({ sessionId, status: 'stopped' });
      },
    };
    window.SpeechRecognition = class {
      start() { window.__browserRecognitionStarts += 1; }
    };
  });
  await page.goto('/index-server.html');
  await page.locator('.nav[data-page="work"]').click();
  await page.locator('#voiceSessionButton').click();
  await expect(page.locator('#voiceSessionButton')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => window.__nativeSpeechStarts.length)).toBe(1);
  expect(await page.evaluate(() => window.__nativeSpeechStarts[0])).toEqual({ language: 'ro-RO', continuous: true });
  await page.evaluate(() => window.__nativeSpeechListeners.speechSegment({
    sessionId: 'native-session-e2e',
    segmentId: 'segment-1',
    text: 'Pom B3 are frunze noi',
    startOffsetMs: 120,
    endOffsetMs: 980,
    startedAt: 1000120,
    endedAt: 1000980,
    confidence: 0.94,
    language: 'ro-RO',
    provider: 'android-speech-recognizer-on-device',
  }));
  await page.locator('#voiceSessionButton').click();
  await expect(page.locator('#confirmCoreCommand')).toBeVisible();
  expect(await page.evaluate(() => window.__browserRecognitionStarts)).toBe(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events.length)).toBe(0);
  const stored = await page.evaluate(async () => window.CollectorAudioStore.listTranscriptSessions());
  expect(stored).toHaveLength(1);
  expect(stored[0].audioRecordingId).toBeNull();
  expect(stored[0].audioLinkStatus).toBe('not-linked');
  expect(stored[0].segments[0].startOffsetMs).toBe(120);
  expect(stored[0].segments[0].endOffsetMs).toBe(980);
  await page.locator('#cancelCoreCommand').click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events.length)).toBe(0);
});

test('Android one-shot dictation uses native on-device STT and does not call browser recognition', async ({ page }) => {
  await page.addInitScript(() => {
    window.__nativeSpeechListeners = {};
    window.__nativeSpeechStarts = [];
    window.__browserRecognitionStarts = 0;
    window.CollectorAndroidSpeech = {
      isAvailable: () => true,
      addListener: async (name, listener) => {
        window.__nativeSpeechListeners[name] = listener;
        return { remove: async () => { delete window.__nativeSpeechListeners[name]; } };
      },
      startListening: async (language, continuous) => {
        window.__nativeSpeechStarts.push({ language, continuous });
        return { sessionId: 'native-dictation-e2e', startedAt: Date.now() };
      },
      stopListening: async () => {},
    };
    window.SpeechRecognition = class {
      start() { window.__browserRecognitionStarts += 1; }
    };
  });
  await page.goto('/index-server.html');
  await page.locator('.nav[data-page="work"]').click();
  await page.locator('#voiceButton').click();
  await expect(page.locator('#voiceButton')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => window.__nativeSpeechStarts.length)).toBe(1);
  expect(await page.evaluate(() => window.__nativeSpeechStarts[0])).toEqual({ language: 'ro-RO', continuous: false });
  await page.evaluate(() => {
    window.__nativeSpeechListeners.speechSegment({
      sessionId: 'native-dictation-e2e', segmentId: 'dictation-segment',
      text: 'Pom B3 are frunze noi', startOffsetMs: 0, endOffsetMs: 900,
      startedAt: 2000000, endedAt: 2000900, confidence: 0.91,
      language: 'ro-RO', provider: 'android-speech-recognizer-on-device',
    });
    window.__nativeSpeechListeners.speechState?.({ sessionId: 'native-dictation-e2e', status: 'stopped' });
  });
  await expect(page.locator('#confirmCoreCommand')).toBeVisible();
  expect(await page.evaluate(() => window.__browserRecognitionStarts)).toBe(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events.length)).toBe(0);
});


test('Android STT failure never falls back to browser or cloud recognition', async ({ page }) => {
  await page.addInitScript(() => {
    window.__browserRecognitionStarts = 0;
    window.CollectorAndroidSpeech = {
      isAvailable: () => true,
      addListener: async () => ({ remove: async () => {} }),
      startListening: async () => { throw new Error('Romanian on-device model unavailable'); },
      stopListening: async () => {},
    };
    window.SpeechRecognition = class {
      start() { window.__browserRecognitionStarts += 1; }
    };
  });
  await page.goto('/index-server.html');
  await page.locator('.nav[data-page="work"]').click();
  await page.locator('#voiceButton').click();
  await expect(page.locator('#commandResult')).toContainText('Nu am folosit un serviciu cloud');
  expect(await page.evaluate(() => window.__browserRecognitionStarts)).toBe(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('collector_mvp_v2')).events.length)).toBe(0);
});
