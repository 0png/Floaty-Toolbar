import { Plugin, MarkdownView, Editor, EventRef } from 'obsidian';

interface WorkspaceWithEvents {
    on(name: 'editor-selection-change', callback: (editor: Editor, view: MarkdownView) => void): EventRef;
}
import { FloatyToolbar } from './toolbar';
import {
    applyBold,
    applyItalic,
    applyStrikethrough,
    applyCode,
    applyHighlight,
    applyLink,
} from './utils';

export default class FloatyToolbarPlugin extends Plugin {
    private toolbar: FloatyToolbar = new FloatyToolbar();
    private lastMousePos: { x: number; y: number } = { x: 0, y: 0 };
    private isDragging = false;

    async onload() {
        // ── Commands (appear in Settings → Hotkeys, fully user-assignable) ───
        this.addCommand({
            id: 'floaty-bold',
            name: 'Bold',
            editorCallback: (editor: Editor) => applyBold(editor),
        });

        this.addCommand({
            id: 'floaty-italic',
            name: 'Italic',
            editorCallback: (editor: Editor) => applyItalic(editor),
        });

        this.addCommand({
            id: 'floaty-strikethrough',
            name: 'Strikethrough',
            editorCallback: (editor: Editor) => applyStrikethrough(editor),
        });

        this.addCommand({
            id: 'floaty-inline-code',
            name: 'Inline Code',
            editorCallback: (editor: Editor) => applyCode(editor),
        });

        this.addCommand({
            id: 'floaty-highlight',
            name: 'Highlight',
            editorCallback: (editor: Editor) => applyHighlight(editor),
        });

        this.addCommand({
            id: 'floaty-insert-link',
            name: 'Insert Link',
            editorCallback: (editor: Editor) => applyLink(editor),
        });

        // ── editor-selection-change (keyboard selections) ─────────────────────
        this.registerEvent(
            (this.app.workspace as unknown as WorkspaceWithEvents).on(
                'editor-selection-change',
                (editor: Editor, _view: MarkdownView) => {
                    const sel = editor.getSelection();

                    if (this.isDragging) {
                        return;
                    }

                    if (sel && sel.length > 0) {
                        this.toolbar.show(editor, this.lastMousePos);
                    } else {
                        this.toolbar.hide();
                    }
                }
            )
        );

        // ── mousedown ─────────────────────────────────────────────────────────
        this.registerDomEvent(document, 'mousedown', (evt: MouseEvent) => {
            if (this.toolbar.contains(evt.target as Node)) {
                return;
            }
            this.isDragging = true;
        });

        // ── mouseup ───────────────────────────────────────────────────────────
        this.registerDomEvent(document, 'mouseup', (evt: MouseEvent) => {
            this.isDragging = false;
            this.lastMousePos = { x: evt.clientX, y: evt.clientY };

            if (this.toolbar.contains(evt.target as Node)) {
                return;
            }

            setTimeout(() => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (!view) {
                    this.toolbar.hide();
                    return;
                }

                const sel = view.editor.getSelection();

                if (sel && sel.length > 0) {
                    this.toolbar.show(view.editor, { x: evt.clientX, y: evt.clientY });
                } else {
                    this.toolbar.hide();
                }
            }, 10);
        });

        // ── Escape ────────────────────────────────────────────────────────────
        this.registerDomEvent(document, 'keydown', (evt: KeyboardEvent) => {
            if (evt.key === 'Escape') {
                this.toolbar.hide();
            }
        });
    }

    onunload() {
        this.toolbar.hide();
    }
}