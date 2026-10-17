import { ConfirmInput, TextInput } from '@inkjs/ui';
import { Box, Text, useInput } from 'ink';
import { useCallback, useState } from 'react';
import {
	addCharacter,
	type Character,
	listCharacters,
	removeCharacter,
	updateCharacter,
} from '../characters.js';
import { loadConfig, saveConfig } from '../config.js';
import { errorMessage, visibleWindow } from './actions.js';
import { type Status, StatusLine } from './StatusLine.js';
import { useSelection } from './use-selection.js';

type Mode =
	| { kind: 'browse' }
	| { kind: 'add-name' }
	| { kind: 'add-description'; name: string }
	| { kind: 'edit'; character: Character }
	| { kind: 'confirm-delete'; character: Character };

const NAME_WIDTH = 16;

interface Roster {
	characters: Character[];
	defaultName?: string;
	error?: string;
}

function loadRoster(): Roster {
	try {
		return { characters: listCharacters(), defaultName: loadConfig().character };
	} catch (error) {
		return { characters: [], error: errorMessage(error) };
	}
}

export function CharactersView(props: {
	rows: number;
	onInputCapture: (captured: boolean) => void;
}) {
	const { rows, onInputCapture } = props;
	const [roster, setRoster] = useState(loadRoster);
	const [mode, setModeState] = useState<Mode>({ kind: 'browse' });
	const [status, setStatus] = useState<Status | undefined>(
		roster.error ? { kind: 'error', text: roster.error } : undefined,
	);
	const selection = useSelection(roster.characters.length);
	const current = roster.characters[selection.index];

	const setMode = useCallback(
		(next: Mode) => {
			setModeState(next);
			onInputCapture(next.kind !== 'browse');
		},
		[onInputCapture],
	);

	const attempt = (task: () => string, nextSelected?: (characters: Character[]) => number) => {
		try {
			const text = task();
			const next = loadRoster();
			setRoster(next);
			if (nextSelected) selection.select(nextSelected(next.characters));
			setStatus({ kind: 'success', text });
			return true;
		} catch (error) {
			setStatus({ kind: 'error', text: errorMessage(error) });
			return false;
		}
	};

	const toggleDefault = (character: Character) => {
		attempt(() => {
			const config = loadConfig();
			if (config.character === character.name) {
				const { character: _cleared, ...rest } = config;
				saveConfig(rest);
				return 'Cleared the default character.';
			}
			saveConfig({ ...config, character: character.name });
			return `"${character.name}" is now the default character.`;
		});
	};

	useInput(
		(_input, key) => {
			if (key.escape) {
				setMode({ kind: 'browse' });
				setStatus({ kind: 'info', text: 'Cancelled.' });
			}
		},
		{ isActive: mode.kind !== 'browse' && mode.kind !== 'confirm-delete' },
	);

	useInput(
		(input, key) => {
			const target = roster.characters[selection.read()];
			if (key.upArrow || input === 'k') {
				selection.move(-1);
			} else if (key.downArrow || input === 'j') {
				selection.move(1);
			} else if (input === 'a') {
				setMode({ kind: 'add-name' });
			} else if (!target) {
				return;
			} else if (key.return || input === ' ') {
				toggleDefault(target);
			} else if (input === 'e' || input === 'd') {
				if (target.builtIn) {
					setStatus({ kind: 'error', text: `"${target.name}" is built-in and cannot change.` });
				} else if (input === 'e') {
					setMode({ kind: 'edit', character: target });
				} else {
					setMode({ kind: 'confirm-delete', character: target });
				}
			}
		},
		{ isActive: mode.kind === 'browse' },
	);

	const listSize = Math.max(3, rows - 9);
	const window = visibleWindow(roster.characters.length, selection.index, listSize);

	return (
		<Box flexDirection="column">
			{roster.characters.slice(window.start, window.end).map((character) => {
				const isSelected = character.name === current?.name;
				return (
					<Box key={character.name}>
						<Box width={4} flexShrink={0}>
							<Text color={isSelected ? 'cyan' : undefined}>
								{isSelected ? '›' : ' '} {character.name === roster.defaultName ? '★' : ' '}
							</Text>
						</Box>
						<Box width={NAME_WIDTH} flexShrink={0}>
							<Text color={isSelected ? 'cyan' : undefined} wrap="truncate">
								{character.name}
							</Text>
						</Box>
						<Box width={10} flexShrink={0}>
							<Text dimColor>{character.builtIn ? 'built-in' : 'custom'}</Text>
						</Box>
						<Text wrap="truncate">{character.description}</Text>
					</Box>
				);
			})}
			<Box marginTop={1}>
				<ModePanel
					mode={mode}
					onAddName={(name) => setMode({ kind: 'add-description', name: name.trim() })}
					onAddDescription={(name, description) => {
						if (
							attempt(
								() => `Added "${addCharacter(name, description).name}".`,
								(characters) => characters.findIndex((character) => character.name === name),
							)
						) {
							setMode({ kind: 'browse' });
						}
					}}
					onEdit={(character, description) => {
						if (attempt(() => `Updated "${updateCharacter(character.name, description).name}".`)) {
							setMode({ kind: 'browse' });
						}
					}}
					onDelete={(character) => {
						setMode({ kind: 'browse' });
						attempt(() =>
							removeCharacter(character.name).clearedDefault
								? `Removed "${character.name}" and cleared it as the default.`
								: `Removed "${character.name}".`,
						);
					}}
					onCancel={() => {
						setMode({ kind: 'browse' });
						setStatus({ kind: 'info', text: 'Nothing deleted.' });
					}}
				/>
			</Box>
			<StatusLine status={status} />
			<Text dimColor>
				↑↓ move · enter set/clear default · a add · e edit · d delete · esc cancel
			</Text>
		</Box>
	);
}

function ModePanel(props: {
	mode: Mode;
	onAddName: (name: string) => void;
	onAddDescription: (name: string, description: string) => void;
	onEdit: (character: Character, description: string) => void;
	onDelete: (character: Character) => void;
	onCancel: () => void;
}) {
	const { mode } = props;
	switch (mode.kind) {
		case 'browse':
			return <Text dimColor>★ marks the default character for new stickers.</Text>;
		case 'add-name':
			return (
				<Box>
					<Text color="cyan">Name: </Text>
					<TextInput
						key="add-name"
						placeholder="lowercase, e.g. hedgehog"
						onSubmit={props.onAddName}
					/>
				</Box>
			);
		case 'add-description':
			return (
				<Box>
					<Text color="cyan">Look of {mode.name}: </Text>
					<TextInput
						key="add-description"
						placeholder="a round brown hedgehog with soft spines"
						onSubmit={(description) => props.onAddDescription(mode.name, description)}
					/>
				</Box>
			);
		case 'edit':
			return (
				<Box>
					<Text color="cyan">Look of {mode.character.name}: </Text>
					<TextInput
						key={`edit-${mode.character.name}`}
						defaultValue={mode.character.description}
						onSubmit={(description) => props.onEdit(mode.character, description)}
					/>
				</Box>
			);
		case 'confirm-delete':
			return (
				<Box>
					<Text color="yellow">Delete character {mode.character.name}? </Text>
					<ConfirmInput
						defaultChoice="cancel"
						onConfirm={() => props.onDelete(mode.character)}
						onCancel={props.onCancel}
					/>
				</Box>
			);
	}
}
