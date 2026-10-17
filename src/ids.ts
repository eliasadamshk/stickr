import { randomInt } from 'node:crypto';

const ALPHABET = 'abcdefghjkmnpqrstvwxyz23456789'; // unambiguous, lowercase

/** Short human-typeable sticker id, e.g. "k7mq3x". */
export function newStickerId(): string {
	let id = '';
	for (let i = 0; i < 6; i++) {
		id += ALPHABET[randomInt(ALPHABET.length)];
	}
	return id;
}
