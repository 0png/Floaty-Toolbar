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
    applyHeading,
    applyCallout,
} from './utils';

export default class FloatyToolbarPlugin extends Plugin {
    private toolbar: FloatyToolbar = new FloatyToolbar();
    private lastMousePos: { x: number; y: number } = { x: 0, y: 0 };
    private isDragging = false;

    async onload() {

        // ── Formatting commands ───────────────────────────────────────────────
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

        // ── Heading commands (H1–H4 + plain) ─────────────────────────────────
        this.addCommand({
            id: 'floaty-heading-1',
            name: 'Heading 1',
            editorCallback: (editor: Editor) => applyHeading(editor, 1),
        });
        this.addCommand({
            id: 'floaty-heading-2',
            name: 'Heading 2',
            editorCallback: (editor: Editor) => applyHeading(editor, 2),
        });
        this.addCommand({
            id: 'floaty-heading-3',
            name: 'Heading 3',
            editorCallback: (editor: Editor) => applyHeading(editor, 3),
        });
        this.addCommand({
            id: 'floaty-heading-4',
            name: 'Heading 4',
            editorCallback: (editor: Editor) => applyHeading(editor, 4),
        });
        this.addCommand({
            id: 'floaty-heading-plain',
            name: 'Remove Heading',
            editorCallback: (editor: Editor) => applyHeading(editor, 0),
        });

        // ── Callout commands ──────────────────────────────────────────────────
        this.addCommand({
            id: 'floaty-callout-note',
            name: 'Callout: Note',
            editorCallback: (editor: Editor) => applyCallout(editor, 'note'),
        });
        this.addCommand({
            id: 'floaty-callout-tip',
            name: 'Callout: Tip',
            editorCallback: (editor: Editor) => applyCallout(editor, 'tip'),
        });
        this.addCommand({
            id: 'floaty-callout-warning',
            name: 'Callout: Warning',
            editorCallback: (editor: Editor) => applyCallout(editor, 'warning'),
        });
        this.addCommand({
            id: 'floaty-callout-important',
            name: 'Callout: Important',
            editorCallback: (editor: Editor) => applyCallout(editor, 'important'),
        });
        this.addCommand({
            id: 'floaty-callout-caution',
            name: 'Callout: Caution',
            editorCallback: (editor: Editor) => applyCallout(editor, 'caution'),
        });

        // ── editor-selection-change ───────────────────────────────────────────
        this.registerEvent(
            (this.app.workspace as unknown as WorkspaceWithEvents).on(
                'editor-selection-change',
                (editor: Editor, _view: MarkdownView) => {
                    if (this.isDragging) return;
                    const sel = editor.getSelection();
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
            if (this.toolbar.contains(evt.target as Node)) return;
            this.isDragging = true;
            this.toolbar.hide();
        });

        // ── mouseup ───────────────────────────────────────────────────────────
        this.registerDomEvent(document, 'mouseup', (evt: MouseEvent) => {
            this.isDragging = false;
            this.lastMousePos = { x: evt.clientX, y: evt.clientY };

            if (this.toolbar.contains(evt.target as Node)) return;

            setTimeout(() => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (!view) { this.toolbar.hide(); return; }

                const editorEl = view.contentEl;
                const clickedInsideEditor = editorEl?.contains(evt.target as Node) ?? false;
                if (!clickedInsideEditor) { this.toolbar.hide(); return; }

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
            if (evt.key === 'Escape') this.toolbar.hide();
        });
    }

    onunload() {
        this.toolbar.hide();
    }
}