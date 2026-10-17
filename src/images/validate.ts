import sharp from 'sharp';

export type TransparencyReport = { ok: true } | { ok: false; reason: string };

/**
 * Validate that an image is a decodable PNG with a real alpha channel and
 * genuine transparency — plus actual visible content. Never trust the prompt.
 */
export async function validateTransparency(input: Buffer): Promise<TransparencyReport> {
	const image = sharp(input, { failOn: 'error' });
	const metadata = await image.metadata().catch(() => null);
	if (!metadata) {
		return { ok: false, reason: 'Image could not be decoded (invalid or corrupt data).' };
	}
	if (metadata.format !== 'png') {
		return { ok: false, reason: `Expected a PNG image, received ${metadata.format ?? 'unknown'}.` };
	}

	if (!metadata.hasAlpha) {
		return { ok: false, reason: 'Image has no alpha channel — background is opaque.' };
	}

	const raw = await image
		.clone()
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true })
		.catch(() => null);
	if (!raw) {
		return { ok: false, reason: 'Image pixels could not be read.' };
	}

	const channels = raw.info.channels;
	const totalPixels = raw.info.width * raw.info.height;
	let transparent = 0;
	let opaque = 0;
	for (let i = 3; i < raw.data.length; i += channels) {
		const a = raw.data[i];
		if (a < 8) transparent++;
		else if (a > 240) opaque++;
	}

	if (transparent === 0) {
		return { ok: false, reason: 'No transparent pixels found — the image is a solid rectangle.' };
	}
	if (transparent / totalPixels < 0.02) {
		return {
			ok: false,
			reason: 'Barely any transparency detected — the subject fills the whole rectangle.',
		};
	}
	if (opaque / totalPixels < 0.005) {
		return { ok: false, reason: 'Image appears to be almost entirely empty/transparent.' };
	}

	return { ok: true };
}
