# Why this fork exists

This fork is a **fix for a problem we are experiencing**: agents that do not belong to the swarm environment were getting their context inflated by that environment's tools.

## The problem

Host agents in OpenCode — agents such as `free` and `local` that run outside the swarm — still had swarm surfaces attached to their sessions: swarm tools, advisories, model-chain overrides and injected state. An "environment" the agent does not belong to was inflating its context with content it never asked for.

## The fix

Branch `feat/host-agents-excluded-from-swarm` adds `host_agents.excluded_from_swarm`: a list of exact host-agent names whose sessions are excluded from every swarm surface.

```json
{
  "host_agents": {
    "excluded_from_swarm": ["free", "local"]
  }
}
```

Excluded agents stay selectable in OpenCode, and the swarm keeps working normally for its own agents — but for the excluded ones no swarm tool is exposed, no advisory or state is injected, and dispatches into generated swarm agents are refused with a typed error (`SWARM_HOST_AGENT_EXCLUDED`).

Full details: `docs/configuration.md` and `docs/releases/pending/host-agents-excluded-from-swarm.md`.

---

Fork of [ZaxbyHub/opencode-swarm](https://github.com/ZaxbyHub/opencode-swarm) — base `62590524a`, fix commit `9c3499e6f`.
