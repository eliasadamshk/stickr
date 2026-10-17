/** Lightweight offline self-test of every sharp operation generation relies on. */
export async function selfTestImagePipeline(): Promise<void> {
	const sharp = (await import('sharp')).default;
	const png = await sharp({
		create: { width: 4, height: 4, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
	})
		.png()
		.toBuffer();
	await sharp(png).raw().toBuffer();
	await sharp(png)
		.resize(8, 8)
		.extend({ top: 1, bottom: 1, left: 1, right: 1, background: { r: 0, g: 0, b: 0, alpha: 0 } })
		.webp()
		.toBuffer();
}
