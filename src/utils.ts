import { Editor } from 'obsidian';

/**
 * Wraps the current selection with a prefix and optional suffix.
 * Handles unwrapping correctly, including edge cases like * vs **
 */
export function wrapSelection(editor: Editor, prefix: string, suffix?: string): void {
    const selected = editor.getSelection();
    const _suffix = suffix ?? prefix;

    // Guard: nothing selected
    if (!selected) return;

    // Check for exact wrap — must start with prefix AND end with suffix,
    // and the inner content must be non-empty (avoids stripping half of **)
    const isWrapped =
        selected.length > prefix.length + _suffix.length &&
        selected.startsWith(prefix) &&
        selected.endsWith(_suffix) &&
        // Extra guard: make sure we're not consuming a longer delimiter.
        // e.g. for italic (*), don't unwrap if the text is actually **bold**
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

    // Unwrap italic only when wrapped in single * (not **)
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

    // Unwrap [text](url) pattern
    const linkPattern = /^\[(.+)\]\(.+\)$/;
    const match = selected.match(linkPattern);
    if (match) {
        editor.replaceSelection(match[1]);
    } else {
        editor.replaceSelection(`[${selected}](url)`);
    }
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