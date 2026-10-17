import readline from 'node:readline/promises';
import { type Readable, Writable } from 'node:stream';
import { KEY_ENV_VARS, type KeyProvider, looksLikeApiKey, saveStoredKey } from './credentials.js';
import { StickrError } from './errors.js';

const PROVIDER_LABELS: Record<KeyProvider, string> = { openai: 'OpenAI', gemini: 'Gemini' };

/** Gemini key formats vary, so only reject values that cannot be a key. */
function looksLikeKey(provider: KeyProvider, value: string): boolean {
	return provider === 'openai' ? looksLikeApiKey(value) : value.length >= 20 && !/\s/.test(value);
}

/**
 * Interactively ask for a provider API key with muted (hidden) input and
 * persist it via the most secure store available on this platform.
 * Returns the store name, or null when the user skips or storage fails.
 */
export async function promptForApiKey(provider: KeyProvider = 'openai'): Promise<string | null> {
	if (!process.stdin.isTTY || !process.stdout.isTTY) {
		return null;
	}
	const label = PROVIDER_LABELS[provider];

	process.stdout.write(
		`No ${label} API key found.\n` +
			'Paste your key now (input hidden) to store it securely, or press Enter\n' +
			'to skip and configure it later.\n',
	);

	for (;;) {
		const key = await askHidden('API key: ');
		if (!key) {
			console.log(
				`Skipped. Set ${KEY_ENV_VARS[provider]} in your shell before generating stickers.\n`,
			);
			return null;
		}
		if (!looksLikeKey(provider, key)) {
			console.log(
				provider === 'openai'
					? 'That doesn\'t look like an OpenAI API key (expected to start with "sk-"). Try again or press Enter to skip.'
					: "That doesn't look like a Gemini API key. Try again or press Enter to skip.",
			);
			continue;
		}

		try {
			const store = await saveStoredKey(key, undefined, provider);
			console.log(`✓ API key saved to ${store}.\n`);
			return store;
		} catch (error) {
			console.log(`${error instanceof Error ? error.message : error}\n`);
			return null;
		}
	}
}

export function askHidden(
	promptText: string,
	input: Readable = process.stdin,
	output: Writable = process.stdout,
): Promise<string> {
	return new Promise((resolve, reject) => {
		const muted = new Writable({
			write(_chunk, _encoding, callback) {
				callback();
			},
		});
		const rl = readline.createInterface({
			input,
			output: muted,
			terminal: true,
		});
		output.write(promptText);
		rl.question('')
			.then((answer) => {
				rl.close();
				output.write('\n');
				resolve(answer.trim());
			})
			.catch((error) => {
				rl.close();
				reject(
					new StickrError(
						`Could not read input: ${error instanceof Error ? error.message : error}`,
						{ cause: error },
					),
				);
			});
	});
}
