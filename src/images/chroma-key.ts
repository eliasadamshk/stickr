import sharp from 'sharp';

const KEY: readonly [number, number, number] = [255, 0, 255];
/** Max RGB distance from the key still treated as background (absorbs JPEG noise). */
const BACKGROUND_TOLERANCE = 110;
/**
 * Pixels this close to the key also seed the fill, so background pockets
 * enclosed by the subject (e.g. between an arm and the body) are cleared too.
 * The prompt forbids magenta inside the sticker, so near-exact key pixels are background.
 */
const POCKET_SEED_TOLERANCE = 40;
/** Distance from the key to a white border; used to estimate fringe alpha. */
const BORDER_DISTANCE = 255;

/**
 * Remove a flat magenta background from an opaque image and return a PNG with
 * alpha. Background is flood-filled from the image edges and from near-exact
 * key pixels, through anything within tolerance of the key. Pixels on the
 * boundary get partial alpha and have the key color unmixed from them.
 */
export async function removeChromaKey(input: Buffer): Promise<Buffer> {
	const { data, info } = await sharp(input)
		.removeAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	const { width, height } = info;
	const pixels = width * height;
	const distance = (i: number) =>
		Math.hypot(data[i * 3] - KEY[0], data[i * 3 + 1] - KEY[1], data[i * 3 + 2] - KEY[2]);

	const background = new Uint8Array(pixels);
	const stack: number[] = [];
	for (let x = 0; x < width; x++) stack.push(x, (height - 1) * width + x);
	for (let y = 0; y < height; y++) stack.push(y * width, y * width + width - 1);
	for (let i = 0; i < pixels; i++) if (distance(i) <= POCKET_SEED_TOLERANCE) stack.push(i);
	while (stack.length > 0) {
		const i = stack.pop() as number;
		if (background[i] || distance(i) > BACKGROUND_TOLERANCE) continue;
		background[i] = 1;
		const x = i % width;
		if (x > 0) stack.push(i - 1);
		if (x < width - 1) stack.push(i + 1);
		if (i >= width) stack.push(i - width);
		if (i < pixels - width) stack.push(i + width);
	}

	const rgba = Buffer.alloc(pixels * 4);
	for (let i = 0; i < pixels; i++) {
		const x = i % width;
		const touchesBackground =
			(x > 0 && background[i - 1] === 1) ||
			(x < width - 1 && background[i + 1] === 1) ||
			(i >= width && background[i - width] === 1) ||
			(i < pixels - width && background[i + width] === 1);
		let alpha = 1;
		if (background[i]) alpha = 0;
		else if (touchesBackground) alpha = Math.min(1, distance(i) / BORDER_DISTANCE);

		for (let c = 0; c < 3; c++) {
			const value = data[i * 3 + c];
			// observed = alpha * foreground + (1 - alpha) * key  →  solve for foreground.
			rgba[i * 4 + c] =
				alpha > 0 && alpha < 1
					? Math.max(0, Math.min(255, Math.round((value - (1 - alpha) * KEY[c]) / alpha)))
					: value;
		}
		rgba[i * 4 + 3] = Math.round(alpha * 255);
	}
	return sharp(rgba, { raw: { width, height, channels: 4 } })
		.png()
		.toBuffer();
}
