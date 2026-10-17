import sharp from 'sharp';
import { assert, describe, expect, it } from 'vitest';
import { contentBoundingBox, processSticker, STICKER_SIZE } from '../src/images/process.js';

async function makeSource(
	canvas: { w: number; h: number },
	subject: { x: number; y: number; w: number; h: number },
): Promise<Buffer> {
	const inner = await sharp({
		create: {
			width: subject.w,
			height: subject.h,
			channels: 4,
			background: { r: 30, g: 144, b: 255, alpha: 1 },
		},
	})
		.png()
		.toBuffer();
	return sharp({
		create: {
			width: canvas.w,
			height: canvas.h,
			channels: 4,
			background: { r: 0, g: 0, b: 0, alpha: 0 },
		},
	})
		.composite([{ input: inner, top: subject.y, left: subject.x }])
		.png()
		.toBuffer();
}

describe('contentBoundingBox', () => {
	it('finds the non-transparent region', () => {
		const w = 40;
		const h = 30;
		const channels = 4;
		const data = Buffer.alloc(w * h * channels, 0);
		for (let y = 3; y <= 9; y++) {
			for (let x = 5; x <= 14; x++) {
				data[(y * w + x) * channels + 3] = 255;
			}
		}
		const bbox = contentBoundingBox(data, w, h, channels);
		expect(bbox).toEqual({ left: 5, top: 3, width: 10, height: 7 });
	});

	it('returns null for fully transparent images', () => {
		const bbox = contentBoundingBox(Buffer.alloc(10 * 10 * 4), 10, 10, 4);
		expect(bbox).toBeNull();
	});
});

describe('processSticker normalization', () => {
	it('produces a centered 512x512 PNG and WebP with transparency', async () => {
		const source = await makeSource({ w: 1024, h: 1024 }, { x: 262, y: 362, w: 500, h: 300 });
		const { png, webp } = await processSticker(source);

		const metaPng = await sharp(png).metadata();
		expect(metaPng.format).toBe('png');
		expect(metaPng.width).toBe(STICKER_SIZE);
		expect(metaPng.height).toBe(STICKER_SIZE);
		expect(metaPng.hasAlpha).toBe(true);

		const metaWebp = await sharp(webp).metadata();
		expect(metaWebp.format).toBe('webp');
		expect(metaWebp.width).toBe(STICKER_SIZE);
		expect(metaWebp.height).toBe(STICKER_SIZE);
		expect(metaWebp.hasAlpha).toBe(true);

		const rawPng = await sharp(png).raw().toBuffer({ resolveWithObject: true });
		const ch = rawPng.info.channels;
		const at = (x: number, y: number) => rawPng.data[(y * STICKER_SIZE + x) * ch + 3];
		expect(at(0, 0)).toBeLessThan(8);
		expect(at(STICKER_SIZE - 1, 0)).toBeLessThan(8);
		let centerOpaque = false;
		for (let dx = -20; dx <= 20 && !centerOpaque; dx += 2) {
			if (at(256 + dx, 256)) centerOpaque = true;
		}
		expect(centerOpaque).toBe(true);
	});

	it('trims excess empty space and keeps sensible padding', async () => {
		const source = await makeSource({ w: 2048, h: 2048 }, { x: 1500, y: 1500, w: 400, h: 400 });
		const { png } = await processSticker(source);

		const bboxRaw = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
		const bbox = contentBoundingBox(
			bboxRaw.data,
			STICKER_SIZE,
			STICKER_SIZE,
			bboxRaw.info.channels,
		);
		assert(bbox);
		const right = STICKER_SIZE - bbox.left - bbox.width;
		const bottom = STICKER_SIZE - bbox.top - bbox.height;
		expect(Math.abs(bbox.left - right)).toBeLessThanOrEqual(2);
		expect(Math.abs(bbox.top - bottom)).toBeLessThanOrEqual(2);
		expect(Math.min(bbox.left, right, bbox.top, bottom)).toBeGreaterThanOrEqual(20);
	});

	it.each([
		['wide', { w: 1200, h: 600 }, { x: 50, y: 250, w: 1100, h: 80 }],
		['tall', { w: 600, h: 1200 }, { x: 250, y: 50, w: 80, h: 1100 }],
	])('preserves an extremely %s subject without cropping it', async (_name, canvas, subject) => {
		const source = await makeSource(canvas, subject);
		const { png } = await processSticker(source);
		const raw = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
		const bbox = contentBoundingBox(raw.data, STICKER_SIZE, STICKER_SIZE, raw.info.channels);
		assert(bbox);
		expect(bbox.width).toBeLessThanOrEqual(STICKER_SIZE);
		expect(bbox.height).toBeLessThanOrEqual(STICKER_SIZE);
		const aspectRatio = Math.max(bbox.width / bbox.height, bbox.height / bbox.width);
		expect(aspectRatio).toBeGreaterThan(10);
	});

	it('throws when there is nothing visible', async () => {
		const empty = await sharp({
			create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
		})
			.png()
			.toBuffer();
		await expect(processSticker(empty)).rejects.toThrow(/no visible content/i);
	});
});
