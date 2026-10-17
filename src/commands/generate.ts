import { copyImageToClipboard } from '../clipboard.js';
import { configPath, loadConfig } from '../config.js';
import { StickrError } from '../errors.js';
import { newStickerId } from '../ids.js';
import { processSticker } from '../images/process.js';
import { validateTransparency } from '../images/validate.js';
import { buildPrompt, buildRetryPrompt, PROMPT_VERSION } from '../prompt.js';
import { createProvider, PROVIDER_NAMES, type ProviderName } from '../provider/index.js';
import type { ImageProvider } from '../provider/types.js';
import { parseStickerSpec, type StickerSpec } from '../spec.js';
import { type StickerRecord, writeSticker } from '../store.js';

const MAX_ATTEMPTS = 2;

async function readSpecInput(specFlag?: string): Promise<StickerSpec> {
	let raw: string | undefined = specFlag;
	if (!raw && !process.stdin.isTTY) {
		raw = await new Promise<string>((resolve, reject) => {
			let data = '';
			process.stdin.setEncoding('utf8');
			process.stdin.on('data', (chunk) => {
				data += chunk;
			});
			process.stdin.on('end', () => resolve(data));
			process.stdin.on('error', reject);
		});
		raw = raw.trim() || undefined;
	}
	if (!raw) {
		throw new StickrError(
			'No StickerSpec provided.\n\nUsage:\n' +
				`  stickr generate --spec '{"concept":"...","subject":"...","action":"...","mood":"..."}'\n` +
				"  echo '<json>' | stickr generate",
		);
	}
	let parsedJson: unknown;
	try {
		parsedJson = JSON.parse(raw);
	} catch (error) {
		throw new StickrError(
			`--spec must be valid StickerSpec JSON.\nParse error: ${error instanceof Error ? error.message : error}`,
			{ cause: error },
		);
	}
	return parseStickerSpec(parsedJson);
}

function parseProviderName(value: string): ProviderName {
	const name = PROVIDER_NAMES.find((candidate) => candidate === value.toLowerCase());
	if (!name) {
		throw new StickrError(
			`Unknown provider "${value}". Supported providers: ${PROVIDER_NAMES.join(', ')}.`,
		);
	}
	return name;
}

export async function runGenerate(options: {
	spec?: string;
	provider?: ImageProvider;
	providerName?: string;
}): Promise<StickerRecord> {
	const config = loadConfig();
	const spec = await readSpecInput(options.spec);
	const provider =
		options.provider ??
		(await createProvider(parseProviderName(options.providerName ?? config.provider)));

	let original: Buffer | null = null;
	let usedPrompt = '';
	let lastError = '';
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		const prompt =
			attempt === 1
				? buildPrompt(spec, provider.background)
				: buildRetryPrompt(spec, provider.background);
		let image: Buffer;
		try {
			image = await provider.generate(prompt);
		} catch (error) {
			if (error instanceof StickrError) throw error;
			throw new StickrError(
				`Image generation failed: ${error instanceof Error ? error.message : error}`,
				{ cause: error },
			);
		}
		const report = await validateTransparency(image);
		if (report.ok) {
			original = image;
			usedPrompt = prompt;
			break;
		}
		lastError = report.reason;
	}

	if (!original) {
		throw new StickrError(
			`Generated image failed transparency validation after ${MAX_ATTEMPTS} attempts: ${lastError}\nThe image model returned an opaque or invalid image. Try again.`,
		);
	}

	let processed: { png: Buffer; webp: Buffer };
	try {
		processed = await processSticker(original);
	} catch (error) {
		throw new StickrError(
			`Could not process generated image: ${error instanceof Error ? error.message : error}`,
			{ cause: error },
		);
	}

	const record = writeSticker({
		makeId: newStickerId,
		spec,
		model: provider.model,
		promptVersion: PROMPT_VERSION,
		prompt: usedPrompt,
		original,
		png: processed.png,
		webp: processed.webp,
	});

	return record;
}

export async function generateAndReport(options: {
	spec?: string;
	provider?: ImageProvider;
	providerName?: string;
	json?: boolean;
	autoCopy?: boolean;
}): Promise<StickerRecord> {
	const config = loadConfig();
	// stderr keeps --json output on stdout machine-readable.
	console.error('Generating sticker (this can take a minute)...');
	const record = await runGenerate(options);
	const copyEnabled = options.autoCopy ?? config.autoCopy;

	let clipboardNote: string | null = null;
	if (copyEnabled) {
		try {
			clipboardNote = await copyImageToClipboard(record.files.stickerPng);
		} catch (error) {
			// Clipboard failures do not invalidate a generated sticker.
			clipboardNote = error instanceof Error ? `Clipboard unavailable: ${error.message}` : null;
		}
	}

	if (options.json) {
		console.log(JSON.stringify(record, null, 2));
		return record;
	}

	const caption = record.spec.caption ? `\n"${record.spec.caption}"\n` : '';
	console.log(`✓ Sticker created (${record.id})${caption}`);
	console.log(`PNG:  ${record.files.stickerPng}`);
	console.log(`WebP: ${record.files.stickerWebp}`);
	if (copyEnabled) {
		console.log(clipboardNote ?? 'Not copied to clipboard.');
	} else {
		console.log(`Auto-copy is disabled (autoCopy in ${configPath()}).`);
	}
	return record;
}
