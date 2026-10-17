# Stickr

Context-aware stickers from coding-agent conversations.

You and your coding agent just spent an hour fixing flaky tests. Invoke Stickr:

- Claude Code: `/stickr`
- Codex: `$stickr`, or select Stickr from `/skills`

Stickr turns that session into:

> \[cute exhausted raccoon holding a green checkmark\]
>
> **"IT WAS THE TEST"**

Stickr copies the transparent PNG to your clipboard. Paste it into WhatsApp, Slack, or Messages. That's the whole product.

---

## Install

Requires Node.js 22 or newer.

```bash
npm install -g stickr   # or: pnpm add -g stickr
stickr setup
```

To work from a local checkout:

```bash
pnpm install && pnpm build
pnpm link --global
```

## Set up

```bash
stickr setup
```

Setup looks for Codex and Claude Code and installs Stickr for each one it finds. Codex uses `~/.agents/skills/stickr`; Claude Code uses `~/.claude/skills/stickr`. Setup also creates `~/.stickr/`, tests image processing, and checks the API key for your image provider (OpenAI by default).

- If `OPENAI_API_KEY` is set, setup confirms it.
- Otherwise, setup can save the key in the operating system's credential store:
  - macOS: Keychain (`security add-generic-password`, service `stickr`)
  - Linux: Secret Service (`secret-tool`; GNOME Keyring/KWallet)
  - Windows: an account-bound, DPAPI-encrypted file using PowerShell

At runtime, Stickr checks the environment first and then the platform credential store.

Stickr never stores API keys as plaintext. If a credential store is unavailable, set
`OPENAI_API_KEY` in your environment instead.

If you skip the prompt:

```bash
export OPENAI_API_KEY="sk-..."   # add to ~/.zshrc to make it permanent
```

You can run `stickr setup` more than once.

### Use Google Nano Banana instead of OpenAI

Stickr can generate with Google's `gemini-nano-banana-2.1` model instead of OpenAI:

```bash
stickr setup --provider gemini
```

This saves `"provider": "gemini"` in `~/.stickr/config.json` and asks for a Gemini API key, stored the same way as the OpenAI key. You can set `GEMINI_API_KEY` instead. To switch for one sticker only, pass `--provider gemini` (or `openai`) to `stickr generate`.

1. Create a key at [Google AI Studio](https://aistudio.google.com/apikey).
2. Add billing. The model has no free tier, and new AI Studio accounts use prepaid credits: buy at least $5 on the AI Studio Billing page. When credits run out, requests fail with "prepayment credits are depleted".
3. Run `stickr setup --provider gemini` and paste the key.

Gemini returns only JPEG images, so Stickr asks the model for a flat magenta background and removes it to make the sticker transparent. One 1K image costs about $0.034.

## Use

Open Codex or Claude Code, do some normal coding work, then invoke Stickr:

- Claude Code: `/stickr`
- Codex: `$stickr`, or select Stickr from `/skills`

Your agent picks a moment from the conversation, such as a refactor that finally passed, a 1,200-line cleanup, or a bug it introduced and fixed. It turns that moment into a die-cut sticker concept and sends the visual description to the image model: OpenAI's `gpt-image-2.5-flare` by default, or Google's `gemini-nano-banana-2.1`. Stickr checks the returned image for transparency, normalizes it, and copies it to your clipboard. You do not have to describe the sticker yourself.

## What you get

Every generation creates three files in `~/.stickr/stickers/<id>/`:

| File           | Purpose                                            |
| -------------- | -------------------------------------------------- |
| `original.png` | Full-quality transparent output from the model     |
| `sticker.png`  | 512×512 normalized die-cut sticker (auto-copied)   |
| `sticker.webp` | Same sticker optimized for messaging apps          |

## CLI

```bash
stickr setup            # install Stickr into detected coding agents
stickr list             # recent stickers: id, age, caption
stickr open <id>        # open in the default image viewer
stickr reveal <id>      # show in Finder / file manager
stickr copy <id>        # copy image data to the clipboard
stickr inspect <id>     # spec, files, dimensions, model, prompt version
stickr generate --spec '<json>'   # low-level: render a StickerSpec directly
echo '<json>' | stickr generate   # same, reading the spec from stdin
stickr --help           # usage summary; --version prints the version
```

Flags:

- `setup --skip "<Name>"` / `--force "<Name>"`: skip a detected agent or install for one that was not detected. Use a comma-separated value for multiple agents. `--dry-run` shows what would happen without writing.
- `setup --provider <openai|gemini>`: save the default image provider.
- `generate --json`: print the full sticker record as JSON instead of the human-readable summary.
- `generate --provider <openai|gemini>`: use a different image provider for this sticker.
- `inspect --verbose` (or `STICKR_DEBUG=1`): also print the full image prompt.

Agents use `generate` under the hood with a compact JSON StickerSpec:

```json
{
  "concept": "capybara sweeping old code into a bin",
  "subject": "cute capybara",
  "action": "sweeping code into a wastebasket",
  "mood": "calmly satisfied",
  "caption": "1,200 LINES FREED",
  "contextSummary": "deleted 1,200 lines of dead code after the refactor landed"
}
```

`caption` and `contextSummary` are optional. `contextSummary` is stored in metadata only and never sent to the image model.

## Privacy

Stickr sends only the invented visual description to the image provider (OpenAI or Google). It does not send source code, diffs, environment variables, terminal history, credentials, or arbitrary command output. The Stickr instructions tell the agent to summarize the session before generating the image.

## Configuration

`~/.stickr/config.json`:

```json
{
  "autoCopy": true,
  "provider": "openai"
}
```

- `autoCopy`: set to `false` if clipboard copying is unreliable in your environment.
- `provider`: `openai` (default) or `gemini`.

Environment variables:

- `STICKR_HOME`: store config and stickers somewhere other than `~/.stickr`.
- `STICKR_DEBUG=1`: print error causes and stack traces.
- `OPENAI_API_KEY` / `GEMINI_API_KEY`: API keys; these take priority over stored keys.

## Development

```bash
just ci          # frozen install, lint, typecheck, tests, and build
just --list      # show the individual development commands
```

## Release

Publishing a non-prerelease GitHub Release starts the release workflow. The release tag must match the version in `package.json`. For example, version `0.1.0` uses tag `v0.1.0`. The workflow runs the project checks and publishes the package to the public npm registry.

The first release needs a granular npm publish token stored in the `NPM_TOKEN` GitHub Actions secret. Once the package exists on npm, add a trusted publisher for the GitHub owner, repository, and `release.yml` workflow. Allow `npm publish`, verify one release with OIDC, and remove the `NPM_TOKEN` secret. Later releases use short-lived GitHub OIDC credentials, and npm adds provenance automatically.

## Known limitations

- Linux needs `libsecret-tools` to save the API key in Secret Service. For example, run `sudo apt install libsecret-tools`. You can use `OPENAI_API_KEY` instead.
- macOS copies images through NSPasteboard. Linux tries `wl-copy` (Wayland sessions only) and then `xclip`. On other platforms, Stickr prints the file path so you can copy the image manually.
- Gemini generation requires prepaid Google AI Studio credits; Google adds an invisible SynthID watermark to every image.
- Image generation requires an OpenAI API key with access to `gpt-image-2.5-flare`; [OpenAI may require API Organization Verification](https://developers.openai.com/api/docs/guides/image-generation) for GPT Image models.
- If transparency validation fails, Stickr retries once with stronger instructions. It does not keep regenerating images.
