import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { CHARACTER_NAMES } from './characters.js';
import { StickrError } from './errors.js';

export const configSchema = z
	.object({
		autoCopy: z.boolean().default(true),
		provider: z.enum(['openai', 'gemini']).default('openai'),
		/** Default mascot for stickers whose spec does not name one. */
		character: z.enum(CHARACTER_NAMES).optional(),
	})
	.strict();

export type StickrConfig = z.infer<typeof configSchema>;

export const DEFAULT_CONFIG: StickrConfig = configSchema.parse({});

/**
 * Root directory for all Stickr data. Overridable for tests and sandboxed
 * environments via STICKR_HOME.
 */
export function stickrHome(): string {
	return process.env.STICKR_HOME || join(homedir(), '.stickr');
}

export function configPath(): string {
	return join(stickrHome(), 'config.json');
}

export function ensureHome(): string {
	const home = stickrHome();
	mkdirSync(join(home, 'stickers'), { recursive: true, mode: 0o700 });
	return home;
}

export function ensureConfig(): string {
	ensureHome();
	const path = configPath();
	if (!existsSync(path)) saveConfig(DEFAULT_CONFIG);
	return path;
}

/** Load config, falling back to defaults for missing keys. */
export function loadConfig(): StickrConfig {
	const path = configPath();
	if (!existsSync(path)) return DEFAULT_CONFIG;
	let raw: unknown;
	try {
		raw = JSON.parse(readFileSync(path, 'utf8'));
	} catch {
		throw new StickrError(
			`Config file is not valid JSON: ${path}\nFix or delete the file, then run "stickr setup" again.`,
		);
	}
	const parsed = configSchema.safeParse(raw);
	if (!parsed.success) {
		throw new StickrError(
			`Config file has invalid values: ${path}\nAllowed keys: autoCopy (boolean), provider ("openai" or "gemini"), character (${CHARACTER_NAMES.join(', ')}).\nFix or delete the file, then run "stickr setup" again.`,
		);
	}
	return parsed.data;
}

export function saveConfig(config: StickrConfig): void {
	ensureHome();
	writeFileSync(configPath(), `${JSON.stringify(config, null, 2)}\n`, {
		encoding: 'utf8',
		mode: 0o600,
	});
}
