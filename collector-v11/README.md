# Collector MVP v11

Aplicația executabilă Collector v11. Documentele canonice de produs și deciziile sunt în rădăcina repository-ului.

## Pornire Windows

Dublu-click pe `Porneste-Collector.bat`, apoi deschide `http://localhost:8000/index-server.html`. Lasă fereastra serverului deschisă.

## Cerințe pentru testare

Necesită Node.js 22 sau mai nou. Din acest folder:

```bash
npm ci
npx playwright install chromium
```

## Comenzi de testare

```bash
npm test
npm run test:properties
npm run test:core-properties
npm run test:coverage
npm run benchmark:replay
npm run test:e2e
```

Sau rulează tot lanțul cu:

```bash
npm run test:all
```

- `test`: teste unitare și de regresie Core/AI Foundation.
- `test:properties`: generare de secvențe stoc și verificarea invariantelor Replay.
- `test:core-properties`: corecții, mutări, relații, cicluri și atomicitate, cu secvențe generate.
- `test:coverage`: raport Node.js coverage informativ; nu există încă prag blocant.
- `benchmark:replay`: măsoară Replay pentru 100, 1.000 și 10.000 de evenimente sintetice mixte; nu are prag absolut de eșec.
- `test:e2e`: teste Chromium reale pentru fluxurile utilizatorului.

Testele Playwright folosesc un server temporar pe portul 4173 și un profil de browser izolat. Nu citesc profilul personal și nu folosesc date operaționale reale. Rapoartele se scriu în `test-results/` și `playwright-report/`.

CI rulează toate nivelurile la fiecare Pull Request și păstrează raportul de coverage și benchmark-ul Replay ca artifact GitHub Actions.

Limitele min/max ale atributelor sunt intervale recomandate: măsurătorile reale în afara intervalului se pot înregistra cu avertisment. AI Foundation folosește un provider mock; nu există încă provider AI real conectat.

## Android (development scaffold)

Requires JDK 21, Android SDK, and an Android Studio installation.

From this folder:

```bash
npm ci
npm run android:add
npm run android:open
```

The first command generates the local Capacitor Android project, adds the microphone and foreground-service manifest declarations, and syncs the native plugins. The generated `android/` directory is intentionally ignored by Git; its creation and manifest patch are reproducible from the committed config and scripts.

After changing web assets or native dependencies:

```bash
npm run android:sync
npm run android:build
```

The app-owned native microphone foreground service and Capacitor bridge are implemented and compile in CI. Physical-device validation is still outstanding; do not rely on screen-off recording until the device acceptance checks pass.


## Android on-device Romanian STT

The Android app now includes a native on-device speech recognition runtime for Romanian (`ro-RO`). On Android, WORK dictation and live transcription use `SpeechRecognizer.createOnDeviceSpeechRecognizer` only. There is no browser/cloud fallback when the native runtime is unavailable. The device must have the Romanian on-device language model installed.

Final transcript utterances are timestamped and saved locally in a separate IndexedDB transcript store. Transcript segments are not yet linked to the MediaRecorder audio file; the current Android SpeechRecognizer API does not expose the PCM stream needed for a truthful audio-file association.

The foreground recorder service and speech recognizer share an exclusive OS microphone lock. Physical-device acceptance testing is still required; CI compilation alone does not validate microphone behavior, model availability or Romanian accuracy.
