import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runDelete } from '../src/commands/delete.js';
import { runList } from '../src/commands/list.js';
import { confirm } from '../src/confirm.js';
import type { StickerSpec } from '../src/spec.js';
import { deleteSticker, stickersDir, writeSticker } from '../src/store.js';

const spec: StickerSpec = {
	concept: 'raccoon with a green checkmark',
	subject: 'exhausted raccoon',
	action: 'holding a giant green checkmark',
	mood: 'weary triumph',
	caption: 'IT WAS THE TEST',
};

function storeSticker(id: string): string {
	return writeSticker({
		makeId: () => id,
		spec,
		model: 'fake-model',
		promptVersion: 4,
		prompt: 'prompt',
		original: Buffer.from('original'),
		png: Buffer.from('png'),
		webp: Buffer.from('webp'),
	}).dir;
}

function captureConsole(): { stdout: string[]; stderr: string[] } {
	const output = { stdout: [] as string[], stderr: [] as string[] };
	vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
		output.stdout.push(args.join(' '));
	});
	vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
		output.stderr.push(args.join(' '));
	});
	return output;
}

let home: string;

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), 'stickr-delete-'));
	process.env.STICKR_HOME = home;
});

afterEach(() => {
	vi.restoreAllMocks();
	delete process.env.STICKR_HOME;
	rmSync(home, { recursive: true, force: true });
});

describe('deleteSticker', () => {
	it('removes the sticker directory by partial id without leftovers', () => {
		const dir = storeSticker('abc123');
		storeSticker('xyz789');
		expect(deleteSticker('abc')).toBe('abc123');
		expect(existsSync(dir)).toBe(false);
		expect(readdirSync(stickersDir())).toEqual(['xyz789']);
	});

	it('deletes a sticker whose metadata is corrupt', () => {
		const dir = storeSticker('abc123');
		rmSync(join(dir, 'metadata.json'));
		expect(deleteSticker('abc123')).toBe('abc123');
		expect(existsSync(dir)).toBe(false);
	});

	it('rejects ambiguous, unknown, and malformed ids', () => {
		storeSticker('alph11');
		storeSticker('alph12');
		expect(() => deleteSticker('alph')).toThrow(/ambiguous/);
		expect(() => deleteSticker('zzz')).toThrow(/No sticker found/);
		expect(() => deleteSticker('../x')).toThrow(/Invalid sticker id/);
	});
});

describe('stickr delete', () => {
	it('deletes after confirmation and names the sticker in the question', async () => {
		const dir = storeSticker('abc123');
		const ask = vi.fn().mockResolvedValue(true);
		const output = captureConsole();
		await runDelete('abc', { yes: false, ask });
		expect(ask).toHaveBeenCalledWith('Delete sticker abc123 "IT WAS THE TEST"?');
		expect(existsSync(dir)).toBe(false);
		expect(output.stdout).toEqual(['✓ Deleted sticker abc123.']);
	});

	it('keeps the sticker when confirmation is declined', async () => {
		const dir = storeSticker('abc123');
		const output = captureConsole();
		await runDelete('abc123', { yes: false, ask: async () => false });
		expect(existsSync(dir)).toBe(true);
		expect(output.stdout).toEqual(['Nothing deleted.']);
	});

	it('skips confirmation with --yes', async () => {
		const dir = storeSticker('abc123');
		captureConsole();
		const ask = vi.fn();
		await runDelete('abc123', { yes: true, ask });
		expect(ask).not.toHaveBeenCalled();
		expect(existsSync(dir)).toBe(false);
	});

	it('refuses to delete without a terminal or --yes', async () => {
		const dir = storeSticker('abc123');
		const originalIsTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
		Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
		try {
			await expect(runDelete('abc123', { yes: false })).rejects.toThrow(/--yes/);
			expect(existsSync(dir)).toBe(true);
		} finally {
			if (originalIsTTY) Object.defineProperty(process.stdin, 'isTTY', originalIsTTY);
			else Reflect.deleteProperty(process.stdin, 'isTTY');
		}
	});

	it('requires an id', async () => {
		await expect(runDelete(undefined, { yes: true })).rejects.toThrow(/requires a sticker id/);
	});
});

describe('confirm', () => {
	it.each([
		['y\n', true],
		['YES\n', true],
		['n\n', false],
		['\n', false],
	])('treats %j as %s', async (answer, expected) => {
		const input = new PassThrough();
		const output = new PassThrough();
		const result = confirm('Delete?', input, output);
		input.end(answer);
		await expect(result).resolves.toBe(expected);
		expect(output.read()?.toString()).toContain('Delete? [y/N]');
	});
});

describe('stickr list --json', () => {
	it('prints an empty array when there are no stickers', () => {
		const output = captureConsole();
		runList(true);
		expect(JSON.parse(output.stdout.join('\n'))).toEqual([]);
	});

	it('prints records on stdout and corrupt entries on stderr', () => {
		storeSticker('abc123');
		rmSync(join(storeSticker('bad000'), 'metadata.json'));
		const output = captureConsole();
		runList(true);
		const printed = JSON.parse(output.stdout.join('\n'));
		expect(printed).toHaveLength(1);
		expect(printed[0]).toMatchObject({
			id: 'abc123',
			spec: { caption: 'IT WAS THE TEST' },
			files: { stickerPng: join(stickersDir(), 'abc123', 'sticker.png') },
		});
		expect(output.stderr).toEqual(['Skipped unreadable sticker directory: bad000']);
	});
});
