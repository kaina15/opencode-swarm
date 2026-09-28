import { describe, expect, test } from 'bun:test';
import {
	classifyHostAgentName,
	findExcludedFromSwarmGeneratedNameConflicts,
	isExcludedHostAgentName,
	normalizeExcludedFromSwarm,
} from '../../../src/config/host-agent-boundary';

/**
 * Host-agent boundary classifier: exact-name exclusion of host agents
 * (`free`/`local`) must never strip a swarm prefix, and a generated swarm agent
 * always wins over the excluded-host bucket.
 */

const GENERATED = [
	'architect',
	'coder',
	'mega_architect',
	'local_architect',
	'local_coder',
];
const EXCLUDED = ['free', 'local'];

const opts = {
	excludedFromSwarm: EXCLUDED,
	generatedAgentNames: GENERATED,
};

describe('classifyHostAgentName', () => {
	test('exact host names classify as excluded-host-agent', () => {
		expect(classifyHostAgentName('free', opts)).toBe('excluded-host-agent');
		expect(classifyHostAgentName('local', opts)).toBe('excluded-host-agent');
	});

	test('generated swarm agents win over the excluded-host bucket', () => {
		expect(classifyHostAgentName('local_architect', opts)).toBe(
			'generated-swarm-agent',
		);
		expect(classifyHostAgentName('local_coder', opts)).toBe(
			'generated-swarm-agent',
		);
	});

	test('host-internal and other host agents', () => {
		expect(classifyHostAgentName('compaction', opts)).toBe(
			'host-internal-agent',
		);
		expect(classifyHostAgentName('general', opts)).toBe('other-host-agent');
	});
});

describe('isExcludedHostAgentName', () => {
	test('exact match only, case-sensitive, never prefix-stripped', () => {
		expect(isExcludedHostAgentName('free', EXCLUDED)).toBe(true);
		expect(isExcludedHostAgentName('free_architect', EXCLUDED)).toBe(false);
		expect(isExcludedHostAgentName('Free', EXCLUDED)).toBe(false);
		expect(isExcludedHostAgentName('', EXCLUDED)).toBe(false);
	});
});

describe('findExcludedFromSwarmGeneratedNameConflicts', () => {
	test('returns the intersection ordered by excludedFromSwarm', () => {
		expect(
			findExcludedFromSwarmGeneratedNameConflicts(
				['free', 'mega_coder'],
				['mega_coder', 'architect'],
			),
		).toEqual(['mega_coder']);
	});
});

describe('normalizeExcludedFromSwarm', () => {
	test('trims, drops empties, de-duplicates, preserves first-seen order', () => {
		expect(
			normalizeExcludedFromSwarm([' free ', 'local', 'local', '']),
		).toEqual(['free', 'local']);
	});

	test('non-arrays resolve to []', () => {
		expect(normalizeExcludedFromSwarm('x')).toEqual([]);
	});

	test('drops non-string entries and caps at 64', () => {
		expect(normalizeExcludedFromSwarm(['free', 42, null, 'local'])).toEqual([
			'free',
			'local',
		]);
		const oversized = Array.from({ length: 80 }, (_, i) => `agent_${i}`);
		expect(normalizeExcludedFromSwarm(oversized)).toHaveLength(64);
	});
});
