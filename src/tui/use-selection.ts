import { useCallback, useRef, useState } from 'react';

const clamp = (index: number, count: number) => Math.max(0, Math.min(index, count - 1));

/**
 * A clamped list cursor. The ref updates synchronously, so handlers for keys
 * that arrive in the same input chunk (key repeat, pasted sequences) act on
 * the row the user actually moved to rather than the last rendered one.
 */
export function useSelection(count: number) {
	const [index, setIndex] = useState(0);
	const indexRef = useRef(0);
	const countRef = useRef(count);
	countRef.current = count;

	const select = useCallback((next: number) => {
		indexRef.current = clamp(next, countRef.current);
		setIndex(indexRef.current);
	}, []);
	const move = useCallback((delta: number) => select(indexRef.current + delta), [select]);
	const read = useCallback(() => clamp(indexRef.current, countRef.current), []);

	return { index: clamp(index, count), read, select, move };
}
