export class StickrError extends Error {
	readonly exitCode: number;

	constructor(message: string, options?: { cause?: unknown; exitCode?: number }) {
		super(message);
		this.name = 'StickrError';
		this.cause = options?.cause;
		this.exitCode = options?.exitCode ?? 1;
	}
}
