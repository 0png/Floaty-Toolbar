import { Editor, Notice } from 'obsidian';

let smartUrlNoticeSeen = false;

export function wrapSelection(editor: Editor, prefix: string, suffix?: string): void {
    const selected = editor.getSelection();
    const _suffix = suffix ?? prefix;
    if (!selected) return;

    const inner = selected.slice(prefix.length, selected.length - _suffix.length);
    const isWrapped =
        selected.length > prefix.length + _suffix.length &&
        selected.startsWith(prefix) &&
        selected.endsWith(_suffix) &&
        !inner.startsWith(prefix);

    if (isWrapped) {
        editor.replaceSelection(inner);
    } else {
        editor.replaceSelection(`${prefix}${selected}${_suffix}`);
    }
}

export function applyBold(editor: Editor): void { wrapSelection(editor, '**'); }

export function applyItalic(editor: Editor): void {
    const selected = editor.getSelection();
    if (!selected) return;
    if (selected.startsWith('*') && selected.endsWith('*') && !selected.startsWith('**') && selected.length > 2) {
        editor.replaceSelection(selected.slice(1, -1));
    } else {
        editor.replaceSelection(`*${selected}*`);
    }
}

export function applyStrikethrough(editor: Editor): void { wrapSelection(editor, '~~'); }
export function applyCode(editor: Editor): void          { wrapSelection(editor, '`'); }
export function applyHighlight(editor: Editor): void     { wrapSelection(editor, '=='); }

/**
 * Insert link. If smartUrl=true, reads clipboard and uses it if it's a valid URL.
 * If smartUrl=false, uses "url" placeholder and shows a one-time Notice nudge.
 */
export async function applyLink(editor: Editor, smartUrl: boolean): Promise<void> {
    const selected = editor.getSelection();
    if (!selected) return;

    // Unwrap existing link
    const match = selected.match(/^\[(.+)\]\(.+\)$/);
    if (match) {
        editor.replaceSelection(match[1]);
        return;
    }

    let url = 'url';

    if (smartUrl) {
        try {
            const clip = await navigator.clipboard.readText();
            const trimmed = clip.trim();
            // Validate it looks like a URL
            if (/^https?:\/\/.+/.test(trimmed)) {
                url = trimmed;
            }
        } catch {
            // Clipboard read failed (permissions) — fall back to placeholder
        }
    } else {
        if (!smartUrlNoticeSeen) {
            smartUrlNoticeSeen = true;
            new Notice(
                '💡 Tip: Enable "Smart URL" in Floaty Toolbar settings to auto-paste URLs from clipboard.',
                6000
            );
        }
    }

    editor.replaceSelection(`[${selected}](${url})`);
}

export function applyHeading(editor: Editor, level: 0 | 1 | 2 | 3 | 4): void {
    const cursor   = editor.getCursor('head');
    const lineText = editor.getLine(cursor.line);
    const stripped = lineText.replace(/^#{1,6}\s/, '');

    if (level === 0) {
        editor.setLine(cursor.line, stripped);
        return;
    }

    const currentMatch = lineText.match(/^(#{1,6})\s/);
    const currentLevel = currentMatch ? currentMatch[1].length : 0;
    if (currentLevel === level) {
        editor.setLine(cursor.line, stripped);
    } else {
        editor.setLine(cursor.line, '#'.repeat(level) + ' ' + stripped);
    }
}

export type CalloutType = 'note' | 'tip' | 'warning' | 'important' | 'caution';

export function applyCallout(editor: Editor, type: CalloutType): void {
    const sel = editor.getSelection();
    if (!sel) return;

    const lines      = sel.split('\n');
    const isCallout  = /^>\s\[![\w]+\]/.test(lines[0]);
    const contentLines = isCallout ? lines.slice(1).map(l => l.replace(/^>\s?/, '')) : lines;

    editor.replaceSelection(`> [!${type}]\n${contentLines.map(l => `> ${l}`).join('\n')}`);
}

export function getSelectionRect(): DOMRect | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    return (rect.width === 0 && rect.height === 0) ? null : rect;
}