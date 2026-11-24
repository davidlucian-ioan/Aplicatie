# Collector — OpenAI API provider v1

## Decizie

OpenAI este providerul cloud pentru interpretarea limbajului natural. Integrarea folosește Responses API și Structured Outputs. Providerul nu primește acces la Core, localStorage sau operații de scriere.

## Flux

1. UI trimite textul și un context limitat (entități și definiții de atribute) către serverul local.
2. Serverul apelează OpenAI Responses API cu o schemă strictă.
3. Providerul întoarce răspuns, clarificare sau propunere structurată.
4. Browserul transformă propunerea în contractul `collector.command.v1`.
5. BrowserCorePort execută preview și validează toate operațiile.
6. Utilizatorul confirmă explicit.
7. Core execută atomic și persistă în localStorage.

OpenAI nu poate apela instrumente, nu execută comenzi și nu primește datele brute ale jurnalului.

## Configurare locală

- Instalează Node.js 22 sau mai nou.
- Setează `OPENAI_API_KEY` ca variabilă de mediu în sesiunea Windows.
- Opțional: setează `OPENAI_MODEL` (implicit `gpt-6.2-sol`).
- Pornește `Porneste-Collector.bat`.

Exemplu PowerShell pentru sesiunea curentă:

```powershell
$env:OPENAI_API_KEY = "cheia-ta"
$env:OPENAI_MODEL = "gpt-6.2-sol"
.Porneste-Collector.bat
```

Cheia rămâne pe server și nu este transmisă în browser sau salvată în Git. Nu o introduce în HTML, JavaScript, localStorage sau repository.

## Protecții

- Serverul ascultă implicit numai pe 127.0.0.1.
- Endpoint-urile API nu acceptă cereri cross-origin externe.
- Limită de 128 KB per corp HTTP și 20 cereri/minut per client.
- Contextul trimis este limitat la 150 entități și 100 definiții de atribute.
- `store:false` pentru cererile Responses API.
- Preview-ul Core rămâne obligatoriu; executarea nu se face din răspunsul modelului.
- Operațiile nepermise sunt respinse de BrowserCorePort.
- Modul offline și funcțiile locale rămân disponibile dacă providerul nu este configurat.

## Limitări actuale

- În această etapă, textul este trimis la OpenAI; înregistrările audio rămân locale. Transcrierea cloud și Realtime API sunt etape separate.
- Nu există încă autentificare multiutilizator; serverul este destinat utilizării locale pe dispozitiv.
- Modelul și disponibilitatea lui depind de proiectul API al utilizatorului.
