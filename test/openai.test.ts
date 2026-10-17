import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const openaiMocks = vi.hoisted(() => ({
	construct: vi.fn(),
	generate: vi.fn(),
}));

vi.mock('openai', () => ({
	default: class FakeOpenAI {
		readonly images = { generate: openaiMocks.generate };

		constructor(options: unknown) {
			openaiMocks.construct(options);
		}
	},
}));

import * as credentials from '../src/credentials.js';
import {
	defaultProvider,
	OPENAI_IMAGE_MODEL,
	OpenAIImageProvider,
} from '../src/provider/openai.js';

beforeEach(() => {
	openaiMocks.construct.mockReset();
	openaiMocks.generate.mockReset();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('OpenAI image provider', () => {
	it('requests the promised transparent PNG and decodes its image bytes', async () => {
		const expected = Buffer.from('generated image bytes');
		openaiMocks.generate.mockResolvedValue({
			data: [{ b64_json: expected.toString('base64') }],
		});

		const provider = new OpenAIImageProvider('sk-test-secret');
		const result = await provider.generate('draw a tiny frog');

		expect(openaiMocks.construct).toHaveBeenCalledWith({
			apiKey: 'sk-test-secret',
			timeout: 120_000,
			maxRetries: 2,
		});
		expect(openaiMocks.generate).toHaveBeenCalledWith({
			model: OPENAI_IMAGE_MODEL,
			prompt: 'draw a tiny frog',
			n: 1,
			size: '1024x1024',
			quality: 'high',
			background: 'transparent',
			output_format: 'png',
		});
		expect(result).toEqual(expected);
	});

	it('turns API failures into user-facing Stickr errors', async () => {
		const cause = new Error('401 billing hard limit reached');
		openaiMocks.generate.mockRejectedValue(cause);

		await expect(
			new OpenAIImageProvider('sk-test-secret').generate('prompt'),
		).rejects.toMatchObject({
			name: 'StickrError',
			message: expect.stringContaining('401 billing hard limit reached'),
			cause,
		});
	});

	it('adds an actionable hint for a rejected API key', async () => {
		const cause = Object.assign(new Error('401 Incorrect API key provided'), { status: 401 });
		openaiMocks.generate.mockRejectedValue(cause);

		await expect(new OpenAIImageProvider('sk-test-secret').generate('prompt')).rejects.toThrow(
			/401 Incorrect API key.*stickr setup/s,
		);
	});

	it('rejects a successful API response that contains no image data', async () => {
		openaiMocks.generate.mockResolvedValue({ data: [] });
		await expect(new OpenAIImageProvider('sk-test-secret').generate('prompt')).rejects.toThrow(
			/no image data.*gpt-image-2\.5-flare/is,
		);
	});
});

describe('default provider', () => {
	it('uses the resolved key without exposing it elsewhere', async () => {
		vi.spyOn(credentials, 'resolveApiKey').mockResolvedValue({
			key: 'sk-resolved-secret',
			source: 'environment',
		});

		const provider = await defaultProvider();
		expect(provider.model).toBe(OPENAI_IMAGE_MODEL);
		expect(openaiMocks.construct).toHaveBeenCalledWith(
			expect.objectContaining({ apiKey: 'sk-resolved-secret' }),
		);
	});

	it('gives setup guidance when no key can be resolved', async () => {
		vi.spyOn(credentials, 'resolveApiKey').mockResolvedValue(null);
		await expect(defaultProvider()).rejects.toThrow(/API key.*stickr setup/is);
	});
});
