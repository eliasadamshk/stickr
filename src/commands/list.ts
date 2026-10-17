import type { StickerRecord } from '../store.js';
import { listStickers } from '../store.js';

/** Human-friendly relative time: "2m ago", "3h ago", "yesterday", or a date. */
export function relativeTime(iso: string, now = new Date()): string {
	const then = new Date(iso);
	if (Number.isNaN(then.getTime())) return 'unknown time';
	const diffMs = now.getTime() - then.getTime();
	const minutes = Math.floor(diffMs / 60_000);
	if (minutes < 1) return 'just now';
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days === 1) return 'yesterday';
	if (days < 7) return `${days}d ago`;
	return then.toISOString().slice(0, 10);
}

export function formatListRow(record: StickerRecord, now = new Date()): string {
	const caption = record.spec.caption ? `"${record.spec.caption}"` : '(no caption)';
	return `${record.id}  ${relativeTime(record.createdAt, now).padEnd(10)}  ${caption}`;
}

export function runList(): void {
	const { records, corrupt } = listStickers();
	for (const name of corrupt) {
		console.log(`??????  corrupt   skipped unreadable sticker directory: ${name}`);
	}
	if (records.length === 0) {
		if (corrupt.length === 0) {
			console.log('No stickers yet. Invoke Stickr in your coding agent or run "stickr generate".');
		}
		return;
	}
	for (const record of records) {
		console.log(formatListRow(record));
	}
}
