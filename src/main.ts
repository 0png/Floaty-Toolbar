import { Plugin, MarkdownView } from 'obsidian';
import { FloatyToolbar } from './toolbar';

export default class FloatyToolbarPlugin extends Plugin {
    private toolbar: FloatyToolbar = new FloatyToolbar();

    async onload() {
        console.log('Floaty Toolbar: loaded ✅');

        // Show / hide toolbar when the selection changes inside the editor
        this.registerDomEvent(document, 'mouseup', this.onMouseUp.bind(this));
        this.registerDomEvent(document, 'keyup',   this.onKeyUp.bind(this));

        // Hide when the user clicks outside the toolbar
        this.registerDomEvent(document, 'mousedown', (evt: MouseEvent) => {
            if (!this.toolbar.contains(evt.target as Node)) {
                this.toolbar.hide();
            }
        });

        // Hide on Escape
        this.registerDomEvent(document, 'keydown', (evt: KeyboardEvent) => {
            if (evt.key === 'Escape') {
                this.toolbar.hide();
            }
        });
    }

    onunload() {
        this.toolbar.hide();
        console.log('Floaty Toolbar: unloaded');
    }

    // ─── Private handlers ────────────────────────────────────────────────────────

    private onMouseUp(_evt: MouseEvent): void {
        // Small delay so the DOM selection is finalised before we query it
        setTimeout(() => this.updateToolbar(), 10);
    }

    private onKeyUp(evt: KeyboardEvent): void {
        // Only care about arrow / shift keys that extend a selection
        const selectionKeys = ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'];
        if (evt.shiftKey || selectionKeys.includes(evt.key)) {
            this.updateToolbar();
        }
    }

    private updateToolbar(): void {
        const editor = this.getActiveEditor();
        if (!editor) {
            this.toolbar.hide();
            return;
        }

        const selection = editor.getSelection();
        if (selection && selection.length > 0) {
            this.toolbar.show(editor);
        } else {
            this.toolbar.hide();
        }
    }

    private getActiveEditor() {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        return view?.editor ?? null;
    }
}
