import type { BackgroundMode } from '../prompt.js';

export interface ImageProvider {
	readonly model: string;
	/** How the prompt should ask for the background; providers return a transparent PNG either way. */
	readonly background: BackgroundMode;
	generate(prompt: string): Promise<Buffer>;
}
