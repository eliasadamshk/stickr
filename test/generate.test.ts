import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addCharacter } from '../src/characters.js';
import { generateAndReport, runGenerate } from '../src/commands/generate.js';
import { saveConfig } from '../src/config.js';
import { buildRetryPrompt } from '../src/prompt.js';
import type { ImageProvider } from '../src/provider/types.js';
import type { StickerSpec } from '../src/spec.js';

const specJson: StickerSpec = {
	concept: 'frog shipping on friday',
	subject: 'tiny frog',
	action: 'riding a rocket',
	mood: 'reckless joy',
	caption: 'SHIP IT',
};

async function transparentPng(): Promise<Buffer> {
	const inner = await sharp({
		create: { width: 300, height: 300, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
	})
		.png()
		.toBuffer();
	return sharp({
		create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
	})
		.composite([{ input: inner, top: 362, left: 362 }])
		.png()
		.toBuffer();
}

function fakeProvider(
	behavior: () => Promise<Buffer> = transparentPng,
): ImageProvider & { calls: number } {
	let calls = 0;
	return {
		model: 'fake-image-model',
		background: 'transparent',
		get calls() {
			return calls;
		},
		async generate() {
			calls++;
			return behavior();
		},
	};
}

async function captureStdout<T>(fn: () => Promise<T>): Promise<{ output: string; value: T }> {
	const chunks: string[] = [];
	const original = console.log;
	console.log = (...args: unknown[]) => chunks.push(args.join(' '));
	try {
		const value = await fn();
		return { output: chunks.join('\n'), value };
	} finally {
		console.log = original;
	}
}

let home: string;

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), 'stickr-gen-'));
	process.env.STICKR_HOME = home;
});

afterEach(() => {
	delete process.env.STICKR_HOME;
	rmSync(home, { recursive: true, force: true });
});

describe('generate', () => {
	it('creates original.png, 512x512 sticker.png, sticker.webp + metadata', async () => {
		const provider = fakeProvider();
		const record = await runGenerate({ spec: JSON.stringify(specJson), provider });

		expect(existsSync(record.files.originalPng)).toBe(true);
		expect(existsSync(record.files.stickerPng)).toBe(true);
		expect(existsSync(record.files.stickerWebp)).toBe(true);

		const meta = JSON.parse(readFileSync(join(record.dir, 'metadata.json'), 'utf8'));
		expect(meta.spec.caption).toBe('SHIP IT');
		expect(meta.model).toBe('fake-image-model');
		expect(meta.files).toBeUndefined();

		const pngMeta = await import('sharp').then((s) =>
			s.default(record.files.stickerPng).metadata(),
		);
		expect(pngMeta.width).toBe(512);
		expect(pngMeta.height).toBe(512);
	});

	it('rejects an invalid spec with guidance', async () => {
		await expect(
			runGenerate({ spec: JSON.stringify({ subject: 'only subject' }), provider: fakeProvider() }),
		).rejects.toThrow(/Invalid StickerSpec|concept/);
	});

	it('reports missing spec clearly', async () => {
		// Pretend stdin is a TTY so generate doesn't wait for piped input.
		const originalIsTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
		Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
		try {
			await expect(runGenerate({ spec: undefined, provider: fakeProvider() })).rejects.toThrow(
				/No StickerSpec provided/,
			);
		} finally {
			if (originalIsTTY) Object.defineProperty(process.stdin, 'isTTY', originalIsTTY);
			else Reflect.deleteProperty(process.stdin, 'isTTY');
		}
	});

	it('reports invalid JSON clearly', async () => {
		await expect(runGenerate({ spec: '{oops', provider: fakeProvider() })).rejects.toThrow(
			/valid StickerSpec JSON/,
		);
	});

	it('retries once on transparency failure, then succeeds', async () => {
		const opaque = await sharp({
			create: { width: 64, height: 64, channels: 3, background: '#445566' },
		})
			.png()
			.toBuffer();
		let call = 0;
		const provider = fakeProvider(() =>
			++call === 1 ? Promise.resolve(opaque) : transparentPng(),
		);
		const record = await runGenerate({ spec: JSON.stringify(specJson), provider });
		expect(provider.calls).toBe(2);
		expect(record.prompt).toBe(buildRetryPrompt(specJson));
		expect(record.prompt).toContain('CRITICAL:');
	});

	it('fails after one retry when both attempts are opaque — no infinite loops', async () => {
		const opaque = await sharp({
			create: { width: 64, height: 64, channels: 3, background: '#445566' },
		})
			.png()
			.toBuffer();
		const provider = fakeProvider(() => Promise.resolve(opaque));
		await expect(runGenerate({ spec: JSON.stringify(specJson), provider })).rejects.toThrow(
			/transparency validation/i,
		);
		expect(provider.calls).toBe(2);
	});

	it('wraps provider API errors as StickrError', async () => {
		const provider = fakeProvider(() =>
			Promise.reject(new Error('401 billing hard limit reached')),
		);
		await expect(runGenerate({ spec: JSON.stringify(specJson), provider })).rejects.toThrow(
			/Image generation failed/,
		);
	});

	it('draws a custom character named by the spec', async () => {
		addCharacter('hedgehog', 'a round brown hedgehog with soft spines');
		const record = await runGenerate({
			spec: JSON.stringify({ ...specJson, character: 'hedgehog' }),
			provider: fakeProvider(),
		});
		expect(record.spec.character).toBe('hedgehog');
		expect(record.prompt).toContain('Subject: a round brown hedgehog with soft spines');
	});

	it('applies the configured default character', async () => {
		saveConfig({ autoCopy: false, provider: 'openai', character: 'cat' });
		const record = await runGenerate({ spec: JSON.stringify(specJson), provider: fakeProvider() });
		expect(record.spec.character).toBe('cat');
		expect(record.prompt).toContain('orange tabby cat');
	});

	it('rejects an unknown character before calling the provider', async () => {
		const provider = fakeProvider();
		await expect(
			runGenerate({ spec: JSON.stringify({ ...specJson, character: 'dragon' }), provider }),
		).rejects.toThrow(/Unknown character "dragon"/);
		expect(provider.calls).toBe(0);
	});

	it('prints exactly one machine-readable record in JSON mode', async () => {
		const { output, value } = await captureStdout(() =>
			generateAndReport({
				spec: JSON.stringify(specJson),
				provider: fakeProvider(),
				json: true,
				autoCopy: false,
			}),
		);
		const printed = JSON.parse(output);
		expect(printed.id).toBe(value.id);
		expect(printed.files.stickerPng).toBe(value.files.stickerPng);
		expect(output).not.toContain('✓ Sticker created');
	});
});
