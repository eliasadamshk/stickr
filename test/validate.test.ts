import sharp from 'sharp';
import { assert, describe, expect, it } from 'vitest';
import { type TransparencyReport, validateTransparency } from '../src/images/validate.js';

function failureReason(report: TransparencyReport): string {
	assert(!report.ok);
	return report.reason;
}

async function makePng(opts: {
	width?: number;
	height?: number;
	background: { r: number; g: number; b: number; alpha: number };
}): Promise<Buffer> {
	return sharp({
		create: {
			width: opts.width ?? 32,
			height: opts.height ?? 32,
			channels: 4,
			background: opts.background,
		},
	})
		.png()
		.toBuffer();
}

describe('transparency validation', () => {
	it('accepts an image with real transparency and content', async () => {
		const inner = await sharp({
			create: { width: 16, height: 16, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
		})
			.png()
			.toBuffer();
		const png = await sharp({
			create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
		})
			.composite([{ input: inner, top: 24, left: 24 }])
			.png()
			.toBuffer();

		expect((await validateTransparency(png)).ok).toBe(true);
	});

	it('rejects a fully opaque rectangle', async () => {
		const opaque = await makePng({ background: { r: 10, g: 20, b: 30, alpha: 1 } });
		const report = await validateTransparency(opaque);
		expect(failureReason(report)).toMatch(/alpha channel|transparent/i);
	});

	it('rejects corrupt data', async () => {
		const report = await validateTransparency(Buffer.from('this is not a png'));
		expect(report.ok).toBe(false);
	});

	it('rejects a JPEG without alpha', async () => {
		const jpeg = await sharp({
			create: { width: 16, height: 16, channels: 3, background: '#ff8800' },
		})
			.jpeg()
			.toBuffer();
		const report = await validateTransparency(jpeg);
		expect(failureReason(report)).toMatch(/Expected a PNG/);
	});

	it('rejects a nearly-empty transparent image', async () => {
		const almostEmpty = await makePng({ background: { r: 1, g: 1, b: 1, alpha: 0 } });
		const report = await validateTransparency(almostEmpty);
		expect(failureReason(report)).toMatch(/empty/i);
	});

	it('rejects an image that is only barely transparent', async () => {
		// One transparent pixel row out of 100 rows (<2%).
		const body = await makePng({
			height: 99,
			background: { r: 200, g: 200, b: 200, alpha: 1 },
		});
		const sliver = await sharp({
			create: { width: 32, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
		})
			.png()
			.toBuffer();
		const combined = await sharp({
			create: { width: 32, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
		})
			.composite([
				{ input: body, top: 0, left: 0 },
				{ input: sliver, top: 99, left: 0 },
			])
			.png()
			.toBuffer();

		const report = await validateTransparency(combined);
		expect(failureReason(report)).toMatch(/barely|rectangle/i);
	});
});
