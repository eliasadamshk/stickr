import { StickrError } from './errors.js';

export interface ParsedArgs {
	command?: string;
	positional: string[];
	flags: Map<string, string | boolean>;
}

const BOOLEAN_FLAGS = new Set(['dry-run', 'help', 'json', 'verbose']);

export function parseArgs(argv: string[]): ParsedArgs {
	const command = argv[0] && !argv[0].startsWith('-') ? argv[0] : undefined;
	const rest = command ? argv.slice(1) : argv;
	const positional: string[] = [];
	const flags = new Map<string, string | boolean>();

	for (let i = 0; i < rest.length; i++) {
		const arg = rest[i];
		if (arg.startsWith('--')) {
			const equals = arg.indexOf('=');
			if (equals !== -1) {
				flags.set(arg.slice(2, equals), arg.slice(equals + 1));
				continue;
			}
			const key = arg.slice(2);
			if (BOOLEAN_FLAGS.has(key)) {
				flags.set(key, true);
				continue;
			}
			const next = rest[i + 1];
			if (next !== undefined && !next.startsWith('--')) {
				flags.set(key, next);
				i++;
			} else {
				flags.set(key, true);
			}
		} else {
			positional.push(arg);
		}
	}
	return { command, positional, flags };
}

/** Get the first present flag as a string value (empty when boolean). */
export function flagValue(flags: Map<string, string | boolean>, name: string): string | undefined {
	const value = flags.get(name);
	if (typeof value === 'string') return value;
	if (value === true) return '';
	return undefined;
}

/** Split a comma-separated option value, preserving spaces in agent names. */
export function splitList(value: string): string[] {
	return value
		.split(',')
		.map((token) => token.trim().replace(/^["']|["']$/g, ''))
		.filter(Boolean);
}

export function validateArgs(
	command: string,
	positional: string[],
	flags: Map<string, string | boolean>,
	allowedFlags: string[],
	maxPositionals: number,
): void {
	if (positional.length > maxPositionals) {
		throw new StickrError(`Too many arguments for "stickr ${command}". Run "stickr --help".`);
	}
	for (const [name, value] of flags) {
		if (!allowedFlags.includes(name)) {
			throw new StickrError(`Unknown option "--${name}" for "stickr ${command}".`);
		}
		const expectsValue = ['spec', 'skip', 'force', 'provider', 'character'].includes(name);
		if (expectsValue && (typeof value !== 'string' || value.length === 0)) {
			throw new StickrError(`Option "--${name}" requires a value.`);
		}
		if (!expectsValue && value !== true) {
			throw new StickrError(`Option "--${name}" does not take a value.`);
		}
	}
}
