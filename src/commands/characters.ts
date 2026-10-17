import {
	addCharacter,
	type Character,
	listCharacters,
	removeCharacter,
	updateCharacter,
} from '../characters.js';
import { loadConfig } from '../config.js';
import { StickrError } from '../errors.js';

export const CHARACTER_ACTIONS = ['add', 'edit', 'remove'] as const;
export type CharacterAction = (typeof CHARACTER_ACTIONS)[number];

export function formatCharacterRow(
	character: Character,
	nameWidth: number,
	defaultName?: string,
): string {
	const marker = character.name === defaultName ? '*' : ' ';
	const kind = character.builtIn ? 'built-in' : 'custom  ';
	return `${marker} ${character.name.padEnd(nameWidth)}  ${kind}  ${character.description}`;
}

export function runListCharacters(json: boolean): void {
	const characters = listCharacters();
	const defaultName = loadConfig().character;
	if (json) {
		console.log(
			JSON.stringify(
				characters.map((character) => ({
					...character,
					default: character.name === defaultName,
				})),
				null,
				2,
			),
		);
		return;
	}
	const nameWidth = Math.max(...characters.map((character) => character.name.length));
	for (const character of characters) {
		console.log(formatCharacterRow(character, nameWidth, defaultName));
	}
	if (defaultName) console.log(`\n* default character (change with "stickr setup --character")`);
}

export function runCharacterAction(options: {
	action: string;
	name?: string;
	description?: string;
}): void {
	const action = CHARACTER_ACTIONS.find((candidate) => candidate === options.action);
	if (!action) {
		throw new StickrError(
			`Unknown action "${options.action}" for "stickr characters". Use one of: ${CHARACTER_ACTIONS.join(', ')}.`,
		);
	}
	if (!options.name) {
		throw new StickrError(`"stickr characters ${action}" requires a character name.`);
	}
	if (action === 'remove') {
		if (options.description !== undefined) {
			throw new StickrError('Option "--description" is not used by "stickr characters remove".');
		}
		const { clearedDefault } = removeCharacter(options.name);
		console.log(
			clearedDefault
				? `✓ Removed "${options.name}" and cleared it as the default character.`
				: `✓ Removed "${options.name}".`,
		);
		return;
	}
	if (options.description === undefined) {
		throw new StickrError(
			`"stickr characters ${action}" requires --description "<what the character looks like>".`,
		);
	}
	const character =
		action === 'add'
			? addCharacter(options.name, options.description)
			: updateCharacter(options.name, options.description);
	console.log(`✓ ${action === 'add' ? 'Added' : 'Updated'} "${character.name}".`);
}
