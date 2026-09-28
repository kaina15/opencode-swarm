/**
 * Host-agent boundary classifier — a DEPENDENCY-FREE leaf module.
 *
 * Single place that classifies an OpenCode agent identity against the swarm's
 * positive authority (`generatedAgentNames`, the names this plugin instance
 * actually generated) and the explicit `host_agents.excluded_from_swarm`
 * exclusion list. Exact-name matching only: the exclusion list is never
 * passed through `stripKnownSwarmPrefix`, so a host agent named `local` can
 * never collide with a generated agent named `local_architect`.
 *
 * Keep this module free of state and imports (see src/config/agent-names.ts
 * for the leaf-module convention) so every hook can consume it without
 * creating an initialization cycle.
 */

/** Host-internal OpenCode agents that never carry user chat. */
export const HOST_INTERNAL_AGENT_NAMES: ReadonlySet<string> = new Set([
	'compaction',
	'title',
	'summary',
]);

export type HostAgentClass =
	| 'generated-swarm-agent'
	| 'excluded-host-agent'
	| 'other-host-agent'
	| 'host-internal-agent';

/** Finite cap shared with the config schema (defense in depth). */
const MAX_EXCLUDED_FROM_SWARM_ENTRIES = 64;

/**
 * Defensive normalizer for raw config values: non-arrays become `[]`, entries
 * are trimmed, empty/whitespace-only entries are dropped, duplicates keep
 * their first occurrence, and the result is capped.
 */
export function normalizeExcludedFromSwarm(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const seen = new Set<string>();
	const normalized: string[] = [];
	for (const entry of value) {
		if (typeof entry !== 'string') continue;
		const trimmed = entry.trim();
		if (trimmed === '') continue;
		if (seen.has(trimmed)) continue;
		seen.add(trimmed);
		normalized.push(trimmed);
		if (normalized.length >= MAX_EXCLUDED_FROM_SWARM_ENTRIES) break;
	}
	return normalized;
}

/**
 * True when `agentName` exactly matches an entry of the exclusion list.
 * Empty/whitespace-only names and prefix variants never match.
 */
export function isExcludedHostAgentName(
	agentName: string,
	excludedFromSwarm: readonly string[],
): boolean {
	if (typeof agentName !== 'string') return false;
	const trimmed = agentName.trim();
	if (trimmed === '') return false;
	return excludedFromSwarm.includes(trimmed);
}

/**
 * Classify an agent identity. Precedence: generated swarm agent (positive
 * authority) > excluded host agent (explicit negation) > host-internal agent
 * > other host agent.
 */
export function classifyHostAgentName(
	agentName: string,
	opts: {
		excludedFromSwarm: readonly string[];
		generatedAgentNames: readonly string[];
	},
): HostAgentClass {
	if (opts.generatedAgentNames.includes(agentName)) {
		return 'generated-swarm-agent';
	}
	if (opts.excludedFromSwarm.includes(agentName)) {
		return 'excluded-host-agent';
	}
	if (HOST_INTERNAL_AGENT_NAMES.has(agentName)) {
		return 'host-internal-agent';
	}
	return 'other-host-agent';
}

/** Names present in both lists, ordered by `excludedFromSwarm`. */
export function findExcludedFromSwarmGeneratedNameConflicts(
	excludedFromSwarm: readonly string[],
	generatedAgentNames: readonly string[],
): string[] {
	const generated = new Set(generatedAgentNames);
	return excludedFromSwarm.filter((name) => generated.has(name));
}
