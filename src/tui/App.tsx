import { Box, Text, useApp, useInput, useStdout } from 'ink';
import { useCallback, useState } from 'react';
import { defaultActions, type TuiActions } from './actions.js';
import { CharactersView } from './CharactersView.js';
import { SettingsView } from './SettingsView.js';
import { StickersView } from './StickersView.js';

const TABS = [
	{ id: 'stickers', label: 'Stickers' },
	{ id: 'characters', label: 'Characters' },
	{ id: 'settings', label: 'Settings' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const DEFAULT_ROWS = 24;

export function App({ actions = defaultActions }: { actions?: TuiActions }) {
	const { exit } = useApp();
	const { stdout } = useStdout();
	const [tab, setTab] = useState<TabId>('stickers');
	const [inputCaptured, setInputCaptured] = useState(false);
	const rows = stdout.rows ?? DEFAULT_ROWS;

	const onInputCapture = useCallback((captured: boolean) => setInputCaptured(captured), []);

	useInput(
		(input, key) => {
			const index = TABS.findIndex((candidate) => candidate.id === tab);
			if (input === 'q') {
				exit();
			} else if (key.tab) {
				const step = key.shift ? -1 : 1;
				setTab(TABS[(index + step + TABS.length) % TABS.length].id);
			} else if (['1', '2', '3'].includes(input)) {
				setTab(TABS[Number(input) - 1].id);
			}
		},
		{ isActive: !inputCaptured },
	);

	return (
		<Box flexDirection="column" paddingX={1}>
			<Box marginBottom={1}>
				<Text bold color="magenta">
					stickr{'  '}
				</Text>
				{TABS.map((candidate, index) => (
					<Text
						key={candidate.id}
						color={candidate.id === tab ? 'cyan' : undefined}
						dimColor={candidate.id !== tab}
						underline={candidate.id === tab}
					>
						{index + 1} {candidate.label}
						{'   '}
					</Text>
				))}
				<Text dimColor>tab switch · q quit</Text>
			</Box>
			{tab === 'stickers' ? (
				<StickersView actions={actions} rows={rows} onInputCapture={onInputCapture} />
			) : null}
			{tab === 'characters' ? <CharactersView rows={rows} onInputCapture={onInputCapture} /> : null}
			{tab === 'settings' ? <SettingsView /> : null}
		</Box>
	);
}
