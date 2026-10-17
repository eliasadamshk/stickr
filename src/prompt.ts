import type { StickerSpec } from './spec.js';

/**
 * Prompt version — bump when house-style instructions change so metadata
 * can record which prompt produced a given sticker.
 */
export const PROMPT_VERSION = 3;

const HOUSE_STYLE = [
	'Create a premium die-cut messaging sticker.',
	'Single isolated subject centered in the frame.',
	'Cute modern illustrated style with a slightly Scandinavian feel: restrained palette, clean flat shapes, soft rounded forms.',
	'Simple expressive composition with a bold silhouette.',
	'Minimal visual clutter, minimal interior detail.',
	'Must remain clearly readable at small sizes.',
	'Thin white or cream die-cut border following the outline of the subject.',
].join('\n');

const TRANSPARENCY_RULES = [
	'Everything outside the sticker shape must be genuinely transparent.',
	'Do not paint a rectangular background.',
	'Do not create an environmental scene, ground plane, sky, or backdrop.',
	'Do not add a watermark, signature, or frame.',
].join('\n');

function captionBlock(caption: string | undefined): string {
	if (!caption) {
		return 'Caption: none. Do not render any text.';
	}
	return [
		`Caption: "${caption}"`,
		'Render the caption as short bold rounded lettering inside the sticker shape.',
		'Keep the caption under a quarter of the image area.',
	].join('\n');
}

/**
 * Build the image-model prompt from stable house style + StickerSpec.
 * Only StickerSpec content is used — never raw session material.
 */
export function buildPrompt(spec: StickerSpec): string {
	return [
		HOUSE_STYLE,
		'',
		`Concept: ${spec.concept}`,
		`Subject: ${spec.subject}`,
		`Action: ${spec.action}`,
		`Mood: ${spec.mood}`,
		captionBlock(spec.caption),
		'',
		TRANSPARENCY_RULES,
	].join('\n');
}

/**
 * Stronger transparency instructions used for the single retry when the
 * first attempt fails validation.
 */
export function buildRetryPrompt(spec: StickerSpec): string {
	return [
		buildPrompt(spec),
		'',
		'CRITICAL: The final image must have a fully transparent alpha channel outside the sticker.',
		'No background color of any kind — not white, not gray, not a subtle gradient.',
		'Only the die-cut sticker itself may contain pixels.',
	].join('\n');
}
