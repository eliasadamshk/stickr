import { Box, Text, useInput } from 'ink';
import { useState } from 'react';
import { listCharacters } from '../characters.js';
import { configPath, loadConfig, type StickrConfig, saveConfig } from '../config.js';
import { PROVIDER_NAMES } from '../provider/index.js';
import { errorMessage } from './actions.js';
import { type Status, StatusLine } from './StatusLine.js';
import { useSelection } from './use-selection.js';

const NO_CHARACTER = 'none';

interface Setting {
	label: string;
	value: (config: StickrConfig) => string;
	options: () => readonly string[];
	apply: (config: StickrConfig, value: string) => StickrConfig;
}

const SETTINGS: Setting[] = [
	{
		label: 'Image provider',
		value: (config) => config.provider,
		options: () => PROVIDER_NAMES,
		apply: (config, value) => ({
			...config,
			provider: PROVIDER_NAMES.find((name) => name === value) ?? config.provider,
		}),
	},
	{
		label: 'Copy to clipboard',
		value: (config) => (config.autoCopy ? 'on' : 'off'),
		options: () => ['on', 'off'],
		apply: (config, value) => ({ ...config, autoCopy: value === 'on' }),
	},
	{
		label: 'Default character',
		value: (config) => config.character ?? NO_CHARACTER,
		options: () => [NO_CHARACTER, ...listCharacters().map((character) => character.name)],
		apply: (config, value) => {
			const { character: _previous, ...rest } = config;
			return value === NO_CHARACTER ? rest : { ...rest, character: value };
		},
	},
];

export function cycle(options: readonly string[], current: string, step: 1 | -1): string {
	const index = options.indexOf(current);
	return options[(index + step + options.length) % options.length] ?? current;
}

function readConfig(): { config?: StickrConfig; error?: string } {
	try {
		return { config: loadConfig() };
	} catch (error) {
		return { error: errorMessage(error) };
	}
}

export function SettingsView() {
	const [{ config, error }, setState] = useState(readConfig);
	const selection = useSelection(SETTINGS.length);
	const [status, setStatus] = useState<Status | undefined>(
		error ? { kind: 'error', text: error } : undefined,
	);

	useInput((input, key) => {
		if (key.upArrow || input === 'k') {
			selection.move(-1);
		} else if (key.downArrow || input === 'j') {
			selection.move(1);
		} else if (config && (key.rightArrow || key.leftArrow || key.return || input === ' ')) {
			const setting = SETTINGS[selection.read()];
			try {
				const next = setting.apply(
					config,
					cycle(setting.options(), setting.value(config), key.leftArrow ? -1 : 1),
				);
				saveConfig(next);
				setState({ config: next });
				setStatus({ kind: 'success', text: `${setting.label}: ${setting.value(next)}` });
			} catch (saveError) {
				setStatus({ kind: 'error', text: errorMessage(saveError) });
			}
		}
	});

	return (
		<Box flexDirection="column">
			{config
				? SETTINGS.map((setting, index) => (
						<Box key={setting.label}>
							<Box width={22} flexShrink={0}>
								<Text color={index === selection.index ? 'cyan' : undefined}>
									{index === selection.index ? '›' : ' '} {setting.label}
								</Text>
							</Box>
							<Text bold>‹ {setting.value(config)} ›</Text>
						</Box>
					))
				: null}
			<Box marginTop={1}>
				<Text dimColor>Saved to {configPath()}</Text>
			</Box>
			<StatusLine status={status} />
			<Text dimColor>↑↓ move · ←→ change</Text>
		</Box>
	);
}
