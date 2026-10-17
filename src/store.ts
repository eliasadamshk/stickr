import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { z } from 'zod';
import { ensureHome, stickrHome } from './config.js';
import { StickrError } from './errors.js';
import type { StickerSpec } from './spec.js';

const STICKER_ID = /^[a-z0-9]{6}$/;

/**
 * Stored specs were valid when written. Read them loosely so that tightening
 * the input spec rules later does not turn existing stickers into "corrupt" ones.
 */
const storedSpecSchema = z.looseObject({
	concept: z.string(),
	subject: z.string(),
	action: z.string(),
	mood: z.string(),
	caption: z.string().optional(),
	contextSummary: z.string().optional(),
});

export const metadataSchema = z.looseObject({
	id: z.string().regex(STICKER_ID),
	createdAt: z.string().datetime(),
	spec: storedSpecSchema,
	model: z.string().min(1),
	promptVersion: z.number().int().positive(),
	prompt: z.string().min(1),
});

export interface StickerMetadata {
	id: string;
	createdAt: string;
	spec: StickerSpec;
	model: string;
	promptVersion: number;
	prompt: string;
}

export interface StickerFiles {
	originalPng: string;
	stickerPng: string;
	stickerWebp: string;
}

export interface StickerRecord extends StickerMetadata {
	dir: string;
	files: StickerFiles;
}

export function stickersDir(): string {
	return join(stickrHome(), 'stickers');
}

function stickerDir(id: string): string {
	return join(stickersDir(), id);
}

function stickerFiles(dir: string): StickerFiles {
	return {
		originalPng: join(dir, 'original.png'),
		stickerPng: join(dir, 'sticker.png'),
		stickerWebp: join(dir, 'sticker.webp'),
	};
}

function assertStickerId(id: string, partial = false): void {
	const pattern = partial ? /^[a-z0-9]{1,6}$/ : STICKER_ID;
	if (!pattern.test(id)) {
		throw new StickrError(
			partial
				? `Invalid sticker id "${id}". Use 1–6 lowercase letters or digits.`
				: `Generated sticker id "${id}" is invalid.`,
		);
	}
}

export function writeSticker(input: {
	makeId: () => string;
	spec: StickerSpec;
	model: string;
	promptVersion: number;
	prompt: string;
	original: Buffer;
	png: Buffer;
	webp: Buffer;
}): StickerRecord {
	const id = input.makeId();
	assertStickerId(id);
	const dir = stickerDir(id);
	// Write into a temp directory and rename it into place, so an interrupted
	// run never leaves a sticker directory without metadata.
	const tmpDir = join(stickersDir(), `.tmp-${id}-${process.pid}`);
	const tmpFiles = stickerFiles(tmpDir);

	const meta: StickerMetadata = {
		id,
		createdAt: new Date().toISOString(),
		spec: input.spec,
		model: input.model,
		promptVersion: input.promptVersion,
		prompt: input.prompt,
	};
	try {
		ensureHome();
		if (existsSync(dir)) {
			throw new StickrError(`Sticker id collision: "${id}" already exists. Generate again.`);
		}
		mkdirSync(tmpDir, { mode: 0o700 });
		writeFileSync(tmpFiles.originalPng, input.original, { mode: 0o600 });
		writeFileSync(tmpFiles.stickerPng, input.png, { mode: 0o600 });
		writeFileSync(tmpFiles.stickerWebp, input.webp, { mode: 0o600 });
		writeFileSync(join(tmpDir, 'metadata.json'), `${JSON.stringify(meta, null, 2)}\n`, {
			encoding: 'utf8',
			mode: 0o600,
		});
		renameSync(tmpDir, dir);
	} catch (error) {
		rmSync(tmpDir, { recursive: true, force: true });
		if (error instanceof StickrError) throw error;
		throw new StickrError(
			`Could not save sticker "${id}": ${error instanceof Error ? error.message : error}`,
			{ cause: error },
		);
	}
	return { ...meta, dir, files: stickerFiles(dir) };
}

export function resolveStickerDir(partialId: string): string {
	assertStickerId(partialId, true);
	const root = stickersDir();
	if (!existsSync(root)) {
		throw new StickrError(
			'No stickers stored yet. Invoke Stickr in your coding agent or run "stickr generate".',
		);
	}
	const exact = join(root, partialId);
	if (existsSync(exact)) return exact;

	const matches = readdirSync(root).filter(
		(name) => STICKER_ID.test(name) && name.startsWith(partialId),
	);
	if (matches.length === 0) {
		throw new StickrError(
			`No sticker found matching "${partialId}". Run "stickr list" to see ids.`,
		);
	}
	if (matches.length > 1) {
		throw new StickrError(
			`"${partialId}" is ambiguous (${matches.join(', ')}). Use more characters.`,
		);
	}
	return join(root, matches[0]);
}

export function loadSticker(partialId: string): StickerRecord {
	const dir = resolveStickerDir(partialId);
	const metaPath = join(dir, 'metadata.json');
	if (!existsSync(metaPath)) {
		throw new StickrError(
			`Metadata missing for sticker in ${dir}\nThe directory may be corrupted.`,
		);
	}
	let raw: unknown;
	try {
		raw = JSON.parse(readFileSync(metaPath, 'utf8'));
	} catch {
		throw new StickrError(
			`Metadata is corrupted: ${metaPath}\nDelete the sticker directory and regenerate.`,
		);
	}
	const parsed = metadataSchema.safeParse(raw);
	if (!parsed.success) {
		throw new StickrError(
			`Metadata is corrupted: ${metaPath}\nDelete the sticker directory and regenerate.`,
		);
	}
	if (parsed.data.id !== basename(dir)) {
		throw new StickrError(
			`Metadata id does not match its directory: ${metaPath}\nDelete the sticker directory and regenerate.`,
		);
	}
	return { ...(parsed.data as StickerMetadata), dir, files: stickerFiles(dir) };
}

/** List all stored stickers, newest first. Corrupt entries are skipped with a note. */
export function listStickers(): { records: StickerRecord[]; corrupt: string[] } {
	const root = stickersDir();
	if (!existsSync(root)) return { records: [], corrupt: [] };
	const records: StickerRecord[] = [];
	const corrupt: string[] = [];
	// Ignore non-sticker entries such as .DS_Store or in-progress temp directories.
	for (const name of readdirSync(root).filter((entry) => STICKER_ID.test(entry))) {
		try {
			records.push(loadSticker(name));
		} catch {
			corrupt.push(name);
		}
	}
	records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	return { records, corrupt };
}

/**
 * Delete a stored sticker, including one whose metadata is unreadable. The
 * directory is renamed out of the listing first so a failed removal never
 * leaves a half-deleted sticker behind.
 */
export function deleteSticker(partialId: string): string {
	const dir = resolveStickerDir(partialId);
	const id = basename(dir);
	const trashDir = join(stickersDir(), `.trash-${id}-${process.pid}`);
	try {
		renameSync(dir, trashDir);
	} catch (error) {
		throw new StickrError(
			`Could not delete sticker "${id}": ${error instanceof Error ? error.message : error}`,
			{ cause: error },
		);
	}
	rmSync(trashDir, { recursive: true, force: true });
	return id;
}
