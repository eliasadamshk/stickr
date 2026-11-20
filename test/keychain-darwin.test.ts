import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readStoredKey, saveStoredKey } from '../src/credentials.js';

// Runs the real `security` binary against a throwaway login keychain under a temporary HOME,
// so the user's own keychain is never touched.
describe.runIf(process.platform === 'darwin')('macOS Keychain round trip (real security)', () => {
	const originalHome = process.env.HOME;
	let home: string;

	beforeEach(() => {
		home = mkdtempSync(join(tmpdir(), 'stickr-keychain-'));
		mkdirSync(join(home, 'Library', 'Keychains'), { recursive: true });
		process.env.HOME = home;
		const keychain = join(home, 'Library', 'Keychains', 'login.keychain-db');
		execFileSync('security', ['create-keychain', '-p', 'test', keychain]);
		execFileSync('security', ['unlock-keychain', '-p', 'test', keychain]);
		expect(execFileSync('security', ['default-keychain'], { encoding: 'utf8' })).toContain(home);
	});

	afterEach(() => {
		process.env.HOME = originalHome;
		rmSync(home, { recursive: true, force: true });
	});

	it.each([
		['a full-length project key', `sk-proj-${'A1b2C3d4_-'.repeat(16)}`],
		['quotes, backslashes and spaces', `sk-test "quoted" back\\slash it's $HOME #x`],
	])('stores %s unchanged', async (_label, key) => {
		await saveStoredKey(key);
		expect((await readStoredKey())?.key).toBe(key);
	});
});
