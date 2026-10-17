import sharp from 'sharp';

const ALPHA_THRESHOLD = 128;

function fg(r: number, g: number, b: number): string {
	return `\x1b[38;2;${r};${g};${b}m`;
}

function bg(r: number, g: number, b: number): string {
	return `\x1b[48;2;${r};${g};${b}m`;
}

const RESET = '\x1b[0m';

/**
 * Render an image as truecolor half-block characters: each terminal cell
 * shows two vertically stacked pixels. Transparent pixels keep the
 * terminal background, so stickers keep their die-cut shape.
 */
export async function renderHalfBlocks(path: string, columns: number): Promise<string[]> {
	const width = Math.max(1, Math.floor(columns));
	const height = width % 2 === 0 ? width : width + 1;
	const { data } = await sharp(path)
		.resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });

	const pixel = (x: number, y: number) => {
		const offset = (y * width + x) * 4;
		return {
			r: data[offset],
			g: data[offset + 1],
			b: data[offset + 2],
			visible: data[offset + 3] >= ALPHA_THRESHOLD,
		};
	};

	const lines: string[] = [];
	for (let y = 0; y < height; y += 2) {
		let line = '';
		for (let x = 0; x < width; x++) {
			const top = pixel(x, y);
			const bottom = pixel(x, y + 1);
			if (top.visible && bottom.visible) {
				line += `${fg(top.r, top.g, top.b)}${bg(bottom.r, bottom.g, bottom.b)}▀${RESET}`;
			} else if (top.visible) {
				line += `${fg(top.r, top.g, top.b)}▀${RESET}`;
			} else if (bottom.visible) {
				line += `${fg(bottom.r, bottom.g, bottom.b)}▄${RESET}`;
			} else {
				line += ' ';
			}
		}
		lines.push(line);
	}
	return lines;
}
