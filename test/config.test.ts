import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, ensureConfig, loadConfig } from '../src/config.js';
import { StickrError } from '../src/errors.js';

let home: string;

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), 'stickr-config-'));
	process.env.STICKR_HOME = home;
});

afterEach(() => {
	delete process.env.STICKR_HOME;
	rmSync(home, { recursive: true, force: true });
});

describe('config', () => {
	it('returns defaults when no config file exists', () => {
		expect(loadConfig()).toEqual(DEFAULT_CONFIG);
	});

	it('loads values from config.json', () => {
		writeFileSync(join(home, 'config.json'), JSON.stringify({ autoCopy: false }));
		const config = loadConfig();
		expect(config.autoCopy).toBe(false);
	});

	it('rejects wrong types and unknown keys', () => {
		for (const invalid of [{ autoCopy: 'yes' }, { autoCopy: true, style: 'legacy' }]) {
			writeFileSync(join(home, 'config.json'), JSON.stringify(invalid));
			expect(() => loadConfig()).toThrow(/invalid values/);
		}
	});

	it('creates the default config once without overwriting user settings', () => {
		const path = ensureConfig();
		expect(loadConfig()).toEqual(DEFAULT_CONFIG);
		writeFileSync(path, JSON.stringify({ autoCopy: false }));
		ensureConfig();
		expect(loadConfig().autoCopy).toBe(false);
	});

	it('rejects corrupt JSON with an actionable error', () => {
		writeFileSync(join(home, 'config.json'), '{not json');
		expect(() => loadConfig()).toThrow(StickrError);
		expect(() => loadConfig()).toThrow(/valid JSON/);
		expect(() => loadConfig()).toThrow(home);
	});
});
