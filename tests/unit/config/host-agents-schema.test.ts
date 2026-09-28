import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { PluginConfigSchema } from '../../../src/config/schema';

/**
 * `host_agents` config surface: exact-name host-agent exclusion, trimmed,
 * de-duplicated, capped at 64, defaulting to [] when the section is present but
 * empty. The top-level key must carry a JSON-Schema description (surface
 * ratchet, tests/unit/config/plugin-config-schema-surface.test.ts).
 */

const JSON_SCHEMA = z.toJSONSchema(PluginConfigSchema, { io: 'input' }) as {
	properties: Record<string, { description?: string }>;
};

describe('PluginConfigSchema host_agents', () => {
	test('accepts excluded_from_swarm and preserves the values', () => {
		const result = PluginConfigSchema.safeParse({
			host_agents: { excluded_from_swarm: ['free', 'local'] },
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.host_agents?.excluded_from_swarm).toEqual([
				'free',
				'local',
			]);
		}
	});

	test('absent config leaves host_agents undefined', () => {
		const result = PluginConfigSchema.safeParse({});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.host_agents).toBeUndefined();
		}
	});

	test('an empty host_agents object resolves excluded_from_swarm to []', () => {
		const result = PluginConfigSchema.safeParse({ host_agents: {} });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.host_agents?.excluded_from_swarm).toEqual([]);
		}
	});

	test('rejects empty, duplicate, non-string, and oversized entries', () => {
		const invalid: unknown[] = [
			['free', ''],
			['free', 'free'],
			['free', ' free '],
			['free', 42],
			Array.from({ length: 65 }, (_, i) => `agent_${i}`),
		];
		for (const excluded_from_swarm of invalid) {
			const result = PluginConfigSchema.safeParse({
				host_agents: { excluded_from_swarm },
			});
			expect(result.success, JSON.stringify(excluded_from_swarm)).toBe(false);
		}
	});

	test('rejects unknown keys inside host_agents (strict section)', () => {
		const result = PluginConfigSchema.safeParse({ host_agents: { typo: true } });
		expect(result.success).toBe(false);
	});

	test('host_agents carries a non-empty JSON-Schema description', () => {
		const description = JSON_SCHEMA.properties.host_agents?.description;
		expect(typeof description).toBe('string');
		expect((description ?? '').length).toBeGreaterThan(0);
	});
});
