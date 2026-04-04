import { Editor } from 'obsidian';

/**
 * Wraps the current selection with a prefix and optional suffix.
 * If prefix === suffix (e.g. "**") pass only prefix.
 */
export function wrapSelection(editor: Editor, prefix: string, suffix?: string): void {
    const selected = editor.getSelection();
    const _suffix = suffix ?? prefix;

    // If already wrapped — unwrap it
    if (selected.startsWith(prefix) && selected.endsWith(_suffix)) {
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

/** Italic: *text* */
export function applyItalic(editor: Editor): void {
    wrapSelection(editor, '*');
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

/** Inline link: [text](url) */
export function applyLink(editor: Editor): void {
    const selected = editor.getSelection();
    if (selected) {
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
    // getBoundingClientRect returns an empty rect when selection is collapsed
    if (rect.width === 0 && rect.height === 0) return null;
    return rect;
}
