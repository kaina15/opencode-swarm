# Host agents excluded from the swarm (`host_agents.excluded_from_swarm`)

Adds a first-class way to keep host-provided OpenCode agents fully outside the swarm
while leaving them selectable in OpenCode.

## Changes

- **New top-level config `host_agents.excluded_from_swarm`** (`src/config/schema.ts`):
  array of exact host-agent names (e.g. `["free", "local"]`), trimmed, non-empty,
  de-duplicated, capped at 64, defaulting to `[]`. Names are matched **exactly** —
  never through `stripKnownSwarmPrefix` — so `local` cannot collide with a generated
  `local_architect`/`local_coder`.

- **Shared boundary classifier** (`src/config/host-agent-boundary.ts`): pure leaf module
  classifying any identity as `generated-swarm-agent`, `excluded-host-agent`,
  `other-host-agent`, or `host-internal-agent`, with the generated-agent registry as the
  positive authority and a conflict diagnostic for names that are both.

- **Config hook** (`src/index.ts`): every listed host agent gets explicit `deny`
  permission entries for the whole plugin tool surface (the canonical
  `buildPermissionBlock` mechanism), plus the legacy `tools: false` map as reinforcement.
  The agent stays selectable; built-ins, MCPs, and other agents are untouched. A listed
  name with no matching agent emits a deferred warning instead of creating a phantom
  entry.

- **Session isolation** (`src/index.ts`): a session running an excluded host agent
  records its identity on the existing bounded `activeAgent` map and skips every swarm
  surface — `chat.message` (no state, advisory, model preflight/override, live-context
  seed, delegation handler, cohort cache, Full-Auto cadence), `tool.execute.before`
  (typed `SWARM_HOST_AGENT_EXCLUDED` refusal for swarm tools and dispatches into
  generated swarm agents; external tools/delegations pass untouched),
  `tool.execute.after` (no bookkeeping), both chat transforms, `session.compacting`
  (still advances the per-turn ledger generation, skips swarm writes/customizer),
  `text.complete`, `command.execute.before`, and the `event` hook (identity entry
  released on session deletion).

- **Non-architect advisory** (`src/hooks/non-architect-advisory.ts`): now consumes the
  shared host-internal agent set from the boundary module.
