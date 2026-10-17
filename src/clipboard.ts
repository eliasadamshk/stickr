import { execFile, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { StickrError } from './errors.js';

const exec = promisify(execFile);

export interface ClipboardAdapters {
	exec(command: string, args: string[]): Promise<unknown>;
	readFile(path: string): Buffer;
	spawn(
		command: string,
		args: string[],
		options: { input: Buffer; timeout: number; stdio: ['pipe', 'ignore', 'ignore'] },
	): { status: number | null };
}

const defaultAdapters: ClipboardAdapters = {
	exec: (command, args) => exec(command, args),
	readFile: (path) => readFileSync(path),
	spawn: (command, args, options) => spawnSync(command, args, options),
};

/**
 * Copy a PNG file to the system clipboard as actual image data
 * (not a path string). macOS is the priority; Linux gets a best-effort
 * adapter via xclip/wl-copy; other platforms get a clear fallback.
 */
export async function copyImageToClipboard(
	pngPath: string,
	adapters: Partial<ClipboardAdapters> = {},
): Promise<string> {
	const resolved = { ...defaultAdapters, ...adapters };
	switch (process.platform) {
		case 'darwin':
			return copyMacOS(pngPath, resolved.exec);
		case 'linux':
			return copyLinux(pngPath, resolved);
		default:
			throw new StickrError(
				`Automatic clipboard copy is not supported on ${process.platform}.\n` +
					`Copy the file manually:\n  ${pngPath}`,
			);
	}
}

async function copyMacOS(pngPath: string, run: ClipboardAdapters['exec']): Promise<string> {
	// NSPasteboard via AppleScriptObjC: reads the PNG as an NSImage and writes
	// real image data to the general pasteboard. Works from any terminal and
	// pastes into WhatsApp/Slack/Messages with Cmd+V.
	const script = [
		'use framework "AppKit"',
		'on run argv',
		'set imgPath to item 1 of argv',
		"set img to current application's NSImage's alloc()'s initWithContentsOfFile:imgPath",
		'if img is missing value then error "Could not read image at " & imgPath',
		"set pb to current application's NSPasteboard's generalPasteboard()",
		"pb's clearContents()",
		"pb's writeObjects:{img}",
		'end run',
	].join('\n');
	try {
		await run('osascript', ['-e', script, pngPath]);
		return 'Copied to clipboard.';
	} catch (error) {
		throw new StickrError(
			`Could not copy image to clipboard: ${error instanceof Error ? error.message : error}\n` +
				`Copy the image manually from ${pngPath}.`,
			{ cause: error },
		);
	}
}

async function copyLinux(pngPath: string, adapters: ClipboardAdapters): Promise<string> {
	const image = adapters.readFile(pngPath);
	const commands: Array<[string, string[]]> = [
		['xclip', ['-selection', 'clipboard', '-t', 'image/png']],
	];
	if (process.env.WAYLAND_DISPLAY) commands.unshift(['wl-copy', []]);
	for (const [cmd, args] of commands) {
		// wl-copy and xclip fork a process that holds the selection; ignoring its
		// output pipes keeps spawnSync from waiting on it until the timeout.
		const result = adapters.spawn(cmd, args, {
			input: image,
			timeout: 5000,
			stdio: ['pipe', 'ignore', 'ignore'],
		});
		if (result.status === 0) return 'Copied to clipboard.';
	}
	throw new StickrError(
		`No clipboard tool found. Install xclip or wl-copy for image clipboard support.\nMeanwhile, the sticker file is at:\n  ${pngPath}`,
	);
}
