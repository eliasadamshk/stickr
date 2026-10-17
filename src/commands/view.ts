import { copyImageToClipboard } from '../clipboard.js';
import { StickrError } from '../errors.js';
import { openInViewer, revealInFileManager } from '../platform.js';
import { loadSticker } from '../store.js';

export async function runOpen(partialId: string): Promise<void> {
	const record = loadSticker(requireId(partialId, 'open'));
	await openInViewer(record.files.stickerPng);
}

export async function runReveal(partialId: string): Promise<void> {
	const record = loadSticker(requireId(partialId, 'reveal'));
	await revealInFileManager(record.files.stickerPng);
}

export async function runCopy(partialId: string): Promise<void> {
	const record = loadSticker(requireId(partialId, 'copy'));
	const note = await copyImageToClipboard(record.files.stickerPng);
	console.log(`${note} (${record.id})`);
}

function requireId(id: string | undefined, command: string): string {
	if (!id) {
		throw new StickrError(
			`stickr ${command} requires a sticker id.\nRun "stickr list" to see ids.`,
		);
	}
	return id;
}
