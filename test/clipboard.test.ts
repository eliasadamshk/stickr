import { afterEach, describe, expect, it, vi } from 'vitest';
import { type ClipboardAdapters, copyImageToClipboard } from '../src/clipboard.js';

const originalPlatform = process.platform;

afterEach(() => {
	Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
	vi.unstubAllEnvs();
});

function adapters(overrides: Partial<ClipboardAdapters> = {}): ClipboardAdapters {
	return {
		exec: async () => undefined,
		readFile: () => Buffer.from('png bytes'),
		spawn: () => ({ status: 0 }),
		...overrides,
	};
}

describe('image clipboard adapters', () => {
	it('passes the image path to the macOS pasteboard script', async () => {
		Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
		const run = vi.fn<ClipboardAdapters['exec']>(async () => undefined);

		await expect(
			copyImageToClipboard('/stickers/abc123/sticker.png', adapters({ exec: run })),
		).resolves.toBe('Copied to clipboard.');
		expect(run).toHaveBeenCalledOnce();
		const [command, args] = run.mock.calls[0];
		expect(command).toBe('osascript');
		expect(args[0]).toBe('-e');
		expect(args.at(-1)).toBe('/stickers/abc123/sticker.png');
	});

	it('tries wl-copy before falling back to xclip on Wayland', async () => {
		Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
		vi.stubEnv('WAYLAND_DISPLAY', 'wayland-0');
		const image = Buffer.from('actual png bytes');
		const spawn = vi
			.fn<ClipboardAdapters['spawn']>()
			.mockReturnValueOnce({ status: 1 })
			.mockReturnValueOnce({ status: 0 });

		await expect(
			copyImageToClipboard(
				'/stickers/abc123/sticker.png',
				adapters({ readFile: () => image, spawn }),
			),
		).resolves.toBe('Copied to clipboard.');
		expect(spawn.mock.calls.map(([command]) => command)).toEqual(['wl-copy', 'xclip']);
		expect(spawn.mock.calls[0][2]).toEqual({
			input: image,
			timeout: 5000,
			stdio: ['pipe', 'ignore', 'ignore'],
		});
		expect(spawn.mock.calls[1][1]).toEqual(['-selection', 'clipboard', '-t', 'image/png']);
	});

	it('gives an actionable error when Linux has no clipboard utility', async () => {
		Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
		await expect(
			copyImageToClipboard(
				'/stickers/abc123/sticker.png',
				adapters({ spawn: () => ({ status: 1 }) }),
			),
		).rejects.toThrow(/Install xclip or wl-copy.*sticker\.png/is);
	});

	it('does not touch the filesystem on an unsupported platform', async () => {
		Object.defineProperty(process, 'platform', { value: 'freebsd', configurable: true });
		const readFile = vi.fn(() => Buffer.from('should not be read'));
		await expect(
			copyImageToClipboard('/stickers/abc123/sticker.png', adapters({ readFile })),
		).rejects.toMatchObject({
			name: 'StickrError',
			message: expect.stringMatching(/not supported on freebsd.*manually/is),
		});
		expect(readFile).not.toHaveBeenCalled();
	});
});
