#!/usr/bin/env node
import { flagValue, parseArgs, splitList, validateArgs } from './args.js';
import { runCharacterAction, runListCharacters } from './commands/characters.js';
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
  stickr characters         List the mascots available to stickers
  stickr characters add <name> --description "<look>"
                            Create a custom mascot
  stickr characters edit <name> --description "<look>"
                            Change a custom mascot's description
  stickr characters remove <name>
                            Delete a custom mascot

Setup options:
  --skip "<Name>"           Don't install for this agent (e.g. "Codex")
  --force "<Name>"          Install even if not detected
  --dry-run                 Show what would happen without writing
  --provider <name>         Save the image provider: openai or gemini
  --character <name>        Save a default mascot (see "stickr characters"),
                            or none to clear it

Generate options:
  --json                    Print the complete sticker record as JSON
  --provider <name>         Image provider: openai (default) or gemini

Inspect options:
  --verbose                 Include the full image prompt

Characters options:
  --json                    Print the character list as JSON

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
			validateArgs(
				command,
				positional,
				flags,
				['skip', 'force', 'dry-run', 'provider', 'character'],
				0,
			);
			const skip = flagValue(flags, 'skip');
			const force = flagValue(flags, 'force');
			await runSetup({
				skip: skip ? splitList(skip) : undefined,
				force: force ? splitList(force) : undefined,
				dryRun: flags.has('dry-run'),
				provider: flagValue(flags, 'provider'),
				character: flagValue(flags, 'character'),
			});
			return 0;
		}
		case 'generate': {
			validateArgs(command, positional, flags, ['spec', 'json', 'provider'], 0);
			const spec = flagValue(flags, 'spec');
			await generateAndReport({
				spec,
				json: flags.has('json'),
				providerName: flagValue(flags, 'provider'),
			});
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
		case 'characters': {
			if (positional.length === 0) {
				validateArgs(command, positional, flags, ['json'], 0);
				runListCharacters(flags.has('json'));
				return 0;
			}
			validateArgs(command, positional, flags, ['description'], 2);
			runCharacterAction({
				action: positional[0],
				name: positional[1],
				description: flagValue(flags, 'description'),
			});
			return 0;
		}
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
