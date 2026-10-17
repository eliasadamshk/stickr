import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runSetup } from '../src/commands/setup.js';
import { claudeIntegration, codexIntegration } from '../src/integrations/agents.js';
import { STICKR_SKILL_MARKDOWN } from '../src/integrations/skill-md.js';

let home: string;
let originalHome: string | undefined;
let originalUserProfile: string | undefined;

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), 'stickr-setup-'));
	originalHome = process.env.HOME;
	originalUserProfile = process.env.USERPROFILE;
	process.env.HOME = home;
	process.env.USERPROFILE = home;
	process.env.STICKR_HOME = home;
	process.env.OPENAI_API_KEY = 'sk-test-1234567890abcdef';
});

afterEach(() => {
	vi.restoreAllMocks();
	if (originalHome === undefined) delete process.env.HOME;
	else process.env.HOME = originalHome;
	if (originalUserProfile === undefined) delete process.env.USERPROFILE;
	else process.env.USERPROFILE = originalUserProfile;
	delete process.env.STICKR_HOME;
	delete process.env.OPENAI_API_KEY;
	rmSync(home, { recursive: true, force: true });
});

function captureStdout(fn: () => Promise<void>): Promise<string> {
	const chunks: string[] = [];
	const original = console.log;
	console.log = (...args: unknown[]) => chunks.push(args.join(' '));
	return fn()
		.then(() => chunks.join('\n'))
		.finally(() => {
			console.log = original;
		});
}

describe('agent integrations', () => {
	it.each([
		{
			name: 'Codex',
			integration: codexIntegration,
			segments: ['.agents', 'skills', 'stickr', 'SKILL.md'],
		},
		{
			name: 'Claude Code',
			integration: claudeIntegration,
			segments: ['.claude', 'skills', 'stickr', 'SKILL.md'],
		},
	])(
		'$name installs the shared skill in its user-scoped directory',
		({ integration, segments }) => {
			const { path, backup } = integration.install();
			expect(path).toBe(join(home, ...segments));
			expect(backup).toBeUndefined();
			expect(readFileSync(path, 'utf8')).toBe(STICKR_SKILL_MARKDOWN);
		},
	);

	it('backs up a customized SKILL.md before replacing it', () => {
		const { path } = claudeIntegration.install();
		writeFileSync(path, 'my custom skill', 'utf8');

		const { backup } = claudeIntegration.install();
		expect(backup).toBe(`${path}.bak`);
		expect(readFileSync(`${path}.bak`, 'utf8')).toBe('my custom skill');
		expect(readFileSync(path, 'utf8')).toBe(STICKR_SKILL_MARKDOWN);
	});

	it('detects an agent executable using the platform PATH rules', () => {
		const bin = join(home, 'bin');
		mkdirSync(bin);
		const executable = process.platform === 'win32' ? 'codex.CMD' : 'codex';
		writeFileSync(join(bin, executable), 'fake executable');
		const originalPath = process.env.PATH;
		try {
			process.env.PATH = bin;
			expect(codexIntegration.detect()).toBe(true);
		} finally {
			if (originalPath === undefined) delete process.env.PATH;
			else process.env.PATH = originalPath;
		}
	});
});

describe('setup', () => {
	it('creates local storage and is idempotent', async () => {
		await captureStdout(() => runSetup({ force: ['Codex'] }));
		expect(existsSync(join(home, 'config.json'))).toBe(true);

		const output2 = await captureStdout(() => runSetup({ force: ['Codex'] }));
		expect(output2).toContain('Ready.');
	});

	it('reports undetected agents with a skip marker and still succeeds', async () => {
		const output = await captureStdout(async () => {
			vi.spyOn(codexIntegration, 'detect').mockReturnValue(false);
			vi.spyOn(claudeIntegration, 'detect').mockReturnValue(false);
			await runSetup();
		});
		expect(output).toContain('Codex not detected');
		expect(output).toContain('Claude Code not detected');
		expect(output).toContain('Ready.');
	});

	it('saves the chosen provider and character and asks for that provider key', async () => {
		process.env.GEMINI_API_KEY = 'gemini-test-key-1234567890';
		try {
			const output = await captureStdout(() =>
				runSetup({ force: ['Codex'], provider: 'gemini', character: 'otter' }),
			);
			expect(output).toContain('GEMINI_API_KEY found in environment');
			expect(JSON.parse(readFileSync(join(home, 'config.json'), 'utf8'))).toMatchObject({
				provider: 'gemini',
				character: 'otter',
			});

			await captureStdout(() => runSetup({ force: ['Codex'], character: 'none' }));
			const config = JSON.parse(readFileSync(join(home, 'config.json'), 'utf8'));
			expect(config.provider).toBe('gemini');
			expect(config.character).toBeUndefined();
		} finally {
			delete process.env.GEMINI_API_KEY;
		}
	});

	it('dry run writes nothing', async () => {
		delete process.env.OPENAI_API_KEY;
		const output = await captureStdout(() =>
			runSetup({ dryRun: true, force: ['Codex', 'Claude Code'] }),
		);
		expect(output).toContain('Would install Stickr for Codex');
		expect(output).toContain('Would install Stickr for Claude Code');
		expect(output).toContain('Codex: $stickr');
		expect(output).toContain('Claude Code: /stickr');
		expect(output).toContain('No OpenAI API key configured yet');
		expect(existsSync(join(home, 'stickers'))).toBe(false);
	});

	it('rejects unknown agent names instead of silently ignoring them', async () => {
		await expect(runSetup({ force: ['Codecks'] })).rejects.toThrow(/Unknown agent/);
	});

	it('rejects contradictory setup options', async () => {
		await expect(runSetup({ force: ['Codex'], skip: ['codex'] })).rejects.toThrow(
			/both skipped and forced/,
		);
	});
});
