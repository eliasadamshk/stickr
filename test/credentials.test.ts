import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	looksLikeApiKey,
	type Runner,
	readStoredKey,
	resolveApiKey,
	saveStoredKey,
} from '../src/credentials.js';

const originalPlatform = process.platform;
let home: string;

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), 'stickr-creds-'));
	process.env.STICKR_HOME = home;
});

afterEach(() => {
	Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
	delete process.env.STICKR_HOME;
	delete process.env.OPENAI_API_KEY;
	rmSync(home, { recursive: true, force: true });
});

describe('platform keystores (faked runners)', () => {
	it('uses macOS Keychain without exposing the key in process arguments', async () => {
		Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
		const calls: Array<{ cmd: string; args: string[]; input?: string }> = [];
		const runner: Runner = async (cmd, args, opts) => {
			calls.push({ cmd, args, input: opts?.input });
			if (cmd === 'security' && args[0] === 'find-generic-password') {
				return { stdout: 'sk-from-keychain-1234567890\n' };
			}
			return { stdout: '' };
		};

		await saveStoredKey('sk-new-1234567890abcd', runner);
		const saveCall = calls.find((c) => c.args[0] === '-i');
		expect(saveCall?.cmd).toBe('security');
		expect(saveCall?.args).toEqual(['-i']); // the key travels on stdin, never in argv
		expect(saveCall?.input).toBe(
			'add-generic-password -s stickr -a openai-api-key -U -w "sk-new-1234567890abcd"\n',
		);

		const stored = await readStoredKey(runner);
		expect(stored?.key).toBe('sk-from-keychain-1234567890');
		expect(stored?.source).toBe('macOS Keychain');
	});

	it('refuses macOS keys that would not survive one security -i line', async () => {
		Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
		let calls = 0;
		const runner: Runner = async () => {
			calls++;
			return { stdout: '' };
		};
		for (const key of [
			`sk-${'A'.repeat(5000)}`,
			'sk-AAAAAAAAAAAAAAAAAAAA\nhelp',
			'sk-AAAA\0TAIL',
			'sk-ключ-AAAAAAAAAAAA',
		]) {
			await expect(saveStoredKey(key, runner)).rejects.toThrow(/printable ASCII/);
		}
		expect(calls).toBe(0);
	});

	it('Linux secret-tool is used when available and skipped when not', async () => {
		Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
		const withTool: Runner = async () => ({ stdout: 'stored-key-1234567890' });
		const stored = await readStoredKey(withTool);
		expect(stored?.source).toBe('Linux Secret Service');

		const withoutTool: Runner = async () => {
			throw new Error('not found');
		};
		expect(await readStoredKey(withoutTool)).toBeNull();
	});

	it('uses a STICKR_HOME-relative DPAPI file on Windows', async () => {
		Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
		const encryptedFile = join(home, 'apikey.dpapi');
		writeFileSync(encryptedFile, 'encrypted-value');
		const calls: Array<{ cmd: string; args: string[]; input?: string }> = [];
		const runner: Runner = async (cmd, args, opts) => {
			calls.push({ cmd, args, input: opts?.input });
			return { stdout: 'sk-windows-1234567890abcd' };
		};

		expect(await saveStoredKey('sk-new-1234567890abcd', runner)).toBe(
			'Windows DPAPI-encrypted file',
		);
		expect(await readStoredKey(runner)).toEqual({
			key: 'sk-windows-1234567890abcd',
			source: 'Windows DPAPI-encrypted file',
		});
		expect(calls).toHaveLength(2);
		expect(calls.every((call) => call.cmd === 'powershell.exe')).toBe(true);
		expect(calls[0].args.join(' ')).toContain(encryptedFile);
		expect(calls[0].args.join(' ')).not.toContain('sk-new-1234567890abcd');
		expect(calls[0].input).toBe('sk-new-1234567890abcd');
		expect(calls[1].args.join(' ')).toContain(encryptedFile);
	});

	it('does not silently fall back to a plaintext credential file', async () => {
		await expect(
			saveStoredKey('sk-test-1234567890abcdef', async () => {
				throw new Error('credential store unavailable');
			}),
		).rejects.toThrow(/OPENAI_API_KEY/);
	});

	it('reports unsupported platforms without invoking a runner', async () => {
		Object.defineProperty(process, 'platform', { value: 'freebsd', configurable: true });
		let called = false;
		const runner: Runner = async () => {
			called = true;
			return { stdout: '' };
		};
		expect(await readStoredKey(runner)).toBeNull();
		await expect(saveStoredKey('sk-test-1234567890abcdef', runner)).rejects.toThrow(
			/not supported.*OPENAI_API_KEY/s,
		);
		expect(called).toBe(false);
	});
});

describe('resolveApiKey precedence', () => {
	it('environment wins over stored key', async () => {
		process.env.OPENAI_API_KEY = 'sk-env-1234567890123456';
		let runnerCalled = false;
		const resolved = await resolveApiKey(async () => {
			runnerCalled = true;
			return { stdout: 'sk-stored-should-not-be-read' };
		});
		expect(resolved?.source).toBe('environment');
		expect(resolved?.key).toBe(process.env.OPENAI_API_KEY);
		expect(runnerCalled).toBe(false);
	});

	it('falls back to the stored key when env is unset', async () => {
		Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
		const resolved = await resolveApiKey(async () => ({
			stdout: 'sk-stored-1234567890abcd\n',
		}));
		expect(resolved?.key).toBe('sk-stored-1234567890abcd');
	});

	it('returns null when nothing is configured', async () => {
		expect(
			await resolveApiKey(async () => {
				throw new Error('not found');
			}),
		).toBeNull();
	});
});

describe('looksLikeApiKey', () => {
	it('only accepts plausible sk-prefixed values', () => {
		expect(looksLikeApiKey('sk-proj-abc123def456ghi789')).toBe(true);
		expect(looksLikeApiKey('hello world this is not a key')).toBe(false);
		expect(looksLikeApiKey('sk-short')).toBe(false);
		expect(looksLikeApiKey('pk-verylongkeythatshouldfail1234')).toBe(false);
	});
});
