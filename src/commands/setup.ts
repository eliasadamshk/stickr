import { requireCharacter } from '../characters.js';
import { ensureConfig, loadConfig, saveConfig, stickrHome } from '../config.js';
import { KEY_ENV_VARS, readStoredKey } from '../credentials.js';
import { StickrError } from '../errors.js';
import { type AgentIntegration, allIntegrations } from '../integrations/agents.js';
import { promptForApiKey } from '../prompt-key.js';
import { PROVIDER_NAMES, type ProviderName } from '../provider/index.js';
import { selfTestImagePipeline } from '../selftest.js';

export interface SetupOptions {
	skip?: string[];
	force?: string[];
	dryRun?: boolean;
	/** Image provider to save as the default. */
	provider?: string;
	/** Default mascot to save; "none" clears it. */
	character?: string;
}

const CHECK = '✓';
const SKIP = '○';

function hasFlag(name: string, flags?: string[]): boolean {
	return flags?.some((f) => f.toLowerCase() === name.toLowerCase()) ?? false;
}

function validateAgentNames(names: string[] | undefined, option: string): void {
	const known = allIntegrations().map((integration) => integration.name);
	for (const name of names ?? []) {
		if (!known.some((candidate) => candidate.toLowerCase() === name.toLowerCase())) {
			throw new StickrError(
				`Unknown agent "${name}" for ${option}. Supported agents: ${known.join(', ')}.`,
			);
		}
	}
}

function parseChoice<T extends string>(value: string, allowed: readonly T[], option: string): T {
	const match = allowed.find((candidate) => candidate === value.toLowerCase());
	if (!match) {
		throw new StickrError(
			`Unknown value "${value}" for ${option}. Use one of: ${allowed.join(', ')}.`,
		);
	}
	return match;
}

function parseCharacterOption(value: string | undefined): string | undefined {
	if (value === undefined) return undefined;
	const name = value.toLowerCase();
	return name === 'none' ? name : requireCharacter(name).name;
}

export async function runSetup(options: SetupOptions = {}): Promise<void> {
	const provider =
		options.provider === undefined
			? undefined
			: parseChoice(options.provider, PROVIDER_NAMES, '--provider');
	const character = parseCharacterOption(options.character);
	validateAgentNames(options.skip, '--skip');
	validateAgentNames(options.force, '--force');
	const conflict = options.skip?.find((name) => hasFlag(name, options.force));
	if (conflict) {
		throw new StickrError(`Agent "${conflict}" cannot be both skipped and forced.`);
	}
	console.log('\nStickr setup\n');

	if (options.dryRun) {
		console.log(`${CHECK} Local storage (dry run)`);
	} else {
		ensureConfig();
		console.log(`${CHECK} Local storage at ${stickrHome()}`);
	}
	const config = loadConfig();
	const activeProvider: ProviderName = provider ?? config.provider;
	if (provider || character) {
		const next = { ...config, provider: activeProvider };
		if (character === 'none') delete next.character;
		else if (character) next.character = character;
		if (!options.dryRun) saveConfig(next);
		console.log(
			`${CHECK} Image provider: ${activeProvider}; character: ${next.character ?? 'chosen per sticker'}`,
		);
	}

	const readyIntegrations: AgentIntegration[] = [];
	let detectedAny = false;
	for (const integration of allIntegrations()) {
		if (hasFlag(integration.name, options.skip)) {
			console.log(`${SKIP} ${integration.name} skipped`);
			continue;
		}
		const detected = integration.detect() || hasFlag(integration.name, options.force);
		if (!detected) {
			console.log(`${SKIP} ${integration.name} not detected`);
			continue;
		}
		detectedAny = true;
		if (options.dryRun) {
			console.log(`${CHECK} Would install Stickr for ${integration.name}`);
			readyIntegrations.push(integration);
			continue;
		}
		try {
			const { backup } = integration.install();
			console.log(`${CHECK} Installed Stickr for ${integration.name}`);
			if (backup) console.log(`   Previous SKILL.md backed up to ${backup}`);
			readyIntegrations.push(integration);
		} catch (error) {
			throw new StickrError(
				`Could not install the Stickr skill for ${integration.name}: ` +
					`${error instanceof Error ? error.message : error}`,
				{ cause: error },
			);
		}
	}

	if (!detectedAny && readyIntegrations.length === 0) {
		console.log(
			`${SKIP} No supported coding agent detected.\n   Codex is detected via ~/.codex or ~/.agents/skills; Claude Code via ~/.claude.\n   Install one first, or run: stickr setup --force "Claude Code"`,
		);
	}

	await ensureApiKeyStep(options, activeProvider);

	if (options.dryRun) {
		console.log(`${SKIP} Self-test skipped (dry run)`);
	} else {
		try {
			await selfTestImagePipeline();
			console.log(`${CHECK} Image processing available`);
		} catch (error) {
			throw new StickrError(
				`Image processing self-test failed — sharp may be missing native binaries.\nError: ${error instanceof Error ? error.message : error}\nFix: reinstall dependencies with "pnpm install" or "npm install".`,
				{ cause: error },
			);
		}
	}

	console.log('\nReady.');
	if (readyIntegrations.length > 0) {
		console.log('\nInvoke Stickr:');
		for (const integration of readyIntegrations) {
			console.log(`  ${integration.name}: ${integration.invocation}`);
		}
	} else {
		console.log('\nRun setup again after installing Codex or Claude Code.');
	}
}

/**
 * API key step: environment wins; else a stored key (Keychain / Secret
 * Service / DPAPI); otherwise interactively collect one and store it.
 * Non-interactive runs only
 * print instructions — setup never fails over a missing key.
 */
async function ensureApiKeyStep(options: SetupOptions, provider: ProviderName): Promise<void> {
	const envVar = KEY_ENV_VARS[provider];
	const label = provider === 'gemini' ? 'Gemini' : 'OpenAI';
	const env = process.env[envVar]?.trim();
	if (env) {
		console.log(`${CHECK} ${envVar} found in environment`);
		return;
	}

	if (!options.dryRun) {
		const stored = await readStoredKey(undefined, provider);
		if (stored) {
			console.log(`${CHECK} ${label} API key found (${stored.source})`);
			return;
		}
	}

	if (options.dryRun) {
		console.log(`${SKIP} No ${label} API key configured yet`);
		return;
	}

	const savedTo = await promptForApiKey(provider);
	if (!savedTo) {
		const setupCommand = provider === 'gemini' ? 'stickr setup --provider gemini' : 'stickr setup';
		console.log(
			`${SKIP} No API key stored.\n   Fix (any one of):\n     ${setupCommand}   (paste your key when asked)\n     export ${envVar}="..."   (add to your shell profile)\n   Current resolution order: env → ${storeHint()}`,
		);
	}
}

function storeHint(): string {
	switch (process.platform) {
		case 'darwin':
			return 'macOS Keychain';
		case 'linux':
			return 'Linux Secret Service';
		case 'win32':
			return 'Windows DPAPI-encrypted file';
		default:
			return 'no supported OS credential store';
	}
}
