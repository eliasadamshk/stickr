import { basename } from 'node:path';
import { confirm } from '../confirm.js';
import { StickrError } from '../errors.js';
import { deleteSticker, loadSticker, resolveStickerDir } from '../store.js';

function describeSticker(partialId: string): string {
	try {
		const record = loadSticker(partialId);
		return record.spec.caption ? `${record.id} "${record.spec.caption}"` : record.id;
	} catch {
		return `${basename(resolveStickerDir(partialId))} (unreadable metadata)`;
	}
}

export async function runDelete(
	partialId: string | undefined,
	options: { yes: boolean; ask?: (question: string) => Promise<boolean> },
): Promise<void> {
	if (!partialId) {
		throw new StickrError('stickr delete requires a sticker id.\nRun "stickr list" to see ids.');
	}
	const label = describeSticker(partialId);
	if (!options.yes) {
		const ask = options.ask ?? (process.stdin.isTTY ? confirm : undefined);
		if (!ask) {
			throw new StickrError(
				`Refusing to delete ${label} without confirmation.\nRun "stickr delete ${partialId} --yes" to delete it.`,
			);
		}
		if (!(await ask(`Delete sticker ${label}?`))) {
			console.log('Nothing deleted.');
			return;
		}
	}
	const id = deleteSticker(partialId);
	console.log(`✓ Deleted sticker ${id}.`);
}
