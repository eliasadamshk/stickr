import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { characterNameSchema } from './character-name.js';
import { ensureHome, loadConfig, saveConfig, stickrHome } from './config.js';
import { StickrError } from './errors.js';

/**
 * Built-in Stickr mascots. Each description shares the otter's look so the
 * cast reads as one sticker family.
 */
export const BUILTIN_CHARACTERS = {
	otter:
		'a chubby brown sea otter with a cream face and belly, small round ears, a dark button nose, and whiskers',
	raccoon:
		'a chubby gray raccoon with a dark eye mask, a cream muzzle and belly, small round ears, and a ringed tail',
	cat: 'a chubby orange tabby cat with soft stripes, a cream muzzle and belly, and small rounded ears',
	flamingo:
		'a soft-pink flamingo with a plump round body, a long curved S-shaped neck, a curved dark-tipped beak, and two thin legs',
	spider:
		'a round dark-navy spider with a soft fuzzy body, small kind eyes, and short rounded legs',
} as const;

export const CHARACTER_STYLE =
	'Draw the character in the Stickr mascot style: chunky rounded proportions, happy closed eyes or small dark eyes, rosy cheeks, a soft muted earthy palette, and dark navy outlines.';

export const characterDescriptionSchema = z
	.string()
	.trim()
	.min(10)
	.max(300)
	.regex(/^[^\r\n]*$/, 'must be a single line');

const customCharactersSchema = z.record(
	characterNameSchema,
	z.object({ description: characterDescriptionSchema }).strict(),
);

type CustomCharacters = z.infer<typeof customCharactersSchema>;

export interface Character {
	name: string;
	description: string;
	builtIn: boolean;
}

export function charactersPath(): string {
	return join(stickrHome(), 'characters.json');
}

function isBuiltIn(name: string): boolean {
	return Object.hasOwn(BUILTIN_CHARACTERS, name);
}

function loadCustomCharacters(): CustomCharacters {
	const path = charactersPath();
	if (!existsSync(path)) return {};
	let raw: unknown;
	try {
		raw = JSON.parse(readFileSync(path, 'utf8'));
	} catch {
		throw new StickrError(`Characters file is not valid JSON: ${path}\nFix or delete the file.`);
	}
	const parsed = customCharactersSchema.safeParse(raw);
	if (!parsed.success) {
		throw new StickrError(
			`Characters file has invalid entries: ${path}\nExpected {"<name>": {"description": "..."}}. Fix or delete the file.`,
		);
	}
	return parsed.data;
}

function saveCustomCharacters(characters: CustomCharacters): void {
	ensureHome();
	const path = charactersPath();
	const tmpPath = `${path}.tmp-${process.pid}`;
	try {
		writeFileSync(tmpPath, `${JSON.stringify(characters, null, 2)}\n`, {
			encoding: 'utf8',
			mode: 0o600,
		});
		renameSync(tmpPath, path);
	} catch (error) {
		rmSync(tmpPath, { force: true });
		throw new StickrError(
			`Could not save characters to ${path}: ${error instanceof Error ? error.message : error}`,
			{ cause: error },
		);
	}
}

/** Built-in characters first, then custom characters in name order. */
export function listCharacters(): Character[] {
	const builtIns = Object.entries(BUILTIN_CHARACTERS).map(([name, description]) => ({
		name,
		description,
		builtIn: true,
	}));
	const custom = Object.entries(loadCustomCharacters())
		.filter(([name]) => !isBuiltIn(name))
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([name, { description }]) => ({ name, description, builtIn: false }));
	return [...builtIns, ...custom];
}

export function findCharacter(name: string): Character | undefined {
	return listCharacters().find((character) => character.name === name);
}

export function requireCharacter(name: string): Character {
	const character = findCharacter(name);
	if (!character) {
		const names = listCharacters().map((candidate) => candidate.name);
		throw new StickrError(
			`Unknown character "${name}". Available characters: ${names.join(', ')}.\nRun "stickr characters" to see them, or "stickr characters add" to create one.`,
		);
	}
	return character;
}

function parseName(name: string): string {
	const parsed = characterNameSchema.safeParse(name);
	if (!parsed.success) {
		throw new StickrError(
			`Invalid character name "${name}": ${parsed.error.issues[0]?.message ?? 'invalid'}.`,
		);
	}
	return parsed.data;
}

function parseDescription(description: string): string {
	const parsed = characterDescriptionSchema.safeParse(description);
	if (!parsed.success) {
		throw new StickrError(
			`Invalid character description: ${parsed.error.issues[0]?.message ?? 'invalid'}.\nDescribe the look in one line of 10–300 characters.`,
		);
	}
	return parsed.data;
}

function assertCustom(name: string): void {
	if (isBuiltIn(name)) {
		throw new StickrError(`"${name}" is a built-in character and cannot be changed.`);
	}
}

export function addCharacter(name: string, description: string): Character {
	const validName = parseName(name);
	const validDescription = parseDescription(description);
	assertCustom(validName);
	const characters = loadCustomCharacters();
	if (Object.hasOwn(characters, validName)) {
		throw new StickrError(
			`Character "${validName}" already exists. Use "stickr characters edit" to change it.`,
		);
	}
	saveCustomCharacters({ ...characters, [validName]: { description: validDescription } });
	return { name: validName, description: validDescription, builtIn: false };
}

export function updateCharacter(name: string, description: string): Character {
	assertCustom(name);
	const validDescription = parseDescription(description);
	const characters = loadCustomCharacters();
	if (!Object.hasOwn(characters, name)) {
		throw new StickrError(`No custom character named "${name}".`);
	}
	saveCustomCharacters({ ...characters, [name]: { description: validDescription } });
	return { name, description: validDescription, builtIn: false };
}

/** Remove a custom character, clearing it as the default if it was one. */
export function removeCharacter(name: string): { clearedDefault: boolean } {
	assertCustom(name);
	const characters = loadCustomCharacters();
	if (!Object.hasOwn(characters, name)) {
		throw new StickrError(`No custom character named "${name}".`);
	}
	const { [name]: _removed, ...rest } = characters;
	saveCustomCharacters(rest);
	const config = loadConfig();
	if (config.character !== name) return { clearedDefault: false };
	const { character: _cleared, ...withoutDefault } = config;
	saveConfig(withoutDefault);
	return { clearedDefault: true };
}
