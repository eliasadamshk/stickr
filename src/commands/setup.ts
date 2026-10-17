import { ensureConfig, stickrHome } from '../config.js';
import { readStoredKey } from '../credentials.js';
import { StickrError } from '../errors.js';
import { type AgentIntegration, allIntegrations } from '../integrations/agents.js';
import { promptForApiKey } from '../prompt-key.js';
import { selfTestImagePipeline } from '../selftest.js';

export interface SetupOptions {
	skip?: string[];
	force?: string[];
	dryRun?: boolean;
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

export async function runSetup(options: SetupOptions = {}): Promise<void> {
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

	await ensureApiKeyStep(options);

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
async function ensureApiKeyStep(options: SetupOptions): Promise<void> {
	const env = process.env.OPENAI_API_KEY?.trim();
	if (env) {
		console.log(`${CHECK} OPENAI_API_KEY found in environment`);
		return;
	}

	if (!options.dryRun) {
		const stored = await readStoredKey();
		if (stored) {
			console.log(`${CHECK} OpenAI API key found (${stored.source})`);
			return;
		}
	}

	if (options.dryRun) {
		console.log(`${SKIP} No OpenAI API key configured yet`);
		return;
	}

	const savedTo = await promptForApiKey();
	if (!savedTo) {
		console.log(
			`${SKIP} No API key stored.\n   Fix (any one of):\n     stickr setup            (paste your key when asked)\n     export OPENAI_API_KEY="sk-..."   (add to your shell profile)\n   Current resolution order: env → ${storeHint()}`,
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
