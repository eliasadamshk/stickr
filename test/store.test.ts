import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { StickerSpec } from '../src/spec.js';
import { listStickers, loadSticker, resolveStickerDir, writeSticker } from '../src/store.js';

const spec: StickerSpec = {
	concept: 'raccoon with a green checkmark',
	subject: 'exhausted raccoon',
	action: 'holding a giant green checkmark',
	mood: 'weary triumph',
	caption: 'IT WAS THE TEST',
	contextSummary: 'Flaky test finally fixed',
};

function fileBytes(label: string): Buffer {
	return Buffer.from(`${label} bytes`);
}

let home: string;

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), 'stickr-store-'));
	process.env.STICKR_HOME = home;
});

afterEach(() => {
	delete process.env.STICKR_HOME;
	rmSync(home, { recursive: true, force: true });
});

describe('sticker storage', () => {
	it('writes all artifacts and reads validated metadata back', () => {
		const record = writeSticker({
			makeId: () => 'abc123',
			spec,
			model: 'gpt-image-2',
			promptVersion: 2,
			prompt: 'test prompt',
			original: fileBytes('original'),
			png: fileBytes('png'),
			webp: fileBytes('webp'),
		});

		expect(record.dir).toBe(join(home, 'stickers', 'abc123'));
		const loaded = loadSticker('abc123');
		expect(loaded.spec.caption).toBe('IT WAS THE TEST');
		expect(loaded.model).toBe('gpt-image-2');
		expect(loaded.files.stickerPng).toBe(join(record.dir, 'sticker.png'));
		expect(readFileSync(loaded.files.originalPng)).toEqual(fileBytes('original'));
		expect(readFileSync(loaded.files.stickerPng)).toEqual(fileBytes('png'));
		expect(readFileSync(loaded.files.stickerWebp)).toEqual(fileBytes('webp'));
	});

	it('resolves partial ids uniquely and errors on ambiguity or absence', () => {
		for (const id of ['alph11', 'alph12']) {
			writeSticker({
				makeId: () => id,
				spec,
				model: 'm',
				promptVersion: 1,
				prompt: 'p',
				original: Buffer.alloc(0),
				png: Buffer.alloc(0),
				webp: Buffer.alloc(0),
			});
		}
		expect(() => resolveStickerDir('alph')).toThrow(/ambiguous/);
		expect(resolveStickerDir('alph11')).toContain('alph11');
		expect(() => resolveStickerDir('zzzzzz')).toThrow(/No sticker found/);
	});

	it('lists stickers newest first and skips corrupt entries', () => {
		const mk = (id: string) =>
			writeSticker({
				makeId: () => id,
				spec,
				model: 'm',
				promptVersion: 1,
				prompt: 'p',
				original: Buffer.alloc(0),
				png: Buffer.alloc(0),
				webp: Buffer.alloc(0),
			});

		const older = mk('old001');
		mk('new002');
		const metaPath = join(older.dir, 'metadata.json');
		const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
		meta.createdAt = new Date(Date.now() - 3_600_000).toISOString();
		writeFileSync(metaPath, JSON.stringify(meta));

		writeFileSync(join(home, 'stickers', 'bad001'), 'garbage');

		const { records, corrupt } = listStickers();
		expect(records.map((r) => r.id)).toEqual(['new002', 'old001']);
		expect(corrupt).toEqual(['bad001']);
	});

	it('reports corrupted metadata as an actionable error', () => {
		writeSticker({
			makeId: () => 'brok01',
			spec,
			model: 'm',
			promptVersion: 1,
			prompt: 'p',
			original: Buffer.alloc(0),
			png: Buffer.alloc(0),
			webp: Buffer.alloc(0),
		});
		writeFileSync(join(home, 'stickers', 'brok01', 'metadata.json'), '{broken');

		expect(() => loadSticker('brok01')).toThrow(/corrupted.*delete.*regenerate/is);
	});

	it('rejects metadata copied into a differently named directory', () => {
		const record = writeSticker({
			makeId: () => 'right1',
			spec,
			model: 'm',
			promptVersion: 1,
			prompt: 'p',
			original: Buffer.alloc(0),
			png: Buffer.alloc(0),
			webp: Buffer.alloc(0),
		});
		cpSync(record.dir, join(home, 'stickers', 'wrong1'), { recursive: true });
		expect(() => loadSticker('wrong1')).toThrow(/does not match/);
	});

	it('rejects path-like ids and collisions', () => {
		expect(() => resolveStickerDir('../etc')).toThrow(/Invalid sticker id/);
		const image = fileBytes('image');
		const input = {
			makeId: () => 'same01',
			spec,
			model: 'm',
			promptVersion: 1,
			prompt: 'p',
			original: image,
			png: image,
			webp: image,
		};
		writeSticker(input);
		expect(() => writeSticker(input)).toThrow(/collision/);
	});

	it('does not create storage while resolving a missing sticker', () => {
		rmSync(join(home, 'stickers'), { recursive: true, force: true });
		expect(() => resolveStickerDir('abc123')).toThrow(/No stickers stored/);
		expect(existsSync(join(home, 'stickers'))).toBe(false);
	});
});
