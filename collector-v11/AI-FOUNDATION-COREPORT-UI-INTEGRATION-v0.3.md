# Collector — Core Port UI Integration v0.3

**Status:** document istoric pentru integrarea Core Port inițială; informațiile despre providerul AI sunt depășite. Consultați `AI-PIPELINE-STATUS-v0.4.md` pentru starea curentă.

## Ce este integrat

- Interfața „Introducere rapidă” folosește BrowserCorePort pentru comenzile acceptate de parserul determinist existent.
- Fluxul este: interpretare deterministă → comandă `collector.command.v1` → preview prin Core → confirmare explicită → execuție → persistență în `localStorage` → publicarea stării în UI.
- Preview-ul nu persistă și nu publică starea.
- Execuția scrie mai întâi în `localStorage`; numai după succes actualizează starea din memorie și interfața.
- `idempotencyKey` este mapat la `event.intentKey`.
- Modificările de stoc sunt tratate ca operații cu risc ridicat și necesită confirmare.
- Payload-ul comenzii este păstrat în eveniment pentru observații și audit.
- `index.html`, `index-server.html` și `Deschide-prin-dublu-click.html` încarcă BrowserCorePort.

## Limitări explicite

- La data acestui document, providerul LLM nu era încă conectat. Această limitare a fost depășită ulterior prin `provider-openai.js` și `provider-openai-browser.js`.
- La data acestui document, modulele Node din `ai/` erau separate de UI; ulterior au fost adăugate module browser pentru interpretarea OpenAI, structured memory, recall și audio recovery.
- Integrarea UI/Core Port acoperă comenzile rapide existente: observație, setare atribut definit și vânzare dintr-o populație.
- Restul formularelor UI păstrează fluxul Core existent; nu au fost migrate în această etapă.

## Verificare

Testele automate includ preview fără scriere, persistență înainte de publicare, eșec de persistență fără publicare, confirmare pentru stoc și testele anterioare Core/AI/corrections.
