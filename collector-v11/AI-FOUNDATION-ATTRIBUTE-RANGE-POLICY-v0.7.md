# Collector v0.7 — Attribute Range Policy Fix

## Change
Numeric min/max values are advisory/recommended bounds, not hard validation constraints.

- Values inside the range are recorded normally.
- Values below/above the range trigger a confirmation warning and may still be recorded.
- Required attributes remain required.
- Optional initial values may be left blank; the attribute definition is saved without creating a measurement event.
- A minimum greater than the maximum is rejected as an invalid configuration.
- The same warning policy is applied to entity attributes, relation attributes, event attributes, corrections, and quick commands.
- UI labels now explicitly say “recommended limits”.

## Data safety
No existing event, entity, relation, population, stock balance, or stored attribute is rewritten by this code change. The update changes future validation behaviour only.

## Verification
Run `npm test`.
