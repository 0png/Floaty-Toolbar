# Floaty Toolbar

A sleek, lightweight floating toolbar for Obsidian that appears whenever you select text. Format your notes instantly without leaving the keyboard or hunting through menus.

---

## Features

- **Floating selection toolbar** — pops up above your selection the moment you highlight text
- **Dock mode** — pin the toolbar to the bottom of the screen as a persistent pill
- **Smart URL** — automatically pastes a URL from your clipboard when inserting a link
- **Toggle formatting** — clicking a format button a second time removes the formatting
- **Keyboard accessible** — navigate with `Tab` / `Shift+Tab`, activate with `Enter` or `Space`, dismiss with `Escape`
- **Theme compatible** — uses Obsidian CSS variables throughout, works with any community theme

---

## Actions

| Button | Action |
|---|---|
| **B** | Bold (`**text**`) |
| *I* | Italic (`*text*`) |
| ~~S~~ | Strikethrough (`~~text~~`) |
| `<>` | Inline code (`` `text` ``) |
| Highlight | Highlight (`==text==`) |
| Link | Insert link (`[text](url)`) |
| H | Heading (H1–H4, or remove heading) |
| Quote | Callout (Note, Tip, Warning, Important, Caution) |
| Pin | Toggle between floating and dock mode |

---

## Settings

### Smart URL detection

When enabled, clicking the link button reads your clipboard. If it contains a valid `https://` URL, that URL is used automatically instead of the `url` placeholder.

When disabled, a one-time tip notice will appear on first use to let you know the feature exists.

### Dock mode

Pins the toolbar to the bottom centre of the screen. Toggle between modes using the pin icon inside the toolbar — no restart needed.

---

## Installation

### Community plugins (coming soon)

Submission to the Obsidian community plugin registry is in progress. Once approved:

1. Open Obsidian **Settings → Community plugins**
2. Disable Safe Mode if prompted
3. Click **Browse** and search for `Floaty Toolbar`
4. Click **Install**, then **Enable**

### Manual

1. Download `main.js`, `styles.css`, and `manifest.json` from the [latest release](https://github.com/0png/floaty-toolbar/releases/latest)
2. Copy them into `<vault>/.obsidian/plugins/floaty-toolbar/`
3. Reload Obsidian and enable the plugin in **Settings → Community plugins**

---

## Commands & Hotkeys

All formatting actions are available as Obsidian commands (searchable via `Ctrl/Cmd+P`). Custom hotkeys can be assigned to any of them via **Settings → Hotkeys**.

---

## Contributing

Bug reports, feature requests, and pull requests are welcome. Please open an [issue](https://github.com/0png/floaty-toolbar/issues) to discuss significant changes before submitting a PR.

---

## License

MIT

---

Created by [0png](https://github.com/0png)
