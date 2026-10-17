import { execFile } from 'node:child_process';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import { StickrError } from './errors.js';

const exec = promisify(execFile);

export async function openInViewer(filePath: string): Promise<void> {
	try {
		if (process.platform === 'darwin') {
			await exec('open', [filePath]);
		} else if (process.platform === 'linux') {
			await exec('xdg-open', [filePath]);
		} else if (process.platform === 'win32') {
			// A single-quoted PowerShell string avoids cmd.exe parsing of spaces, & and %VAR%.
			await exec('powershell.exe', [
				'-NoProfile',
				'-NonInteractive',
				'-Command',
				`Start-Process -FilePath '${filePath.replace(/'/g, "''")}'`,
			]);
		} else {
			throw new Error(`unsupported platform: ${process.platform}`);
		}
	} catch (error) {
		throw new StickrError(
			`Could not open the file: ${error instanceof Error ? error.message : error}\nPath: ${filePath}`,
			{ cause: error },
		);
	}
}

export async function revealInFileManager(filePath: string): Promise<void> {
	try {
		if (process.platform === 'darwin') {
			await exec('open', ['-R', filePath]);
		} else if (process.platform === 'linux') {
			// No universal "reveal"; open the containing folder instead.
			await exec('xdg-open', [dirname(filePath)]);
		} else if (process.platform === 'win32') {
			// explorer.exe exits with code 1 even when it succeeds.
			await exec('explorer', ['/select,', filePath]).catch((error: { code?: unknown }) => {
				if (error.code !== 1) throw error;
			});
		} else {
			throw new Error(`unsupported platform: ${process.platform}`);
		}
	} catch (error) {
		throw new StickrError(
			`Could not reveal the file: ${error instanceof Error ? error.message : error}\nPath: ${filePath}`,
			{ cause: error },
		);
	}
}
