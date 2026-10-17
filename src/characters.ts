/**
 * Recurring Stickr mascots. Each description shares the otter's look so the
 * cast reads as one sticker family.
 */
export const CHARACTERS = {
	otter:
		'a chubby brown sea otter with a cream face and belly, small round ears, a dark button nose, and whiskers',
	raccoon:
		'a chubby gray raccoon with a dark eye mask, a cream muzzle and belly, small round ears, and a ringed tail',
	cat: 'a chubby orange tabby cat with soft stripes, a cream muzzle and belly, and small rounded ears',
	flamingo:
		'a soft-pink flamingo with a plump round body, a long curved S-shaped neck, a curved dark-tipped beak, and two thin legs',
	spider:
		'a round dark-navy spider with a soft fuzzy body, small kind eyes, and short rounded legs',
} as const;

export type CharacterName = keyof typeof CHARACTERS;
export const CHARACTER_NAMES = Object.keys(CHARACTERS) as [CharacterName, ...CharacterName[]];

export const CHARACTER_STYLE =
	'Draw the character in the Stickr mascot style: chunky rounded proportions, happy closed eyes or small dark eyes, rosy cheeks, a soft muted earthy palette, and dark navy outlines.';
