import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { askHidden } from '../src/prompt-key.js';

describe('hidden API key input', () => {
	it('uses real streams, trims the answer, and never echoes the secret', async () => {
		const input = new PassThrough();
		const output = new PassThrough();
		let visibleOutput = '';
		output.setEncoding('utf8');
		output.on('data', (chunk) => {
			visibleOutput += chunk;
		});

		const answer = askHidden('API key: ', input, output);
		input.end('  sk-test-secret-1234567890  \n');

		expect(await answer).toBe('sk-test-secret-1234567890');
		expect(visibleOutput).toBe('API key: \n');
		expect(visibleOutput).not.toContain('sk-test-secret');
	});
});
