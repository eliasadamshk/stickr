import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanup, render } from 'ink-testing-library';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addCharacter, findCharacter } from '../src/characters.js';
import { loadConfig, saveConfig } from '../src/config.js';
import type { StickerSpec } from '../src/spec.js';
import { listStickers, writeSticker } from '../src/store.js';
import { App } from '../src/tui/App.js';
import { type TuiActions, visibleWindow } from '../src/tui/actions.js';
import { renderHalfBlocks } from '../src/tui/preview.js';
import { cycle } from '../src/tui/SettingsView.js';
import { matchesFilter } from '../src/tui/StickersView.js';

const KEYS = {
	up: '\u001B[A',
	down: '\u001B[B',
	right: '\u001B[C',
	enter: '\r',
	escape: '\u001B',
	tab: '\t',
};

const spec: StickerSpec = {
	concept: 'raccoon holding a green checkmark',
	subject: 'exhausted raccoon',
	action: 'holding a giant checkmark',
	mood: 'weary triumph',
	caption: 'IT WAS THE TEST',
};

function storeSticker(id: string, overrides: Partial<StickerSpec> = {}): void {
	writeSticker({
		makeId: () => id,
		spec: { ...spec, ...overrides },
		model: 'fake-model',
		promptVersion: 4,
		prompt: 'prompt',
		original: Buffer.from('original'),
		png: Buffer.from('png'),
		webp: Buffer.from('webp'),
	});
}

function fakeActions(): TuiActions & { [K in keyof TuiActions]: ReturnType<typeof vi.fn> } {
	return {
		copy: vi.fn().mockResolvedValue('Copied to clipboard.'),
		open: vi.fn().mockResolvedValue(undefined),
		reveal: vi.fn().mockResolvedValue(undefined),
		preview: vi.fn().mockResolvedValue(['[preview]']),
	};
}

