import {
	copyFileSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { STICKR_SKILL_MARKDOWN } from './skill-md.js';

export interface AgentIntegration {
	name: string;
	invocation: string;
	detect(): boolean;
	install(): SkillInstall;
}

export interface SkillInstall {
	path: string;
	/** Where a previously customized SKILL.md was backed up, if any. */
	backup?: string;
}

function writeSkill(skillDir: string): SkillInstall {
	const path = join(skillDir, 'SKILL.md');
	mkdirSync(skillDir, { recursive: true });
	let backup: string | undefined;
	if (existsSync(path)) {
		if (lstatSync(path).isSymbolicLink()) {
			throw new Error(`${path} is a symlink; remove it or replace it with a regular file first`);
		}
		if (readFileSync(path, 'utf8') !== STICKR_SKILL_MARKDOWN) {
			backup = `${path}.bak`;
			copyFileSync(path, backup);
		}
	}
	writeFileSync(path, STICKR_SKILL_MARKDOWN, 'utf8');
	return { path, backup };
}

/**
 * Codex CLI — native user-scope skills live in ~/.agents/skills/<name>/SKILL.md
 * (see https://developers.openai.com/codex/skills). Invocable via $stickr and
 * listed in /skills.
 */
export const codexIntegration: AgentIntegration = {
	name: 'Codex',
	invocation: '$stickr (or choose Stickr from /skills)',
	detect() {
		return (
			existsSync(join(homedir(), '.codex')) ||
			existsSync(join(homedir(), '.agents', 'skills')) ||
			commandExists('codex')
		);
	},
	install() {
		return writeSkill(join(homedir(), '.agents', 'skills', 'stickr'));
	},
};

/**
 * Claude Code — personal skills live in ~/.claude/skills/<name>/SKILL.md with
 * name/description frontmatter (see https://code.claude.com/docs/en/skills).
 * Invocable as /stickr.
 */
export const claudeIntegration: AgentIntegration = {
	name: 'Claude Code',
	invocation: '/stickr',
	detect() {
		return existsSync(join(homedir(), '.claude')) || commandExists('claude');
	},
	install() {
		return writeSkill(join(homedir(), '.claude', 'skills', 'stickr'));
	},
};

function commandExists(cmd: string): boolean {
	const extensions =
		process.platform === 'win32' ? (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';') : [''];
	return (process.env.PATH?.split(delimiter) ?? []).some((dir) =>
		extensions.some((extension) => dir !== '' && existsSync(join(dir, `${cmd}${extension}`))),
	);
}

export function allIntegrations(): AgentIntegration[] {
	return [codexIntegration, claudeIntegration];
}
