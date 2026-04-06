import { Editor } from 'obsidian';

/**
 * Wraps the current selection with a prefix and optional suffix.
 * Handles unwrapping correctly, including edge cases like * vs **
 */
export function wrapSelection(editor: Editor, prefix: string, suffix?: string): void {
    const selected = editor.getSelection();
    const _suffix = suffix ?? prefix;

    if (!selected) return;

    const isWrapped =
        selected.length > prefix.length + _suffix.length &&
        selected.startsWith(prefix) &&
        selected.endsWith(_suffix) &&
        selected.slice(prefix.length, prefix.length + prefix.length) !== prefix;

    if (isWrapped) {
        const inner = selected.slice(prefix.length, selected.length - _suffix.length);
        editor.replaceSelection(inner);
    } else {
        editor.replaceSelection(`${prefix}${selected}${_suffix}`);
    }
}

/** Bold: **text** */
export function applyBold(editor: Editor): void {
    wrapSelection(editor, '**');
}

/** Italic: *text* — careful not to conflict with bold (**) */
export function applyItalic(editor: Editor): void {
    const selected = editor.getSelection();
    if (!selected) return;

    if (
        selected.startsWith('*') &&
        selected.endsWith('*') &&
        !selected.startsWith('**') &&
        selected.length > 2
    ) {
        editor.replaceSelection(selected.slice(1, -1));
    } else {
        editor.replaceSelection(`*${selected}*`);
    }
}

/** Strikethrough: ~~text~~ */
export function applyStrikethrough(editor: Editor): void {
    wrapSelection(editor, '~~');
}

/** Inline code: `text` */
export function applyCode(editor: Editor): void {
    wrapSelection(editor, '`');
}

/** Highlight: ==text== */
export function applyHighlight(editor: Editor): void {
    wrapSelection(editor, '==');
}

/** Inline link: [text](url) — toggles between wrapped and plain text */
export function applyLink(editor: Editor): void {
    const selected = editor.getSelection();
    if (!selected) return;

    const linkPattern = /^\[(.+)\]\(.+\)$/;
    const match = selected.match(linkPattern);
    if (match) {
        editor.replaceSelection(match[1]);
    } else {
        editor.replaceSelection(`[${selected}](url)`);
    }
}

/**
 * Apply a heading level (1-4) to the current line, or remove heading if
 * the line already has that level (toggle). Pass 0 to remove any heading.
 */
export function applyHeading(editor: Editor, level: 0 | 1 | 2 | 3 | 4): void {
    const cursor = editor.getCursor('head');
    const lineText = editor.getLine(cursor.line);

    // Strip any existing heading prefix
    const stripped = lineText.replace(/^#{1,6}\s/, '');

    if (level === 0) {
        editor.setLine(cursor.line, stripped);
    } else {
        const prefix = '#'.repeat(level) + ' ';
        // Detect if already at this level — toggle off
        const currentMatch = lineText.match(/^(#{1,6})\s/);
        const currentLevel = currentMatch ? currentMatch[1].length : 0;
        if (currentLevel === level) {
            editor.setLine(cursor.line, stripped);
        } else {
            editor.setLine(cursor.line, prefix + stripped);
        }
    }
}

/**
 * Callout types supported in the dropdown.
 */
export type CalloutType = 'note' | 'tip' | 'warning' | 'important' | 'caution';

/**
 * Wrap selected lines in an Obsidian callout block.
 * If the selection is already a callout, swaps the type.
 * Format:
 *   > [!type]
 *   > line 1
 *   > line 2
 */
export function applyCallout(editor: Editor, type: CalloutType): void {
    const sel = editor.getSelection();
    if (!sel) return;

    const lines = sel.split('\n');

    // Check if already a callout — strip it and rewrap
    const calloutHeader = /^>\s\[![\w]+\]\s*$/;
    const calloutLine   = /^>\s?/;

    const isCallout = lines[0].match(/^>\s\[![\w]+\]/);

    let contentLines: string[];
    if (isCallout) {
        // Unwrap existing callout: skip header line, strip "> " prefix from body
        contentLines = lines
            .slice(1)
            .map(l => l.replace(/^>\s?/, ''));
    } else {
        contentLines = lines;
    }

    const header = `> [!${type}]`;
    const body   = contentLines.map(l => `> ${l}`).join('\n');
    editor.replaceSelection(`${header}\n${body}`);
}

/**
 * Returns the bounding rect of the current DOM text selection,
 * or null if nothing is selected.
 */
export function getSelectionRect(): DOMRect | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return null;
    return rect;
}