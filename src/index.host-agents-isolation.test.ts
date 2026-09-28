/**
 * Host-agent exclusion (host_agents.excluded_from_swarm) integration tests.
 *
 * A session running an excluded host agent (e.g. `free`, `local`) must:
 *  - keep the agent selectable in OpenCode, but have every swarm tool denied
 *    through the canonical permission block (config hook);
 *  - create no swarm state / advisory / injection / fallback (chat.message);
 *  - refuse swarm tools and dispatches into generated swarm agents, while
 *    external tools and external delegations pass untouched (tool.execute.*);
 *  - skip every remaining swarm surface (transforms, compacting, text.complete,
 *    commands, events).
 */

import { afterAll, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import type { HostPartsMessage } from '../tests/helpers/host-contract-v1_18_3';
import {
	bootSwarmPluginHost,
	createPluginHostProject,
} from '../tests/helpers/plugin-host';
import { resetSwarmState, swarmState } from './state';
import { TOOL_NAMES } from './tools/tool-names';

let hostDirectory: string;
let host: Awaited<ReturnType<typeof bootSwarmPluginHost>>;

async function bootHost(): Promise<void> {
	hostDirectory = createPluginHostProject('host-agents-isolation');
	host = await bootSwarmPluginHost(hostDirectory, {
		host_agents: { excluded_from_swarm: ['free', 'local', 'ghost'] },
		knowledge: { enabled: false, hive_enabled: false },
		memory: { enabled: false },
		hooks: { delegation_gate: false },
	});
}

async function mapExcludedSession(sessionID: string): Promise<void> {
	await host.hooks['chat.message']({ sessionID, agent: 'free' }, {});
}

const bootPromise = bootHost();

describe('host_agents.excluded_from_swarm — config hook denials', () => {
	it('denies the whole plugin tool surface on free/local and keeps them selectable', async () => {
		await bootPromise;
		const opencodeConfig: Record<string, unknown> = {
			agent: {
				free: { mode: 'primary', permission: { '*': 'allow' } },
				local: { mode: 'primary', permission: { '*': 'deny', task: 'allow' } },
				omni: { mode: 'subagent', permission: { '*': 'allow' } },
			},
		};
		await host.hooks.config(opencodeConfig);

		const agentConfig = opencodeConfig.agent as Record<
			string,
			{
				mode?: string;
				permission?: Record<string, unknown>;
				tools?: Record<string, unknown>;
			}
		>;
		expect(agentConfig.free?.mode).toBe('primary');
		expect(agentConfig.local?.mode).toBe('primary');
		for (const toolName of TOOL_NAMES) {
			expect(agentConfig.free?.permission?.[toolName]).toBe('deny');
			expect(agentConfig.local?.permission?.[toolName]).toBe('deny');
			expect(agentConfig.free?.tools?.[toolName]).toBe(false);
		}
		// Unrelated host agents are untouched.
		expect(agentConfig.omni?.permission?.['save_plan']).toBeUndefined();
		// A listed name with no host agent never becomes a phantom entry.
		expect(agentConfig.ghost).toBeUndefined();
	});
});

describe('host_agents.excluded_from_swarm — session isolation', () => {
	beforeEach(() => {
		resetSwarmState();
	});

	it('chat.message records identity but creates no swarm state or advisory', async () => {
		await bootPromise;
		const sessionID = 'host-agent-chat-1';
		await mapExcludedSession(sessionID);
		expect(swarmState.activeAgent.get(sessionID)).toBe('free');
		expect(swarmState.agentSessions.get(sessionID)).toBeUndefined();
	});

	it('tool.execute.before refuses swarm tools with a typed error', async () => {
		await bootPromise;
		const sessionID = 'host-agent-tool-1';
		await mapExcludedSession(sessionID);
		await expect(
			host.hooks['tool.execute.before'](
				{ tool: 'save_plan', sessionID, callID: 'call-swarm-tool' },
				{ args: {} },
			),
		).rejects.toThrow(/SWARM_HOST_AGENT_EXCLUDED/);
	});

	it('tool.execute.before refuses dispatches into generated swarm agents', async () => {
		await bootPromise;
		const sessionID = 'host-agent-tool-2';
		await mapExcludedSession(sessionID);
		await expect(
			host.hooks['tool.execute.before'](
				{ tool: 'task', sessionID, callID: 'call-gen-dispatch' },
				{ args: { subagent_type: 'coder' } },
			),
		).rejects.toThrow(/SWARM_HOST_AGENT_EXCLUDED/);
	});

	it('tool.execute.before lets external delegations and host tools through', async () => {
		await bootPromise;
		const sessionID = 'host-agent-tool-3';
		await mapExcludedSession(sessionID);
		await expect(
			host.hooks['tool.execute.before'](
				{ tool: 'task', sessionID, callID: 'call-ext-dispatch' },
				{ args: { subagent_type: 'omni' } },
			),
		).resolves.toBeUndefined();
		await expect(
			host.hooks['tool.execute.before'](
				{ tool: 'read', sessionID, callID: 'call-read' },
				{ args: { filePath: 'x' } },
			),
		).resolves.toBeUndefined();
	});

	it('tool.execute.after is a no-op and creates no swarm state', async () => {
		await bootPromise;
		const sessionID = 'host-agent-tool-4';
		await mapExcludedSession(sessionID);
		await expect(
			host.hooks['tool.execute.after'](
				{ tool: 'read', sessionID, callID: 'call-read' },
				{ title: '', output: '', metadata: {} },
			),
		).resolves.toBeUndefined();
		expect(swarmState.agentSessions.get(sessionID)).toBeUndefined();
	});

	it('system/messages transforms, compacting, text.complete and commands skip the session', async () => {
		await bootPromise;
		const sessionID = 'host-agent-surface-1';
		await mapExcludedSession(sessionID);

		const systemOutput: { system: string[] } = { system: ['base'] };
		await host.hooks['experimental.chat.system.transform'](
			{ sessionID, model: {} },
			systemOutput,
		);
		expect(systemOutput.system).toEqual(['base']);

		const messages: HostPartsMessage[] = [
			{
				info: { id: 'm1', role: 'user', agent: 'free', sessionID },
				parts: [{ type: 'text', text: 'hello' }],
			},
		];
		await host.hooks['experimental.chat.messages.transform']({}, { messages });
		expect(messages).toHaveLength(1);
		expect(messages[0]?.parts).toHaveLength(1);

		await expect(
			host.hooks['experimental.session.compacting']({ sessionID }, {}),
		).resolves.toBeUndefined();

		const textOutput = { text: 'keep' };
		await host.hooks['experimental.text.complete'](
			{ sessionID, messageID: 'm1', partID: 'p1' },
			textOutput,
		);
		expect(textOutput.text).toBe('keep');

		const commandOutput: { parts: unknown[] } = { parts: [] };
		await host.hooks['command.execute.before'](
			{ command: 'swarm', sessionID, arguments: '' },
			commandOutput,
		);
		expect(commandOutput.parts).toHaveLength(0);
	});

	it('event hook releases the identity entry on session deletion', async () => {
		await bootPromise;
		const sessionID = 'host-agent-event-1';
		await mapExcludedSession(sessionID);
		expect(swarmState.activeAgent.has(sessionID)).toBe(true);
		await host.hooks.event({
			event: { type: 'session.deleted', properties: { sessionID } },
		});
		expect(swarmState.activeAgent.has(sessionID)).toBe(false);
	});
});

afterAll(() => {
	try {
		fs.rmSync(hostDirectory, { recursive: true, force: true });
	} catch {
		// SQLite handles may remain open briefly on Windows; best effort only.
	}
});
