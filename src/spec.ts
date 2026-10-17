import { z } from 'zod';
import { StickrError } from './errors.js';

const singleLine = (max: number) =>
	z
		.string()
		.trim()
		.min(1)
		.max(max)
		.regex(/^[^\r\n]*$/, 'must be a single line');

/**
 * StickerSpec — the compact, validated description of what to draw.
 *
 * This is the ONLY thing that travels from the coding conversation to the
 * image API. Source code, diffs, and terminal output must never be placed
 * in these fields.
 */
export const stickerSpecSchema = z
	.object({
		concept: singleLine(300).min(3),
		subject: singleLine(120).min(2),
		action: singleLine(200).min(2),
		mood: singleLine(120).min(2),
		/** Optional very short caption rendered inside the sticker (0–4 words). */
		caption: singleLine(40)
			.refine((value) => value.split(/\s+/).length <= 4, 'must contain at most 4 words')
			.refine((value) => value === value.toUpperCase(), 'must be uppercase')
			.optional(),
		/** Short semantic summary of the session context (for metadata only; never sent to the image model). */
		contextSummary: singleLine(500).optional(),
	})
	.strict();

export type StickerSpec = z.infer<typeof stickerSpecSchema>;

export function parseStickerSpec(input: unknown): StickerSpec {
	const result = stickerSpecSchema.safeParse(input);
	if (!result.success) {
		const issues = result.error.issues
			.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
			.join('\n');
		throw new StickrError(
			`Invalid StickerSpec:\n${issues}\n\nExpected JSON like:\n{"concept":"...","subject":"...","action":"...","mood":"...","caption":"SHIP IT","contextSummary":"..."}`,
		);
	}
	return result.data;
}
