import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	addCharacter,
	BUILTIN_CHARACTERS,
	charactersPath,
	findCharacter,
	listCharacters,
	removeCharacter,
	requireCharacter,
	updateCharacter,
} from '../src/characters.js';
import { runCharacterAction, runListCharacters } from '../src/commands/characters.js';
import { loadConfig, saveConfig } from '../src/config.js';

const HEDGEHOG = 'a round brown hedgehog with soft spines and a cream face';

let home: string;

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), 'stickr-characters-'));
	process.env.STICKR_HOME = home;
});

afterEach(() => {
	vi.restoreAllMocks();
	delete process.env.STICKR_HOME;
	rmSync(home, { recursive: true, force: true });
});

function captureStdout(fn: () => void): string {
	const chunks: string[] = [];
	vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
		chunks.push(args.join(' '));
	});
	fn();
	return chunks.join('\n');
}

describe('character registry', () => {
	it('lists the built-in cast when no custom file exists', () => {
		expect(listCharacters().map((character) => character.name)).toEqual(
			Object.keys(BUILTIN_CHARACTERS),
		);
		expect(listCharacters().every((character) => character.builtIn)).toBe(true);
	});

	it('adds custom characters after the built-ins in name order', () => {
		addCharacter('zebra', 'a chubby striped zebra with a cream muzzle');
		addCharacter('hedgehog', `  ${HEDGEHOG}  `);
		const names = listCharacters().map((character) => character.name);
		expect(names.slice(-2)).toEqual(['hedgehog', 'zebra']);
		expect(findCharacter('hedgehog')).toEqual({
			name: 'hedgehog',
			description: HEDGEHOG,
			builtIn: false,
		});
	});

	it('persists custom characters privately as JSON', () => {
		addCharacter('hedgehog', HEDGEHOG);
		expect(JSON.parse(readFileSync(charactersPath(), 'utf8'))).toEqual({
			hedgehog: { description: HEDGEHOG },
		});
		if (process.platform !== 'win32') {
			expect(statSync(charactersPath()).mode & 0o777).toBe(0o600);
		}
	});

	it('updates and removes custom characters', () => {
		addCharacter('hedgehog', HEDGEHOG);
		updateCharacter('hedgehog', 'a tiny grumpy hedgehog with a cream face');
		expect(findCharacter('hedgehog')?.description).toBe('a tiny grumpy hedgehog with a cream face');
		expect(removeCharacter('hedgehog')).toEqual({ clearedDefault: false });
		expect(findCharacter('hedgehog')).toBeUndefined();
	});

	it('clears the default when removing the default character', () => {
		addCharacter('hedgehog', HEDGEHOG);
		saveConfig({ ...loadConfig(), character: 'hedgehog' });
		expect(removeCharacter('hedgehog')).toEqual({ clearedDefault: true });
		expect(loadConfig().character).toBeUndefined();
	});

	it('rejects duplicates, built-in changes, and unknown names', () => {
		addCharacter('hedgehog', HEDGEHOG);
		expect(() => addCharacter('hedgehog', HEDGEHOG)).toThrow(/already exists/);
		expect(() => addCharacter('otter', HEDGEHOG)).toThrow(/built-in/);
		expect(() => updateCharacter('otter', HEDGEHOG)).toThrow(/built-in/);
		expect(() => removeCharacter('cat')).toThrow(/built-in/);
		expect(() => updateCharacter('ghost', HEDGEHOG)).toThrow(/No custom character/);
		expect(() => removeCharacter('ghost')).toThrow(/No custom character/);
	});

	it('validates names and descriptions', () => {
		for (const name of ['Hedgehog', 'h', '1hog', 'hedge hog', 'none', 'a'.repeat(33)]) {
			expect(() => addCharacter(name, HEDGEHOG)).toThrow(/Invalid character name/);
		}
		expect(() => addCharacter('hedgehog', 'short')).toThrow(/Invalid character description/);
		expect(() => addCharacter('hedgehog', 'a round\nhedgehog with spines')).toThrow(/single line/);
		expect(() => addCharacter('hedgehog', 'x'.repeat(301))).toThrow(
			/Invalid character description/,
		);
	});

	it('lists available characters when a name is unknown', () => {
		expect(() => requireCharacter('dragon')).toThrow(/Unknown character "dragon".*otter/);
	});

	it('reports corrupt or invalid files with the path', () => {
		writeFileSync(charactersPath(), '{oops');
		expect(() => listCharacters()).toThrow(/not valid JSON/);
		writeFileSync(charactersPath(), JSON.stringify({ Bad: { description: HEDGEHOG } }));
		expect(() => listCharacters()).toThrow(charactersPath());
	});
});

describe('stickr characters', () => {
	it('prints a table with the default marked', () => {
		addCharacter('hedgehog', HEDGEHOG);
		saveConfig({ ...loadConfig(), character: 'hedgehog' });
		const output = captureStdout(() => runListCharacters(false));
		expect(output).toMatch(/^ {2}otter\s+built-in {2}a chubby brown sea otter/m);
		expect(output).toMatch(/^\* hedgehog\s+custom\s+a round brown hedgehog/m);
		expect(output).toContain('* default character');
	});

	it('prints JSON with a default flag', () => {
		saveConfig({ ...loadConfig(), character: 'cat' });
		const printed = JSON.parse(captureStdout(() => runListCharacters(true)));
		expect(printed).toContainEqual(
			expect.objectContaining({ name: 'cat', builtIn: true, default: true }),
		);
		expect(printed.filter((character: { default: boolean }) => character.default)).toHaveLength(1);
	});

	it('adds, edits, and removes through the command', () => {
		expect(
			captureStdout(() =>
				runCharacterAction({ action: 'add', name: 'hedgehog', description: HEDGEHOG }),
			),
		).toContain('Added "hedgehog"');
		expect(
			captureStdout(() =>
				runCharacterAction({
					action: 'edit',
					name: 'hedgehog',
					description: 'a sleepy hedgehog with a cream face',
				}),
			),
		).toContain('Updated "hedgehog"');
		expect(captureStdout(() => runCharacterAction({ action: 'remove', name: 'hedgehog' }))).toBe(
			'✓ Removed "hedgehog".',
		);
	});

	it('clears the default when its character is removed', () => {
		addCharacter('hedgehog', HEDGEHOG);
		saveConfig({ ...loadConfig(), character: 'hedgehog' });
		const output = captureStdout(() => runCharacterAction({ action: 'remove', name: 'hedgehog' }));
		expect(output).toContain('cleared it as the default');
		expect(loadConfig().character).toBeUndefined();
	});

	it('rejects malformed actions with guidance', () => {
		expect(() => runCharacterAction({ action: 'rename', name: 'x' })).toThrow(/Unknown action/);
		expect(() => runCharacterAction({ action: 'add' })).toThrow(/requires a character name/);
		expect(() => runCharacterAction({ action: 'add', name: 'hedgehog' })).toThrow(
			/requires --description/,
		);
		expect(() =>
			runCharacterAction({ action: 'remove', name: 'hedgehog', description: HEDGEHOG }),
		).toThrow(/not used/);
	});
});
