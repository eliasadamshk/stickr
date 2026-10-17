import { describe, expect, it } from 'vitest';
import { parseArgs, splitList, validateArgs } from '../src/args.js';
import { formatListRow, relativeTime } from '../src/commands/list.js';
import type { StickerRecord } from '../src/store.js';

describe('CLI argument parsing', () => {
	it('separates the command, positionals, and value flags', () => {
		const parsed = parseArgs(['generate', '--spec', '{"concept":"x"}', 'extra']);
		expect(parsed.command).toBe('generate');
		expect(parsed.flags.get('spec')).toBe('{"concept":"x"}');
		expect(parsed.positional).toEqual(['extra']);
	});

	it('does not consume positionals after boolean flags and supports equals syntax', () => {
		const parsed = parseArgs(['inspect', '--verbose', 'abc123', '--spec={"ok":true}']);
		expect(parsed.flags.get('verbose')).toBe(true);
		expect(parsed.flags.get('spec')).toBe('{"ok":true}');
		expect(parsed.positional).toEqual(['abc123']);
	});

	it('treats a leading flag as no command', () => {
		const parsed = parseArgs(['--help']);
		expect(parsed.command).toBeUndefined();
		expect(parsed.flags.has('help')).toBe(true);
	});

	it('rejects malformed options and extra positionals at the command boundary', () => {
		expect(() =>
			validateArgs('generate', [], new Map([['unknown', true]]), ['spec', 'json'], 0),
		).toThrow(/Unknown option/);
		expect(() =>
			validateArgs('generate', [], new Map([['spec', true]]), ['spec', 'json'], 0),
		).toThrow(/requires a value/);
		expect(() =>
			validateArgs('generate', [], new Map([['json', 'yes']]), ['spec', 'json'], 0),
		).toThrow(/does not take a value/);
		expect(() => validateArgs('list', ['extra'], new Map(), [], 0)).toThrow(/Too many arguments/);
		expect(() =>
			validateArgs('generate', [], new Map([['spec', '{"ok":true}']]), ['spec', 'json'], 0),
		).not.toThrow();
	});

	it('splits comma-separated agent names while preserving spaces', () => {
		expect(splitList("'Claude Code',Codex")).toEqual(['Claude Code', 'Codex']);
		expect(splitList('Codex, Claude Code')).toEqual(['Codex', 'Claude Code']);
		expect(splitList('Claude Code')).toEqual(['Claude Code']);
	});
});

describe('list formatting', () => {
	const baseRecord = (id: string, createdAt: string): StickerRecord => ({
		id,
		createdAt,
		spec: {
			concept: 'frog shipping code',
			subject: 'tiny frog',
			action: 'riding a rocket',
			mood: 'reckless joy',
			caption: id === 'nocap' ? undefined : 'SHIP IT',
		},
		model: 'm',
		promptVersion: 1,
		prompt: 'p',
		files: { originalPng: '', stickerPng: '', stickerWebp: '' },
		dir: '',
	});

	const now = new Date('2026-02-10T12:00:00Z');

	it('formats each user-visible age range', () => {
		const ago = (milliseconds: number) =>
			relativeTime(new Date(now.getTime() - milliseconds).toISOString(), now);
		expect(ago(30_000)).toBe('just now');
		expect(ago(2 * 60_000)).toBe('2m ago');
		expect(ago(3 * 3_600_000)).toBe('3h ago');
		expect(ago(24 * 3_600_000)).toBe('yesterday');
		expect(ago(3 * 24 * 3_600_000)).toBe('3d ago');
		expect(ago(8 * 24 * 3_600_000)).toBe('2026-02-02');
		expect(relativeTime('not-a-date', now)).toBe('unknown time');
	});

	it('renders the useful fields and handles a missing caption', () => {
		const row = formatListRow(
			baseRecord('abc123', new Date(now.getTime() - 2 * 60_000).toISOString()),
			now,
		);
		expect(row).toContain('abc123');
		expect(row).toContain('2m ago');
		expect(row).toContain('"SHIP IT"');
		expect(formatListRow(baseRecord('nocap', now.toISOString()), now)).toContain('(no caption)');
	});
});
