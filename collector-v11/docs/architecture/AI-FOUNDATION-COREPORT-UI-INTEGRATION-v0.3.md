# Collector — Core Port UI Integration v0.3

**Status:** integrare locală implementată; provider AI real neconectat.

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

- Nu există încă furnizor LLM/AI conectat. Parserul curent recunoaște numai formele deterministe implementate în `parseCommand()`.
- Nu există încă orchestrator conversațional în browser; modulele Node din `ai/` rămân separate pentru testare și integrare ulterioară.
- Integrarea UI/Core Port acoperă comenzile rapide existente: observație, setare atribut definit și vânzare dintr-o populație.
- Restul formularelor UI păstrează fluxul Core existent; nu au fost migrate în această etapă.

## Verificare

Testele automate includ preview fără scriere, persistență înainte de publicare, eșec de persistență fără publicare, confirmare pentru stoc și testele anterioare Core/AI/corrections.
