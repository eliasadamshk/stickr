#!/usr/bin/env node
import { flagValue, parseArgs, splitList, validateArgs } from './args.js';
import { generateAndReport } from './commands/generate.js';
import { runInspect } from './commands/inspect.js';
import { runList } from './commands/list.js';
import { runSetup } from './commands/setup.js';
import { runCopy, runOpen, runReveal } from './commands/view.js';
import { StickrError } from './errors.js';

const HELP = `stickr: context-aware stickers from coding-agent conversations

Usage:
  stickr setup              Install the Stickr skill into detected coding agents
  stickr generate --spec '<json>'
                            Generate a sticker from a StickerSpec JSON
                            (or pipe JSON via stdin)
  stickr list               List recent stickers
  stickr open <id>          Open a sticker in the default image viewer
  stickr reveal <id>        Reveal the sticker file in Finder/file manager
  stickr copy <id>          Copy the sticker image to the clipboard
  stickr inspect <id>       Show sticker metadata, files, and prompt info

Setup options:
  --skip "<Name>"           Don't install for this agent (e.g. "Codex")
  --force "<Name>"          Install even if not detected
  --dry-run                 Show what would happen without writing

Generate options:
  --json                    Print the complete sticker record as JSON

Inspect options:
  --verbose                 Include the full image prompt

Learn more: run "/stickr" in Claude Code or mention "$stickr" in Codex.
`;

// A closed reader (e.g. `stickr inspect <id> | head`) is not an error.
process.stdout.on('error', (error: NodeJS.ErrnoException) => {
	if (error.code === 'EPIPE') process.exit(0);
	throw error;
});

async function main(): Promise<number> {
	const argv = process.argv.slice(2);
	if (argv[0] === '--version' || argv[0] === '-v') {
		const { createRequire } = await import('node:module');
		console.log(createRequire(import.meta.url)('../package.json').version);
		return 0;
	}

	const { command, positional, flags } = parseArgs(argv);
	// Only a parsed flag counts, so an option value such as --spec '-h' is not mistaken for help.
	if (argv[0] === '-h' || flags.get('help') === true) {
		console.log(HELP);
		return 0;
	}

	switch (command) {
		case 'setup': {
			validateArgs(command, positional, flags, ['skip', 'force', 'dry-run'], 0);
			const skip = flagValue(flags, 'skip');
			const force = flagValue(flags, 'force');
			await runSetup({
				skip: skip ? splitList(skip) : undefined,
				force: force ? splitList(force) : undefined,
				dryRun: flags.has('dry-run'),
			});
			return 0;
		}
		case 'generate': {
			validateArgs(command, positional, flags, ['spec', 'json'], 0);
			const spec = flagValue(flags, 'spec');
			await generateAndReport({ spec, json: flags.has('json') });
			return 0;
		}
		case 'list':
			validateArgs(command, positional, flags, [], 0);
			runList();
			return 0;
		case 'open':
			validateArgs(command, positional, flags, [], 1);
			await runOpen(positional[0]);
			return 0;
		case 'reveal':
			validateArgs(command, positional, flags, [], 1);
			await runReveal(positional[0]);
			return 0;
		case 'copy':
			validateArgs(command, positional, flags, [], 1);
			await runCopy(positional[0]);
			return 0;
		case 'inspect':
			validateArgs(command, positional, flags, ['verbose'], 1);
			await runInspect(positional[0] ?? '', flags.has('verbose'));
			return 0;
		default:
			if (argv.length === 0) {
				console.log(HELP);
				return 0;
			}
			console.error(HELP);
			return 1;
	}
}

main()
	.then((code) => {
		process.exitCode = code;
	})
	.catch((error) => {
		if (error instanceof StickrError) {
			console.error(`Error: ${error.message}`);
			if (process.env.STICKR_DEBUG === '1' && error.cause) {
				console.error(error.cause);
			}
			process.exitCode = error.exitCode;
			return;
		}
		console.error(`Unexpected error: ${error instanceof Error ? error.message : error}`);
		if (process.env.STICKR_DEBUG === '1' && error instanceof Error) {
			console.error(error.stack);
		} else {
			console.error('Run with STICKR_DEBUG=1 for details.');
		}
		process.exitCode = 1;
	});
