import { ConfirmInput, TextInput } from '@inkjs/ui';
import { Box, Text, useInput } from 'ink';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { relativeTime } from '../commands/list.js';
import { deleteSticker, listStickers, type StickerRecord } from '../store.js';
import { errorMessage, type TuiActions, visibleWindow } from './actions.js';
import { type Status, StatusLine } from './StatusLine.js';
import { useSelection } from './use-selection.js';

type Mode = 'browse' | 'filter' | 'confirm-delete';

const LIST_WIDTH = 42;
const PREVIEW_COLUMNS = 32;

export function matchesFilter(record: StickerRecord, filter: string): boolean {
	const needle = filter.trim().toLowerCase();
	if (!needle) return true;
	const { spec } = record;
	return [record.id, spec.caption, spec.concept, spec.subject, spec.character, spec.contextSummary]
		.filter((field): field is string => typeof field === 'string')
		.some((field) => field.toLowerCase().includes(needle));
}

function loadRecords(): { records: StickerRecord[]; corrupt: number; error?: string } {
	try {
		const { records, corrupt } = listStickers();
		return { records, corrupt: corrupt.length };
	} catch (error) {
		return { records: [], corrupt: 0, error: errorMessage(error) };
	}
}

export function StickersView(props: {
	actions: TuiActions;
	rows: number;
	onInputCapture: (captured: boolean) => void;
}) {
	const { actions, rows, onInputCapture } = props;
	const [library, setLibrary] = useState(loadRecords);
	const [filter, setFilter] = useState('');
	const [mode, setMode] = useState<Mode>('browse');
	const [status, setStatus] = useState<Status | undefined>(
		library.error ? { kind: 'error', text: library.error } : undefined,
	);
	const [preview, setPreview] = useState<string[]>([]);

	const visible = useMemo(
		() => library.records.filter((record) => matchesFilter(record, filter)),
		[library.records, filter],
	);
	const selection = useSelection(visible.length);
	const current = visible[selection.index];

	const changeMode = useCallback(
		(next: Mode) => {
			setMode(next);
			onInputCapture(next !== 'browse');
		},
		[onInputCapture],
	);

	useEffect(() => {
		if (!current) {
			setPreview([]);
			return;
		}
		let cancelled = false;
		actions
			.preview(current.files.stickerPng, PREVIEW_COLUMNS)
			.then((lines) => {
				if (!cancelled) setPreview(lines);
			})
			.catch(() => {
				if (!cancelled) setPreview(['(preview unavailable)']);
			});
		return () => {
			cancelled = true;
		};
	}, [actions, current]);

	const run = (label: string, task: () => Promise<string>) => {
		setStatus({ kind: 'info', text: `${label}...` });
		task()
			.then((text) => setStatus({ kind: 'success', text }))
			.catch((error) => setStatus({ kind: 'error', text: errorMessage(error) }));
	};

	useInput(
		(_input, key) => {
			if (key.escape) {
				setFilter('');
				changeMode('browse');
			}
		},
		{ isActive: mode === 'filter' },
	);

	useInput(
		(input, key) => {
			const target = visible[selection.read()];
			if (key.upArrow || input === 'k') {
				selection.move(-1);
			} else if (key.downArrow || input === 'j') {
				selection.move(1);
			} else if (input === '/') {
				changeMode('filter');
			} else if (input === 'R') {
				setLibrary(loadRecords());
				setStatus({ kind: 'info', text: 'Reloaded.' });
			} else if (target && input === 'c') {
				run('Copying', () => actions.copy(target.files.stickerPng));
			} else if (target && input === 'o') {
				run('Opening', async () => {
					await actions.open(target.files.stickerPng);
					return `Opened ${target.id}.`;
				});
			} else if (target && input === 'r') {
				run('Revealing', async () => {
					await actions.reveal(target.files.stickerPng);
					return `Revealed ${target.id}.`;
				});
			} else if (target && input === 'd') {
				changeMode('confirm-delete');
			}
		},
		{ isActive: mode === 'browse' },
	);

	const confirmDelete = () => {
		changeMode('browse');
		if (!current) return;
		try {
			deleteSticker(current.id);
			setLibrary(loadRecords());
			setStatus({ kind: 'success', text: `Deleted ${current.id}.` });
		} catch (error) {
			setStatus({ kind: 'error', text: errorMessage(error) });
		}
	};

	const listSize = Math.max(3, rows - 8);
	const window = visibleWindow(visible.length, selection.index, listSize);

	return (
		<Box flexDirection="column">
			<Box>
				<Box flexDirection="column" width={LIST_WIDTH} marginRight={2}>
					{mode === 'filter' ? (
						<Box>
							<Text color="cyan">/ </Text>
							<TextInput
								defaultValue={filter}
								placeholder="caption, concept, character, or id"
								onChange={(value) => {
									setFilter(value);
									selection.select(0);
								}}
								onSubmit={() => changeMode('browse')}
							/>
						</Box>
					) : (
						<Text dimColor>
							{visible.length} of {library.records.length} stickers
							{filter ? ` matching "${filter}"` : ''}
							{library.corrupt > 0 ? ` (${library.corrupt} unreadable)` : ''}
						</Text>
					)}
					{visible.length === 0 ? (
						<Text dimColor>
							{library.records.length === 0
								? 'No stickers yet. Invoke Stickr in your coding agent.'
								: 'No stickers match the filter.'}
						</Text>
					) : (
						visible.slice(window.start, window.end).map((record) => {
							const isSelected = record.id === current?.id;
							return (
								<Text key={record.id} color={isSelected ? 'cyan' : undefined} wrap="truncate">
									{isSelected ? '› ' : '  '}
									{record.id} {relativeTime(record.createdAt).padEnd(10)}{' '}
									{record.spec.caption ?? '(no caption)'}
								</Text>
							);
						})
					)}
				</Box>
				{current ? <StickerDetail record={current} preview={preview} /> : null}
			</Box>
			{mode === 'confirm-delete' && current ? (
				<Box>
					<Text color="yellow">Delete sticker {current.id}? </Text>
					<ConfirmInput
						defaultChoice="cancel"
						onConfirm={confirmDelete}
						onCancel={() => {
							changeMode('browse');
							setStatus({ kind: 'info', text: 'Nothing deleted.' });
						}}
					/>
				</Box>
			) : (
				<StatusLine status={status} />
			)}
			<Text dimColor>↑↓ move · / filter · c copy · o open · r reveal · d delete · R reload</Text>
		</Box>
	);
}

function StickerDetail({ record, preview }: { record: StickerRecord; preview: string[] }) {
	const { spec } = record;
	return (
		<Box flexDirection="column" flexGrow={1}>
			<Text bold>{spec.caption ? `"${spec.caption}"` : '(no caption)'}</Text>
			<Text dimColor>
				{record.id} · {new Date(record.createdAt).toLocaleString()} · {record.model}
			</Text>
			{spec.character ? <Text>Character: {spec.character}</Text> : null}
			<Text wrap="wrap">Concept: {spec.concept}</Text>
			{spec.contextSummary ? <Text wrap="wrap">Session: {spec.contextSummary}</Text> : null}
			<Box flexDirection="column" marginTop={1}>
				{preview.map((line, index) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: preview rows are positional
					<Text key={index}>{line}</Text>
				))}
			</Box>
		</Box>
	);
}
