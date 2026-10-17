import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { stickrHome } from './config.js';
import { StickrError } from './errors.js';

export interface RunResult {
	stdout: string;
}
export type Runner = (cmd: string, args: string[], opts?: { input?: string }) => Promise<RunResult>;

const defaultRunner: Runner = (cmd, args, opts) =>
	new Promise((resolve, reject) => {
		const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
		let stdout = '';
		let stderr = '';
		child.stdout.on('data', (d) => {
			stdout += d;
		});
		child.stderr.on('data', (d) => {
			stderr += d;
		});
		child.on('error', reject);
		child.on('close', (code) =>
			code === 0 ? resolve({ stdout }) : reject(new Error(stderr || `${cmd} exited with ${code}`)),
		);
		child.stdin.end(opts?.input ?? '');
	});

/** Where an API key was stored — shown to users in setup output. */
export type StoreName = 'macOS Keychain' | 'Linux Secret Service' | 'Windows DPAPI-encrypted file';

interface CredentialStore {
	name: StoreName;
	read: () => Promise<string | null>;
	save: (key: string) => Promise<void>;
}

// Platform keystores

const KEYCHAIN_SERVICE = 'stickr';
const KEYCHAIN_ACCOUNT = 'openai-api-key';
const SECRET_TOOL_ATTRS = ['service', 'stickr', 'account', KEYCHAIN_ACCOUNT];

async function readMacOSKeychain(runner: Runner): Promise<string | null> {
	const { stdout } = await runner('security', [
		'find-generic-password',
		'-s',
		KEYCHAIN_SERVICE,
		'-a',
		KEYCHAIN_ACCOUNT,
		'-w',
	]);
	return stdout.trim() || null;
}

async function saveMacOSKeychain(key: string, runner: Runner): Promise<void> {
	// Keeping the secret out of argv prevents it from appearing in process listings.
	await runner(
		'security',
		['add-generic-password', '-s', KEYCHAIN_SERVICE, '-a', KEYCHAIN_ACCOUNT, '-U', '-w'],
		{ input: `${key}\n` },
	);
}

async function readSecretService(runner: Runner): Promise<string | null> {
	const { stdout } = await runner('secret-tool', ['lookup', ...SECRET_TOOL_ATTRS]);
	return stdout.trim() || null;
}

async function saveSecretService(key: string, runner: Runner): Promise<void> {
	await runner('secret-tool', ['store', '--label=stickr openai api key', ...SECRET_TOOL_ATTRS], {
		input: key,
	});
}

/** DPAPI-encrypted key file. Resolved dynamically so it follows STICKR_HOME. */
function winEncFile(): string {
	return join(stickrHome(), 'apikey.dpapi');
}

async function readWindowsDPAPI(runner: Runner): Promise<string | null> {
	const file = winEncFile();
	if (!existsSync(file)) return null;
	const script = `$ErrorActionPreference='Stop'; $enc = Get-Content -LiteralPath '${file.replace(/'/g, "''")}' -Raw; $sec = ConvertTo-SecureString $enc; $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec); try { [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringAuto($b)) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }`;
	const { stdout } = await runner('powershell.exe', [
		'-NoProfile',
		'-NonInteractive',
		'-Command',
		script,
	]);
	return stdout.trim() || null;
}

async function saveWindowsDPAPI(key: string, runner: Runner): Promise<void> {
	mkdirSync(stickrHome(), { recursive: true });
	const script = `$ErrorActionPreference='Stop'; $key = [Console]::In.ReadToEnd().Trim(); $sec = ConvertTo-SecureString $key -AsPlainText -Force; ConvertFrom-SecureString $sec | Set-Content -LiteralPath '${winEncFile().replace(/'/g, "''")}'`;
	await runner('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
		input: key,
	});
}

// Public API

function storeForPlatform(runner: Runner): CredentialStore | null {
	switch (process.platform) {
		case 'darwin':
			return {
				name: 'macOS Keychain',
				read: () => readMacOSKeychain(runner),
				save: (key) => saveMacOSKeychain(key, runner),
			};
		case 'linux':
			return {
				name: 'Linux Secret Service',
				read: () => readSecretService(runner),
				save: (key) => saveSecretService(key, runner),
			};
		case 'win32':
			return {
				name: 'Windows DPAPI-encrypted file',
				read: () => readWindowsDPAPI(runner),
				save: (key) => saveWindowsDPAPI(key, runner),
			};
		default:
			return null;
	}
}

/**
 * Read a previously stored API key (not the env var).
 * Keystore access errors are treated as an absent key so setup can explain
 * the environment-variable alternative.
 */
export async function readStoredKey(
	runner: Runner = defaultRunner,
): Promise<{ key: string; source: StoreName } | null> {
	const store = storeForPlatform(runner);
	if (!store) return null;
	try {
		const key = await store.read();
		return key ? { key, source: store.name } : null;
	} catch {
		return null;
	}
}

/**
 * Persist an API key in the platform credential store.
 * Returns where it was saved, or throws an actionable error.
 */
export async function saveStoredKey(
	apiKey: string,
	runner: Runner = defaultRunner,
): Promise<StoreName> {
	const store = storeForPlatform(runner);
	if (!store) {
		throw new StickrError(
			`Secure API key storage is not supported on ${process.platform}.\nSet OPENAI_API_KEY in your shell instead.`,
		);
	}
	try {
		await store.save(apiKey);
		return store.name;
	} catch (error) {
		throw new StickrError(
			`Could not store the API key in ${store.name}: ${error instanceof Error ? error.message : error}\nSet OPENAI_API_KEY in your shell instead.`,
			{ cause: error },
		);
	}
}

/**
 * Full resolution chain: OPENAI_API_KEY environment variable → stored key.
 * Returns null when nothing is configured.
 */
export async function resolveApiKey(
	runner: Runner = defaultRunner,
): Promise<{ key: string; source: 'environment' | StoreName } | null> {
	const env = process.env.OPENAI_API_KEY?.trim();
	if (env) return { key: env, source: 'environment' };
	const stored = await readStoredKey(runner);
	if (stored) return { key: stored.key, source: stored.source };
	return null;
}

export function looksLikeApiKey(value: string): boolean {
	return value.startsWith('sk-') && value.length >= 20;
}
