import sharp from 'sharp';
import { StickrError } from '../errors.js';
import { loadSticker } from '../store.js';

export async function runInspect(partialId: string, verbose = false): Promise<void> {
	if (!partialId) {
		throw new StickrError('inspect requires a sticker id. Run "stickr list" to see ids.');
	}
	const record = loadSticker(partialId);

	console.log(`Sticker ${record.id}`);
	console.log(`Created:  ${record.createdAt} (${new Date(record.createdAt).toLocaleString()})`);
	console.log(`Model:    ${record.model}`);
	console.log(`Prompt:   v${record.promptVersion}`);
	console.log('');
	console.log('StickerSpec:');
	console.log(JSON.stringify(record.spec, null, 2));
	console.log('');

	const files: Array<[string, string]> = [
		['original.png', record.files.originalPng],
		['sticker.png', record.files.stickerPng],
		['sticker.webp', record.files.stickerWebp],
	];
	console.log('Files:');
	for (const [label, path] of files) {
		process.stdout.write(`  ${label.padEnd(14)} ${path}`);
		try {
			const meta = await sharp(path).metadata();
			const sizeKb = Math.round((meta.size ?? 0) / 1024);
			console.log(`  (${meta.width}x${meta.height}, ${sizeKb} KB)`);
		} catch {
			console.log('  (unreadable)');
		}
	}

	if (verbose || process.env.STICKR_DEBUG === '1') {
		console.log('\nPrompt:');
		console.log(record.prompt);
	}
}
