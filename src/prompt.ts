import { CHARACTER_STYLE, type Character } from './characters.js';
import type { StickerSpec } from './spec.js';

/**
 * How the model should handle the background: native alpha, or a flat key
 * color that Stickr removes afterwards (for models without alpha output).
 */
export type BackgroundMode = 'transparent' | 'chroma-key';

/**
 * Prompt version — bump when house-style instructions change so metadata
 * can record which prompt produced a given sticker.
 */
export const PROMPT_VERSION = 4;

const HOUSE_STYLE = [
	'Create a premium die-cut messaging sticker.',
	'Single isolated subject centered in the frame.',
	'Cute modern illustrated style with a slightly Scandinavian feel: restrained palette, clean flat shapes, soft rounded forms.',
	'Simple expressive composition with a bold silhouette.',
	'Minimal visual clutter, minimal interior detail.',
	'Must remain clearly readable at small sizes.',
	'Thin die-cut border following the outline of the subject, always the same warm cream color (#F3EAD6), never pure white.',
].join('\n');

const TRANSPARENCY_RULES = [
	'Everything outside the sticker shape must be genuinely transparent.',
	'Do not paint a rectangular background.',
	'Do not create an environmental scene, ground plane, sky, or backdrop.',
	'Do not add a watermark, signature, or frame.',
].join('\n');

const CHROMA_KEY_RULES = [
	'Place the sticker on a perfectly flat, solid pure magenta (#FF00FF) background that fills the whole frame.',
	'No gradients, shadows, texture, or vignette in the background.',
	'Never use magenta or hot pink inside the sticker.',
	'Do not create an environmental scene, ground plane, sky, or backdrop.',
	'Do not add a watermark, signature, or frame.',
].join('\n');

function captionBlock(caption: string | undefined): string {
	if (!caption) {
		return 'Caption: none. Do not render any text.';
	}
	return [
		`Caption: "${caption}"`,
		'Caption lettering must use the same style on every sticker: chunky rounded sans-serif capitals with a solid dark navy fill, even letter widths, no outline, no shadow, no 3D effect, and no other colors.',
		'Set the caption on one straight horizontal line (two centered lines only if it does not fit), centered below the subject, inside the sticker shape.',
		'Keep the caption under a quarter of the image area.',
	].join('\n');
}

export interface PromptOptions {
	background?: BackgroundMode;
	/** The resolved mascot named by the spec, if any. */
	character?: Character;
}

function subjectBlock(spec: StickerSpec, character: Character | undefined): string[] {
	if (!character) return [`Subject: ${spec.subject}`];
	return [
		`Subject: ${character.description}`,
		CHARACTER_STYLE,
		'If the concept mentions a different animal or character, draw this character instead.',
	];
}

/**
 * Build the image-model prompt from stable house style + StickerSpec.
 * Only StickerSpec content is used — never raw session material.
 */
export function buildPrompt(
	spec: StickerSpec,
	{ background = 'transparent', character }: PromptOptions = {},
): string {
	return [
		HOUSE_STYLE,
		'',
		`Concept: ${spec.concept}`,
		...subjectBlock(spec, character),
		`Action: ${spec.action}`,
		`Mood: ${spec.mood}`,
		captionBlock(spec.caption),
		'',
		background === 'chroma-key' ? CHROMA_KEY_RULES : TRANSPARENCY_RULES,
	].join('\n');
}

/**
 * Stronger transparency instructions used for the single retry when the
 * first attempt fails validation.
 */
export function buildRetryPrompt(spec: StickerSpec, options: PromptOptions = {}): string {
	if (options.background === 'chroma-key') {
		return [
			buildPrompt(spec, options),
			'',
			'CRITICAL: Every pixel outside the die-cut border must be the exact same flat magenta (#FF00FF).',
			'The cream (#F3EAD6) border must fully enclose the subject with no gaps.',
		].join('\n');
	}
	return [
		buildPrompt(spec, options),
		'',
		'CRITICAL: The final image must have a fully transparent alpha channel outside the sticker.',
		'No background color of any kind — not white, not gray, not a subtle gradient.',
		'Only the die-cut sticker itself may contain pixels.',
	].join('\n');
}