/** Let React effects, input handlers, and pending promises settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

async function press(stdin: { write: (data: string) => void }, ...keys: string[]): Promise<void> {
	for (const key of keys) {
		stdin.write(key);
		await settle();
	}
}

let home: string;

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), 'stickr-tui-'));
	process.env.STICKR_HOME = home;
});

afterEach(() => {
	cleanup();
	delete process.env.STICKR_HOME;
	rmSync(home, { recursive: true, force: true });
});

describe('stickers tab', () => {
	it('shows an empty library hint', async () => {
		const { lastFrame } = render(<App actions={fakeActions()} />);
		await settle();
		expect(lastFrame()).toContain('No stickers yet');
	});

	it('lists stickers with details and a preview of the selected one', async () => {
		storeSticker('abc123');
		const actions = fakeActions();
		const { lastFrame } = render(<App actions={actions} />);
		await settle();
		const frame = lastFrame() ?? '';
		expect(frame).toContain('› abc123');
		expect(frame).toContain('"IT WAS THE TEST"');
		expect(frame).toContain('Concept: raccoon holding a green checkmark');
		expect(frame).toContain('[preview]');
		expect(actions.preview).toHaveBeenCalledWith(listStickers().records[0].files.stickerPng, 32);
	});

	it('copies, opens, and reveals the selected sticker', async () => {
		storeSticker('abc123');
		const actions = fakeActions();
		const { stdin, lastFrame } = render(<App actions={actions} />);
		await settle();
		const png = listStickers().records[0].files.stickerPng;
		await press(stdin, 'c');
		expect(actions.copy).toHaveBeenCalledWith(png);
		expect(lastFrame()).toContain('Copied to clipboard.');
		await press(stdin, 'o', 'r');
		expect(actions.open).toHaveBeenCalledWith(png);
		expect(actions.reveal).toHaveBeenCalledWith(png);
		expect(lastFrame()).toContain('Revealed abc123.');
	});

	it('reports action failures without crashing', async () => {
		storeSticker('abc123');
		const actions = fakeActions();
		actions.copy.mockRejectedValue(new Error('no clipboard tool'));
		const { stdin, lastFrame } = render(<App actions={actions} />);
		await settle();
		await press(stdin, 'c');
		expect(lastFrame()).toContain('✗ no clipboard tool');
	});

	it('filters stickers as you type', async () => {
		storeSticker('abc123');
		storeSticker('def456', { caption: 'SHIP IT', concept: 'otter launching a rocket' });
		const { stdin, lastFrame } = render(<App actions={fakeActions()} />);
		await settle();
		await press(stdin, '/', 'r', 'o', 'c', 'k');
		expect(lastFrame()).toContain('def456');
		expect(lastFrame()).not.toContain('abc123');
		await press(stdin, KEYS.enter);
		expect(lastFrame()).toContain('1 of 2 stickers matching "rock"');
		await press(stdin, '/', KEYS.escape);
		expect(lastFrame()).toContain('2 of 2 stickers');
	});

	it('deletes the selected sticker only after confirmation', async () => {
		storeSticker('abc123');
		const { stdin, lastFrame } = render(<App actions={fakeActions()} />);
		await settle();
		await press(stdin, 'd');
		expect(lastFrame()).toContain('Delete sticker abc123?');
		await press(stdin, 'n');
		expect(lastFrame()).toContain('Nothing deleted.');
		expect(listStickers().records).toHaveLength(1);
		await press(stdin, 'd', 'y');
		expect(lastFrame()).toContain('Deleted abc123.');
		expect(listStickers().records).toHaveLength(0);
	});
});

describe('characters tab', () => {
	it('adds a custom character through the form', async () => {
		const { stdin, lastFrame } = render(<App actions={fakeActions()} />);
		await settle();
		await press(stdin, '2', 'a');
		expect(lastFrame()).toContain('Name:');
		await press(stdin, ...'hedgehog', KEYS.enter);
		expect(lastFrame()).toContain('Look of hedgehog:');
		await press(stdin, ...'a round hedgehog with soft spines', KEYS.enter);
		expect(lastFrame()).toContain('Added "hedgehog".');
		expect(findCharacter('hedgehog')?.description).toBe('a round hedgehog with soft spines');
	});

	it('shows validation errors and keeps the form open', async () => {
		const { stdin, lastFrame } = render(<App actions={fakeActions()} />);
		await settle();
		await press(stdin, '2', 'a', ...'hog', KEYS.enter, ...'tiny', KEYS.enter);
		expect(lastFrame()).toContain('Invalid character description');
		expect(lastFrame()).toContain('Look of hog:');
		expect(lastFrame()).toContain('tiny');
		expect(lastFrame()).not.toContain('hogtiny');
		await press(stdin, KEYS.escape);
		expect(lastFrame()).toContain('Cancelled.');
	});

	it('sets and clears the default character', async () => {
		const { stdin, lastFrame } = render(<App actions={fakeActions()} />);
		await settle();
		await press(stdin, '2', KEYS.down, KEYS.enter);
		expect(loadConfig().character).toBe('raccoon');
		expect(lastFrame()).toContain('★ raccoon');
		await press(stdin, KEYS.enter);
		expect(loadConfig().character).toBeUndefined();
	});

	it('protects built-ins and deletes custom characters after confirmation', async () => {
		addCharacter('hedgehog', 'a round hedgehog with soft spines');
		saveConfig({ ...loadConfig(), character: 'hedgehog' });
		const { stdin, lastFrame } = render(<App actions={fakeActions()} />);
		await settle();
		await press(stdin, '2', 'd');
		expect(lastFrame()).toContain('"otter" is built-in');
		await press(stdin, ...Array(5).fill(KEYS.down), 'd');
		expect(lastFrame()).toContain('Delete character hedgehog?');
		await press(stdin, 'y');
		expect(lastFrame()).toContain('Removed "hedgehog" and cleared it as the default.');
		expect(findCharacter('hedgehog')).toBeUndefined();
	});

	it('does not switch tabs or quit while typing in a form', async () => {
		const { stdin, lastFrame } = render(<App actions={fakeActions()} />);
		await settle();
		await press(stdin, '2', 'a', 'q', '1');
		expect(lastFrame()).toContain('Name:');
		expect(lastFrame()).toContain('q1');
	});
});

describe('settings tab', () => {
	it('cycles settings and saves them immediately', async () => {
		const { stdin, lastFrame } = render(<App actions={fakeActions()} />);
		await settle();
		await press(stdin, KEYS.tab, KEYS.tab, KEYS.right);
		expect(loadConfig().provider).toBe('gemini');
		await press(stdin, KEYS.down, KEYS.enter);
		expect(loadConfig().autoCopy).toBe(false);
		await press(stdin, KEYS.down, KEYS.right);
		expect(loadConfig().character).toBe('otter');
		expect(lastFrame()).toContain('Default character: otter');
	});

	it('applies keys that arrive in one chunk to the row moved to', async () => {
		const { stdin } = render(<App actions={fakeActions()} />);
		await settle();
		await press(stdin, '3', `${KEYS.down}${KEYS.down}${KEYS.right}`);
		expect(loadConfig().provider).toBe('openai');
		expect(loadConfig().character).toBe('otter');
	});

	it('reports a corrupt config instead of crashing', async () => {
		const { writeFileSync } = await import('node:fs');
		writeFileSync(join(home, 'config.json'), '{oops');
		const { stdin, lastFrame } = render(<App actions={fakeActions()} />);
		await settle();
		await press(stdin, '3');
		expect(lastFrame()).toContain('Config file is not valid JSON');
	});
});

describe('helpers', () => {
	it('keeps the selected row inside the visible window', () => {
		expect(visibleWindow(5, 4, 10)).toEqual({ start: 0, end: 5 });
		expect(visibleWindow(100, 0, 10)).toEqual({ start: 0, end: 10 });
		expect(visibleWindow(100, 50, 10)).toEqual({ start: 45, end: 55 });
		expect(visibleWindow(100, 99, 10)).toEqual({ start: 90, end: 100 });
	});

	it('cycles through options in both directions', () => {
		expect(cycle(['a', 'b', 'c'], 'c', 1)).toBe('a');
		expect(cycle(['a', 'b', 'c'], 'a', -1)).toBe('c');
		expect(cycle(['a', 'b'], 'missing', 1)).toBe('a');
	});

	it('matches filters against caption, concept, character, and id', () => {
		storeSticker('abc123', { character: 'otter' });
		const [record] = listStickers().records;
		for (const filter of ['', 'was the', 'RACCOON', 'otter', 'abc']) {
			expect(matchesFilter(record, filter)).toBe(true);
		}
		expect(matchesFilter(record, 'flamingo')).toBe(false);
	});

	it('renders transparent pixels as blanks and opaque ones as colored half blocks', async () => {
		const path = join(home, 'half.png');
		await sharp({
			create: { width: 2, height: 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
		})
			.composite([
				{
					input: { create: { width: 1, height: 1, channels: 4, background: '#ff0000' } },
					left: 0,
					top: 0,
				},
			])
			.png()
			.toFile(path);
		const lines = await renderHalfBlocks(path, 2);
		expect(lines).toHaveLength(1);
		expect(lines[0]).toBe('\x1b[38;2;255;0;0m▀\x1b[0m ');
	});
});
