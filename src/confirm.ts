import readline from 'node:readline/promises';
import type { Readable, Writable } from 'node:stream';

/** Ask a yes/no question; anything but "y" or "yes" counts as no. */
export async function confirm(
	question: string,
	input: Readable = process.stdin,
	output: Writable = process.stdout,
): Promise<boolean> {
	const rl = readline.createInterface({ input, output });
	try {
		const answer = await rl.question(`${question} [y/N] `);
		return ['y', 'yes'].includes(answer.trim().toLowerCase());
	} finally {
		rl.close();
	}
}
