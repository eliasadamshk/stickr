import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { removeChromaKey } from '../src/images/chroma-key.js';
import { GEMINI_IMAGE_MODEL, GeminiImageProvider } from '../src/provider/gemini.js';

/** 64x64 magenta JPEG with a white-bordered square whose center is also magenta. */
async function keyedJpeg(): Promise<Buffer> {
	const square = await sharp({
		create: { width: 32, height: 32, channels: 3, background: '#ffffff' },
	})
		.composite([
			{
				input: await sharp({
					create: { width: 16, height: 16, channels: 3, background: '#ff00ff' },
				})
					.png()
					.toBuffer(),
				top: 8,
				left: 8,
			},
		])
		.png()
		.toBuffer();
	return sharp({ create: { width: 64, height: 64, channels: 3, background: '#ff00ff' } })
		.composite([{ input: square, top: 16, left: 16 }])
		.jpeg({ quality: 90 })
		.toBuffer();
}

async function alphaAt(png: Buffer, x: number, y: number): Promise<number> {
	const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
	return data[(y * info.width + x) * info.channels + 3];
}

describe('chroma key removal', () => {
	it('clears the edge background and enclosed magenta pockets but keeps the border', async () => {
		const png = await removeChromaKey(await keyedJpeg());
		expect(await alphaAt(png, 2, 2)).toBe(0);
		expect(await alphaAt(png, 20, 20)).toBe(255);
		// A flat magenta pocket enclosed by the border is background too.
		expect(await alphaAt(png, 32, 32)).toBe(0);
	});
});

describe('Gemini image provider', () => {
	it('requests a square JPEG and returns it with the background keyed out', async () => {
		const jpeg = await keyedJpeg();
		const fetchImpl = vi.fn<typeof fetch>(async () =>
			Response.json({
				status: 'completed',
				steps: [{ content: [{ type: 'image', data: jpeg.toString('base64') }] }],
			}),
		);

		const png = await new GeminiImageProvider('test-key', fetchImpl).generate('draw a frog');

		const [, init] = fetchImpl.mock.calls[0];
		expect(init?.headers).toMatchObject({ 'x-goog-api-key': 'test-key' });
		expect(JSON.parse(String(init?.body))).toEqual({
			model: GEMINI_IMAGE_MODEL,
			input: 'draw a frog',
			response_format: {
				type: 'image',
				mime_type: 'image/jpeg',
				aspect_ratio: '1:1',
				image_size: '1K',
			},
		});
		expect((await sharp(png).metadata()).format).toBe('png');
		expect(await alphaAt(png, 2, 2)).toBe(0);
	});

	it('explains depleted prepay credits', async () => {
		const fetchImpl = vi.fn<typeof fetch>(async () =>
			Response.json(
				{ error: { message: 'Your prepayment credits are depleted.' } },
				{ status: 402 },
			),
		);
		await expect(new GeminiImageProvider('test-key', fetchImpl).generate('p')).rejects.toThrow(
			/prepayment credits are depleted.*ai\.studio/s,
		);
	});
});
