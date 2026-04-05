import { Plugin, MarkdownView, Editor } from 'obsidian';
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
        console.log('[FloatyToolbar] Plugin loaded');

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
            (this.app.workspace as any).on(
                'editor-selection-change',
                (editor: Editor, _view: MarkdownView) => {
                    const sel = editor.getSelection();
                    console.log('[FloatyToolbar] editor-selection-change | isDragging:', this.isDragging, '| sel:', JSON.stringify(sel));

                    if (this.isDragging) {
                        console.log('[FloatyToolbar] -> skipping (drag in progress)');
                        return;
                    }

                    if (sel && sel.length > 0) {
                        console.log('[FloatyToolbar] -> show() from selection-change');
                        this.toolbar.show(editor, this.lastMousePos);
                    } else {
                        console.log('[FloatyToolbar] -> hide() from selection-change');
                        this.toolbar.hide();
                    }
                }
            )
        );

        // ── mousedown ─────────────────────────────────────────────────────────
        this.registerDomEvent(document, 'mousedown', (evt: MouseEvent) => {
            if (this.toolbar.contains(evt.target as Node)) {
                console.log('[FloatyToolbar] mousedown inside toolbar — ignoring');
                return;
            }
            console.log('[FloatyToolbar] mousedown — isDragging = true');
            this.isDragging = true;
        });

        // ── mouseup ───────────────────────────────────────────────────────────
        this.registerDomEvent(document, 'mouseup', (evt: MouseEvent) => {
            this.isDragging = false;
            this.lastMousePos = { x: evt.clientX, y: evt.clientY };
            console.log('[FloatyToolbar] mouseup at', evt.clientX, evt.clientY);

            if (this.toolbar.contains(evt.target as Node)) {
                console.log('[FloatyToolbar] mouseup inside toolbar — ignoring');
                return;
            }

            setTimeout(() => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (!view) {
                    console.log('[FloatyToolbar] mouseup timeout — no active MarkdownView');
                    this.toolbar.hide();
                    return;
                }

                const sel = view.editor.getSelection();
                console.log('[FloatyToolbar] mouseup timeout — sel:', JSON.stringify(sel));

                if (sel && sel.length > 0) {
                    console.log('[FloatyToolbar] -> show() from mouseup');
                    this.toolbar.show(view.editor, { x: evt.clientX, y: evt.clientY });
                } else {
                    console.log('[FloatyToolbar] -> hide() from mouseup');
                    this.toolbar.hide();
                }
            }, 10);
        });

        // ── Escape ────────────────────────────────────────────────────────────
        this.registerDomEvent(document, 'keydown', (evt: KeyboardEvent) => {
            if (evt.key === 'Escape') {
                console.log('[FloatyToolbar] Escape — hiding');
                this.toolbar.hide();
            }
        });
    }

    onunload() {
        this.toolbar.hide();
    }
}