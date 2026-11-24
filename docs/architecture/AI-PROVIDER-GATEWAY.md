# Collector — AI provider and gateway

Updated: 2026-11-24

## Current implementation

This branch adds the provider and server transport layers, but does not yet activate AI calls from the WORK UI.

- `OpenAIResponsesProvider` is server-only. It calls the OpenAI Responses API using `OPENAI_API_KEY` and `OPENAI_MODEL` from the server environment.
- Interpretation uses strict JSON Schema output. The model returns a typed intent and a command draft; operation data is encoded as JSON strings, parsed server-side and validated against `collector.command.v1`.
- The Orchestrator remains the owner of `turnId` and idempotency. Provider-supplied IDs are replaced before decision-gate/Core validation.
- Operational answers use a separate `respond()` stage. The only data passed to that stage is the result of the explicit Core Read Adapter request.
- Responses API calls set `store: false`; the gateway itself does not persist conversation content.
- `HttpProvider` is a browser-safe transport to the gateway. It requires an injected `getAccessToken()` function; it does not read, persist or embed a static secret.
- `server/ai-gateway.js` provides authenticated `/v1/interpret` and `/v1/respond` routes, body-size limits, origin allowlisting, bearer authentication and per-IP rate limiting.
- `server/start-ai-gateway.js` is the environment-configured entrypoint. `server/.env.example` contains names only, not credentials.

## Security boundaries

1. `OPENAI_API_KEY` exists only in the server process environment.
2. `COLLECTOR_AI_GATEWAY_TOKEN` is a server-side secret. It must never be copied into `app.js`, HTML, JavaScript bundles, Android resources or the APK.
3. A production client must obtain a short-lived access token through an authentication mechanism (for example, an identity-aware reverse proxy or a dedicated auth service). The current project has not yet selected or implemented that identity mechanism.
4. The gateway cannot commit Collector data. It has no Core object, database handle or write port.
5. Every model proposal remains untrusted. The local Orchestrator and Core Port validate, preview and require explicit user confirmation.
6. Provider errors do not log prompt bodies, Core data or credentials.
7. The gateway is stateless and has no conversation-history store. Only the minimum input/context required for the current turn is forwarded.

## Local server setup

From `collector-v11`, install dependencies and provide environment variables to the server process:

```bash
npm ci
# Set OPENAI_API_KEY, OPENAI_MODEL, COLLECTOR_AI_GATEWAY_TOKEN,
# COLLECTOR_ALLOWED_ORIGINS and PORT in the process environment.
npm run start:ai-gateway
```

The gateway listens on `0.0.0.0:PORT`. Put it behind HTTPS termination and an identity-aware access layer before exposing it outside a trusted development network. The shared bearer token is suitable for controlled local testing, not a substitute for production user authentication.

## Not yet connected

- The WORK UI does not instantiate `HttpProvider` yet.
- No gateway URL or user-authentication flow is configured in the app.
- No API key, model name, billing project or hosting provider has been supplied.
- No provider request should run until the app can obtain a short-lived access token without embedding a server secret.
- OpenAI model selection is intentionally environment-configured; this branch does not guess a model name or budget.
- The real provider is not considered integrated until an authenticated end-to-end request works from Android and browser, with Core read/preview/confirm tests passing.

## Next integration gates

1. Select the OpenAI model and API budget (or replace the server provider with another implementation of the same interface).
2. Select hosting and authentication for the gateway.
3. Implement Android secure token acquisition and the browser authentication flow.
4. Wire `HttpProvider` into WORK in an explicit AI-enabled mode; retain deterministic/offline operation when the gateway is unavailable.
5. Test read-only questions, ambiguous entity resolution, proposal preview, confirmation, retries, token expiry, rate limiting and provider outage.
6. Keep AI writes disabled until all authorization and physical-device tests pass.
