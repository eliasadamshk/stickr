import sharp from 'sharp';

export const STICKER_SIZE = 512;
const PADDING = 28;
const ALPHA_THRESHOLD = 8;

export function contentBoundingBox(
	data: Buffer,
	width: number,
	height: number,
	channels: number,
): { left: number; top: number; width: number; height: number } | null {
	let minX = width;
	let minY = height;
	let maxX = -1;
	let maxY = -1;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (data[(y * width + x) * channels + 3] > ALPHA_THRESHOLD) {
				if (x < minX) minX = x;
				if (x > maxX) maxX = x;
				if (y < minY) minY = y;
				if (y > maxY) maxY = y;
			}
		}
	}
	if (maxX < 0) return null;
	return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export interface ProcessedSticker {
	png: Buffer;
	webp: Buffer;
}

/**
 * Normalize a transparent source image into a 512x512 die-cut sticker:
 * trim empty space, keep sensible padding, center on a square canvas,
 * and emit optimized PNG + WebP with transparency preserved.
 */
export async function processSticker(source: Buffer): Promise<ProcessedSticker> {
	const raw = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

	const bbox = contentBoundingBox(raw.data, raw.info.width, raw.info.height, raw.info.channels);
	if (!bbox) {
		throw new Error('Image has no visible content to place on the sticker canvas.');
	}

	// Inner area available for the subject after padding. Small subjects are
	// upscaled so the artwork fills the sticker like a real die-cut.
	const inner = STICKER_SIZE - PADDING * 2;
	const scale = Math.min(inner / bbox.width, inner / bbox.height);
	const targetW = Math.max(1, Math.round(bbox.width * scale));
	const targetH = Math.max(1, Math.round(bbox.height * scale));
	const left = Math.round((STICKER_SIZE - targetW) / 2);
	const top = Math.round((STICKER_SIZE - targetH) / 2);

	const subject = await sharp(source)
		.extract(bbox)
		.resize(targetW, targetH, { kernel: 'lanczos3', fit: 'fill' })
		.png()
		.toBuffer();

	const png = await sharp(subject)
		.extend({
			top,
			bottom: STICKER_SIZE - top - targetH,
			left,
			right: STICKER_SIZE - left - targetW,
			background: { r: 0, g: 0, b: 0, alpha: 0 },
		})
		.png({ compressionLevel: 9 })
		.toBuffer();

	const webp = await sharp(png)
		.webp({ quality: 90, alphaQuality: 90, smartSubsample: true })
		.toBuffer();

	return { png, webp };
}
