import { z } from 'zod';

/** Reserved by "stickr setup --character none" to clear the default. */
const RESERVED_NAMES = new Set(['none']);

export const characterNameSchema = z
	.string()
	.regex(
		/^[a-z][a-z0-9-]{1,31}$/,
		'must be 2–32 lowercase letters, digits, or hyphens, starting with a letter',
	)
	.refine((name) => !RESERVED_NAMES.has(name), 'is reserved');
