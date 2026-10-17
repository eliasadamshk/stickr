import { render } from 'ink';
import { App } from './App.js';

export async function runTui(): Promise<void> {
	const { waitUntilExit } = render(<App />);
	await waitUntilExit();
}
