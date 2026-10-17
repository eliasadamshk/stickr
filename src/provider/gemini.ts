import { resolveApiKey } from '../credentials.js';
import { StickrError } from '../errors.js';
import { removeChromaKey } from '../images/chroma-key.js';
import type { ImageProvider } from './types.js';

export const GEMINI_IMAGE_MODEL = 'gemini-nano-banana-2.1';
const INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const TIMEOUT_MS = 120_000;

interface InteractionResponse {
	status?: string;
	steps?: Array<{ content?: Array<{ type?: string; data?: string }> }>;
	error?: { message?: string };
}

/**
 * Google Nano Banana provider. The Interactions API only returns JPEG, so the
 * model paints a flat magenta background that Stickr keys out into alpha.
 */
export class GeminiImageProvider implements ImageProvider {
	readonly model = GEMINI_IMAGE_MODEL;
	readonly background = 'chroma-key';

	constructor(
		private readonly apiKey: string,
		private readonly fetchImpl: typeof fetch = fetch,
	) {}

	async generate(prompt: string): Promise<Buffer> {
		let response: Response;
		try {
			response = await this.fetchImpl(INTERACTIONS_URL, {
				method: 'POST',
				headers: { 'x-goog-api-key': this.apiKey, 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: this.model,
					input: prompt,
					response_format: {
						type: 'image',
						mime_type: 'image/jpeg',
						aspect_ratio: '1:1',
						image_size: '1K',
					},
				}),
				signal: AbortSignal.timeout(TIMEOUT_MS),
			});
		} catch (error) {
			throw new StickrError(
				`Gemini image generation failed: ${error instanceof Error ? error.message : error}\n` +
					'Could not reach the Gemini API. Check your network connection and try again.',
				{ cause: error },
			);
		}

		const body = (await response.json().catch(() => ({}))) as InteractionResponse;
		if (!response.ok) {
			const message = body.error?.message?.trim() || `HTTP ${response.status}`;
			const hint = geminiErrorHint(response.status);
			throw new StickrError(`Gemini image generation failed: ${message}${hint ? `\n${hint}` : ''}`);
		}

		const image = (body.steps ?? [])
			.flatMap((step) => step.content ?? [])
			.find((block) => block.type === 'image' && block.data);
		if (!image?.data) {
			throw new StickrError(
				`Gemini returned no image data (status: ${body.status ?? 'unknown'}). Try again.`,
			);
		}
		return removeChromaKey(Buffer.from(image.data, 'base64'));
	}
}

function geminiErrorHint(status: number): string | null {
	if (status === 400 || status === 401 || status === 403) {
		return 'Check your Gemini API key: run "stickr setup --provider gemini" or set GEMINI_API_KEY.';
	}
	if (status === 402) {
		return 'Your Gemini prepay credits are used up. Add credits at https://ai.studio/projects.';
	}
	if (status === 429) {
		return 'Gemini rate limit reached. Wait a minute and try again.';
	}
	if (status >= 500) {
		return 'Gemini returned a server error. Try again shortly.';
	}
	return null;
}

export async function defaultGeminiProvider(): Promise<ImageProvider> {
	const resolved = await resolveApiKey(undefined, 'gemini');
	if (!resolved) {
		throw new StickrError(
			'No Gemini API key found.\n\n' +
				'Fix (any one of):\n' +
				'  1. Run "stickr setup --provider gemini" and paste your key to store it securely.\n' +
				'  2. Set GEMINI_API_KEY in your shell environment.\n\n' +
				'Get a key at https://aistudio.google.com/apikey',
		);
	}
	return new GeminiImageProvider(resolved.key);
}
