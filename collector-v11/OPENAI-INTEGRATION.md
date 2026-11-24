# Collector — OpenAI API provider v1

## Decizie

OpenAI este providerul cloud pentru interpretarea limbajului natural. Integrarea folosește Responses API și Structured Outputs. Providerul nu primește acces la Core, localStorage sau operații de scriere.

## Flux

1. UI trimite textul și un context limitat (entități și definiții de atribute) către serverul local.
2. Serverul apelează OpenAI Responses API cu o schemă strictă.
3. Providerul întoarce răspuns, clarificare sau propunere structurată.
4. Providerul validează interpretarea cu contractele Collector, apoi browserul folosește comanda `collector.command.v1`.
5. BrowserCorePort execută preview și validează toate operațiile.
6. Utilizatorul confirmă explicit.
7. Core execută atomic și persistă în localStorage.

OpenAI nu poate apela instrumente, nu execută comenzi și nu primește datele brute ale jurnalului.

## Configurare locală

- Instalează Node.js 22 sau mai nou.
- Copiază `.env.example` în `.env` în folderul `collector-v11`.
- Deschide `.env` și completează `OPENAI_API_KEY=cheia-ta`.
- Opțional: modifică `OPENAI_MODEL` (implicit `gpt-6.2-sol`).
- Salvează fișierul și pornește `Porneste-Collector.bat`.

Fișierul `.env` este ignorat de Git și nu este publicat. Nu trimite cheia API în conversații și nu o introduce în codul HTML/JavaScript.

## Protecții

- Serverul ascultă implicit numai pe 127.0.0.1.
- Endpoint-urile API nu acceptă cereri cross-origin externe.
- Serverul static refuză toate fișierele ascunse (inclusiv `.env` și `.git`), modulele private ale providerului, fișierele server/test și documentația internă.
- Răspunsurile statice includ Content Security Policy same-origin, `X-Frame-Options: DENY`, `Permissions-Policy` și `Referrer-Policy`.
- Limită de 128 KB per corp HTTP și 20 cereri/minut per client.
- Contextul trimis este limitat la 150 entități și 100 definiții de atribute.
- Testul de integrare pornește serverul local și verifică endpoint-urile, protecția Origin, blocarea fișierelor private și comportamentul fără cheie.
- `store:false` pentru cererile Responses API.
- Preview-ul Core rămâne obligatoriu; executarea nu se face din răspunsul modelului.
- Operațiile nepermise sunt respinse de BrowserCorePort.
- Modul offline și funcțiile locale rămân disponibile dacă providerul nu este configurat.

## Limitări actuale

- În această etapă, textul este trimis la OpenAI; înregistrările audio rămân locale. Transcrierea cloud și Realtime API sunt etape separate.
- Nu există încă autentificare multiutilizator; serverul este destinat utilizării locale pe dispozitiv.
- Modelul și disponibilitatea lui depind de proiectul API al utilizatorului.
