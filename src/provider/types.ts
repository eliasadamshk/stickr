export interface ImageProvider {
	readonly model: string;
	generate(prompt: string): Promise<Buffer>;
}
