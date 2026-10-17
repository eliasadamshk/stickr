import { describe, expect, it } from 'vitest';
import { buildPrompt, buildRetryPrompt } from '../src/prompt.js';
import { parseStickerSpec } from '../src/spec.js';

const validSpec = {
	concept: 'capybara sweeping code into a bin',
	subject: 'cute capybara',
	action: 'sweeping old code into a wastebasket',
	mood: 'calmly satisfied',
	caption: '1,200 LINES FREED',
	contextSummary: 'Large legacy cleanup',
};

describe('StickerSpec validation', () => {
	it('accepts a full spec', () => {
		const spec = parseStickerSpec(validSpec);
		expect(spec.subject).toBe('cute capybara');
		expect(spec.caption).toBe('1,200 LINES FREED');
	});

	it('accepts a spec without optional fields', () => {
		const spec = parseStickerSpec({
			concept: 'robot celebrating',
			subject: 'tiny robot',
			action: 'jumping with joy',
			mood: 'triumphant',
		});
		expect(spec.caption).toBeUndefined();
	});

	it('rejects missing required fields', () => {
		expect(() => parseStickerSpec({ concept: 'x' })).toThrow(/Invalid StickerSpec/);
	});

	it('rejects non-object input', () => {
		expect(() => parseStickerSpec('nope')).toThrow();
	});

	it('rejects multi-line captions', () => {
		expect(() => parseStickerSpec({ ...validSpec, caption: 'two\nlines' })).toThrow(/single line/);
	});

	it('normalizes whitespace and rejects malformed agent output', () => {
		expect(parseStickerSpec({ ...validSpec, subject: '  cute capybara  ' }).subject).toBe(
			'cute capybara',
		);
		expect(() => parseStickerSpec({ ...validSpec, mood: 'calm\nbut proud' })).toThrow(
			/single line/,
		);
		expect(() =>
			parseStickerSpec({ ...validSpec, caption: 'too many words for sticker text' }),
		).toThrow(/at most 4 words/);
		expect(() => parseStickerSpec({ ...validSpec, caption: 'Ship It' })).toThrow(/uppercase/);
		expect(() => parseStickerSpec({ ...validSpec, typo: true })).toThrow(/Unrecognized key/);
	});
});

describe('prompt generation', () => {
	it('includes house style and all spec fields', () => {
		const prompt = buildPrompt(parseStickerSpec(validSpec));
		expect(prompt).toContain('die-cut messaging sticker');
		expect(prompt).toContain('capybara sweeping code into a bin');
		expect(prompt).toContain('cute capybara');
		expect(prompt).toContain('sweeping old code into a wastebasket');
		expect(prompt).toContain('calmly satisfied');
		expect(prompt).toContain('"1,200 LINES FREED"');
		expect(prompt).toContain('transparent');
	});

	it('tells the model not to render text when no caption', () => {
		const spec = parseStickerSpec({ ...validSpec, caption: undefined });
		const prompt = buildPrompt(spec);
		expect(prompt).toContain('Do not render any text');
	});

	it('retry prompt adds an explicit transparency correction', () => {
		const spec = parseStickerSpec(validSpec);
		const retry = buildRetryPrompt(spec);
		expect(retry).toContain(buildPrompt(spec));
		expect(retry).toContain('CRITICAL');
		expect(retry).toContain('fully transparent alpha channel');
	});

	it('never embeds contextSummary in the image prompt', () => {
		const prompt = buildPrompt(parseStickerSpec(validSpec));
		expect(prompt).not.toContain('Large legacy cleanup');
	});
});
