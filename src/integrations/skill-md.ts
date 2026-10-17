export const STICKR_SKILL_MARKDOWN = `---
name: stickr
description: Generate a die-cut sticker capturing what just happened in this coding session. Use when the user invokes /stickr in Claude Code, mentions $stickr in Codex, or asks for a sticker of the current work, refactor, debugging saga, or milestone.
---

# stickr: turn this session into a sticker

Create one die-cut sticker based on the most memorable moment in the recent
conversation. Choose the subject yourself instead of asking the user.

## 1. Understand the session

Review the recent conversation and choose one moment for the sticker. It could
be a success, a failure that was finally fixed, a large refactor, deleted code,
painful debugging, TypeScript trouble, a bug you introduced and fixed, a
migration, something that worked on the first try, or a shipped feature.

These read-only commands can provide a little more context:

- \`git status --short\`
- \`git diff --numstat | tail -5\`
- \`git log -1 --oneline\`

Never put source code, diffs, file contents, paths with secrets, or terminal
output in the sticker description. Describe what happened instead ("a large
authentication refactor finally passed all tests").

## 2. Invent the concept

Think of two or three visual metaphors for the moment, such as a cute capybara
sweeping code into a bin. Choose one that is simple to draw, funny or charming,
readable at 512×512, and limited to one subject with no background scene.

The optional caption can contain up to four words. Write it in uppercase (for
example, "WE MADE IT WORSE", "SHIP IT", "IT WAS THE TEST", or "1,200 LINES
FREED"). Leave it out if no short caption works.

## 3. Generate

Build a compact JSON StickerSpec and pipe it to Stickr:

\`\`\`bash
stickr generate --spec '{"concept":"capybara sweeping old code into a bin","subject":"cute capybara","action":"sweeping code into a wastebasket","mood":"calmly satisfied","caption":"1,200 LINES FREED","contextSummary":"Large legacy cleanup, net 1200 lines deleted"}'
\`\`\`

Fields: \`concept\`, \`subject\`, \`action\`, \`mood\` (required);
\`caption\`, \`contextSummary\` (optional). Keep every field short.
If \`stickr\` is not on PATH, ask the user to run \`stickr setup\`.

## 4. Report

On success, reply with this short summary:

✓ Sticker created

"<caption>"

PNG: ~/.stickr/stickers/<id>/sticker.png
WebP: ~/.stickr/stickers/<id>/sticker.webp

Copied to clipboard.

If the environment supports showing images inline, preview sticker.png.
If generation fails, show the error message and its suggested fix. You may retry
once. Do not print stack traces. Keep your brainstorming private unless the user
asks to see it.
`;
