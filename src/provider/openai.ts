import OpenAI from 'openai';
import { resolveApiKey } from '../credentials.js';
import { StickrError } from '../errors.js';
import type { ImageProvider } from './types.js';

export const OPENAI_IMAGE_MODEL = 'gpt-image-2.5-flare';

export type { ImageProvider };

/**
 * OpenAI image provider using GPT Image 2.5 Flare with a transparent PNG output.
 * The prompt is fully constructed upstream; this layer only renders it.
 */
export class OpenAIImageProvider implements ImageProvider {
	readonly model = OPENAI_IMAGE_MODEL;
	readonly background = 'transparent';
	private client: OpenAI;

	constructor(apiKey: string) {
		// SDK defaults (10 min timeout) would leave an agent-invoked CLI hanging silently.
		this.client = new OpenAI({ apiKey, timeout: 120_000, maxRetries: 2 });
	}

	async generate(prompt: string): Promise<Buffer> {
		let response: OpenAI.Images.ImagesResponse;
		try {
			response = await this.client.images.generate({
				model: this.model,
				prompt,
				n: 1,
				size: '1024x1024',
				quality: 'high',
				background: 'transparent',
				output_format: 'png',
			});
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'unknown error contacting the OpenAI API';
			const hint = apiErrorHint(error, this.model);
			throw new StickrError(
				`OpenAI image generation failed: ${message}${hint ? `\n${hint}` : ''}`,
				{ cause: error },
			);
		}

		const b64 = response.data?.[0]?.b64_json;
		if (!b64) {
			throw new StickrError(
				`OpenAI returned no image data. Check your API key access to ${this.model} and try again.`,
			);
		}
		return Buffer.from(b64, 'base64');
	}
}

/** Actionable next step for common OpenAI SDK failures (duck-typed on APIError fields). */
function apiErrorHint(error: unknown, model: string): string | null {
	if (!(error instanceof Error) || !('status' in error)) return null;
	const { status } = error as { status?: unknown };
	const code = (error as { code?: unknown }).code;
	if (status === 401) {
		return 'Your OpenAI API key was rejected. Run "stickr setup" to store a new key, or fix OPENAI_API_KEY.';
	}
	if (status === 403) {
		return `Your API key cannot use ${model}. OpenAI may require API Organization Verification for GPT Image models.`;
	}
	if (status === 429) {
		return 'OpenAI rate limit or quota reached. Wait a minute and try again, or check your billing.';
	}
	if (status === 400 && code === 'moderation_blocked') {
		return "OpenAI's safety system rejected this sticker concept. Try a different concept.";
	}
	if (typeof status === 'number' && status >= 500) {
		return 'OpenAI returned a server error. Try again shortly.';
	}
	if (status === undefined) {
		return 'Could not reach the OpenAI API. Check your network connection and try again.';
	}
	return null;
}

export async function defaultProvider(): Promise<ImageProvider> {
	const resolved = await resolveApiKey();
	if (!resolved) {
		throw new StickrError(
			'No OpenAI API key found.\n\n' +
				'Fix (any one of):\n' +
				'  1. Run "stickr setup" and paste your key to store it securely.\n' +
				'  2. Set OPENAI_API_KEY in your shell environment.\n\n' +
				'Get a key at https://platform.openai.com/api-keys',
		);
	}
	return new OpenAIImageProvider(resolved.key);
}
