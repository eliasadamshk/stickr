import { copyImageToClipboard } from '../clipboard.js';
import { openInViewer, revealInFileManager } from '../platform.js';
import { renderHalfBlocks } from './preview.js';

/** Side effects the interactive mode performs, injectable for tests. */
export interface TuiActions {
	copy(path: string): Promise<string>;
	open(path: string): Promise<void>;
	reveal(path: string): Promise<void>;
	preview(path: string, columns: number): Promise<string[]>;
}

export const defaultActions: TuiActions = {
	copy: (path) => copyImageToClipboard(path),
	open: openInViewer,
	reveal: revealInFileManager,
	preview: renderHalfBlocks,
};

export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** The slice of a list to show so that the selected row stays visible. */
export function visibleWindow(
	total: number,
	selected: number,
	size: number,
): { start: number; end: number } {
	if (total <= size) return { start: 0, end: total };
	const start = Math.min(Math.max(0, selected - Math.floor(size / 2)), total - size);
	return { start, end: start + size };
}
