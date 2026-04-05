# go-md-notes

A local-first Markdown notes app built with Go, Wails, React, and CodeMirror.

It is designed for GitHub-based storage of notes, with optional encryption for sensitive content.

## Highlights

- Single-pane editor (Obsidian-like layout)
- File tree sidebar with folders/files
- Dot-prefixed folders/files are hidden in the tree
- Custom right-click context menus for sidebar and editor
- Markdown editing with code block syntax highlighting
- Heading typography (H1-H6) in-editor
- Unsaved indicator and Git `uncommitted` indicator per file
- Sensitive content support:
- Full-note sensitivity toggle
- Inline sensitive regions via markers
- Encrypted storage for sensitive regions only
- Files remain mostly valid Markdown on disk

## Security Model

Sensitive content is encrypted per region with:

- AES-GCM
- Argon2id-derived key from passphrase
- Per-region random salt and nonce

Two security modes are supported:

- `manual`: user enters passphrase
- `generated`: app generates a strong key and stores it in OS keychain/keyring

Additional security tooling:

- Export recovery key (generated mode)
- Import recovery key (new machine setup)
- Re-encrypt all existing encrypted regions (passphrase/key migration)

Important behavior:

- If no passphrase is provided, encrypted regions load as raw encrypted blocks
- If a wrong passphrase is provided, encrypted regions also remain raw (no hard failure)
- Never commit your manual passphrase or exported recovery key to Git

## Markdown Format

The editor uses simple inline markers for sensitive regions:

```md
<!-- sensitive:start -->
secret text
<!-- sensitive:end -->
```

When saved, sensitive content is stored as encrypted metadata blocks:

```md
<!-- go-md-notes:encrypted salt="..." nonce="..." -->
BASE64_CIPHERTEXT
<!-- /go-md-notes:encrypted -->
```

If a full note is marked sensitive, a note-level metadata line is added:

```md
<!-- go-md-notes:note sensitive="true" -->
```

## Configuration

Config file location:

- macOS/Linux: `~/.go-md-notes/config.json`
- Windows: `%AppData%/go-md-notes/config.json` (from `os.UserConfigDir`)

Config stores:

- Notes directory path
- Security mode (`unset`, `manual`, `generated`)

On first launch, the app asks for a notes directory and encryption mode.

## Keyboard Shortcuts

- `Cmd/Ctrl + S`: Save
- `Cmd/Ctrl + Shift + O`: Choose notes folder
- `Cmd/Ctrl + Shift + R`: Refresh tree
- `Cmd/Ctrl + Shift + P`: Toggle full-note sensitivity
- `Cmd/Ctrl + Shift + E`: Toggle sensitive for current selection

## Git Integration

If the selected notes directory is a Git repo, the app shows uncommitted file state using:

```bash
git -C <notesDir> status --porcelain -z --untracked-files=all
```

This supports nested files/folders and untracked files.

## Development

### Prerequisites

- Go `1.23+`
- Node.js + npm
- Wails CLI v2

Install Wails CLI (if needed):

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

Install frontend dependencies:

```bash
cd frontend
npm install
```

Run in development mode (from repo root):

```bash
wails dev
```

Build frontend only:

```bash
cd frontend
npm run build
```

Build desktop app:

```bash
wails build
```

## Project Structure

- `app.go`: backend app logic, file ops, encryption integration, git status
- `crypto.go`: Argon2id + AES-GCM helpers
- `frontend/src/App.tsx`: main UI, editor behavior, context menus, shortcuts
- `frontend/src/App.css`: app/editor styling
- `wails.json`: Wails project config

## Notes

- This project is intended for private/local workflows with GitHub as sync/storage.
- Security depends on passphrase/key handling. Exported recovery keys should be stored in a password manager.
