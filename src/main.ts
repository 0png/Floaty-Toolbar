import { Plugin, MarkdownView, Editor, EventRef, PluginSettingTab, App, Setting } from 'obsidian';
import { FloatyToolbar } from './toolbar';
import {
    applyBold, applyItalic, applyStrikethrough, applyCode,
    applyHighlight, applyLink, applyHeading, applyCallout,
} from './utils';

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface PluginSettings {
    dockedMode: boolean;
}

const DEFAULT_SETTINGS: PluginSettings = {
    dockedMode: false,
};

function getActiveDocument(): Document {
    return window.activeDocument;
}

function getActiveWindow(): Window {
    return window.activeWindow;
}

// ─── Settings tab — dockedMode is toggled via pin button ─────────────────────

class FloatySettingTab extends PluginSettingTab {
    plugin: FloatyToolbarPlugin;
    constructor(app: App, plugin: FloatyToolbarPlugin) { super(app, plugin); this.plugin = plugin; }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('Behavior')
            .setHeading();

        // Read-only indicator for dock mode — user changes it via the pin button
        new Setting(containerEl)
            .setName('Dock mode')
            .setDesc('Toggle between floating and dock mode using the pin icon (📌) inside the toolbar itself.')
            .addToggle(t => t
                .setValue(this.plugin.settings.dockedMode)
                .setDisabled(true)
            );
    }
}

// ─── Workspace event interface ────────────────────────────────────────────────
// `editor-selection-change` is a real Obsidian workspace event but is not
// included in the public TypeScript typings. The cast lets us register it
// without disabling type-checking for the whole file.
interface WorkspaceWithEvents {
    on(name: 'editor-selection-change', callback: (editor: Editor, view: MarkdownView) => void): EventRef;
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export default class FloatyToolbarPlugin extends Plugin {
    toolbar: FloatyToolbar = new FloatyToolbar();
    settings: PluginSettings = { ...DEFAULT_SETTINGS };
    private lastMousePos: { x: number; y: number } = { x: 0, y: 0 };
    private isDragging = false;

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new FloatySettingTab(this.app, this));

        // Wire up pin toggle — instant switch, no reload needed
        this.toolbar.onPinToggle = async (docked: boolean) => {
            this.settings.dockedMode = docked;
            await this.saveSettings();

            if (!docked) {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                const sel = view?.editor.getSelection();
                if (view && sel && sel.length > 0) {
                    // Text is selected — switch straight to floating toolbar
                    this.toolbar.destroy();
                    this.toolbar.show(view.editor, this.lastMousePos, this.settings);
                } else {
                    // Nothing selected — animate dock out, then vanish
                    this.toolbar.destroyDockAnimated(() => {
                        this.toolbar.destroy();
                    });
                }

                return;
            }

            // Tear everything down and remount in dock mode
            this.toolbar.destroy();
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (view) this.toolbar.show(view.editor, { x: 0, y: 0 }, this.settings);
        };

        // ── Commands ────────────────────────────────────────────────────────
        this.addCommand({ id: 'floaty-bold',              name: 'Bold',             editorCallback: (e) => applyBold(e) });
        this.addCommand({ id: 'floaty-italic',            name: 'Italic',           editorCallback: (e) => applyItalic(e) });
        this.addCommand({ id: 'floaty-strikethrough',     name: 'Strikethrough',    editorCallback: (e) => applyStrikethrough(e) });
        this.addCommand({ id: 'floaty-inline-code',       name: 'Inline code',      editorCallback: (e) => applyCode(e) });
        this.addCommand({ id: 'floaty-highlight',         name: 'Highlight',        editorCallback: (e) => applyHighlight(e) });
        this.addCommand({ id: 'floaty-insert-link',       name: 'Insert link',      editorCallback: (e) => applyLink(e) });
        this.addCommand({ id: 'floaty-heading-1',         name: 'Heading 1',        editorCallback: (e) => applyHeading(e, 1) });
        this.addCommand({ id: 'floaty-heading-2',         name: 'Heading 2',        editorCallback: (e) => applyHeading(e, 2) });
        this.addCommand({ id: 'floaty-heading-3',         name: 'Heading 3',        editorCallback: (e) => applyHeading(e, 3) });
        this.addCommand({ id: 'floaty-heading-4',         name: 'Heading 4',        editorCallback: (e) => applyHeading(e, 4) });
        this.addCommand({ id: 'floaty-heading-plain',     name: 'Remove heading',   editorCallback: (e) => applyHeading(e, 0) });
        this.addCommand({ id: 'floaty-callout-note',      name: 'Callout: note',      editorCallback: (e) => applyCallout(e, 'note') });
        this.addCommand({ id: 'floaty-callout-tip',       name: 'Callout: tip',       editorCallback: (e) => applyCallout(e, 'tip') });
        this.addCommand({ id: 'floaty-callout-warning',   name: 'Callout: warning',   editorCallback: (e) => applyCallout(e, 'warning') });
        this.addCommand({ id: 'floaty-callout-important', name: 'Callout: important', editorCallback: (e) => applyCallout(e, 'important') });
        this.addCommand({ id: 'floaty-callout-caution',   name: 'Callout: caution',   editorCallback: (e) => applyCallout(e, 'caution') });

        // ── editor-selection-change ──────────────────────────────────────────
        this.registerEvent(
            (this.app.workspace as unknown as WorkspaceWithEvents).on(
                'editor-selection-change',
                (editor: Editor, _view: MarkdownView) => {
                    if (this.settings.dockedMode) {
                        this.toolbar.show(editor, this.lastMousePos, this.settings);
                        return;
                    }
                    if (this.isDragging) return;
                    const sel = editor.getSelection();
                    if (sel && sel.length > 0) {
                        this.toolbar.show(editor, this.lastMousePos, this.settings);
                    } else {
                        this.toolbar.hide();
                    }
                }
            )
        );

        // ── mousedown ───────────────────────────────────────────────────────
        this.registerDomEvent(getActiveDocument(), 'mousedown', (evt: MouseEvent) => {
            if (this.toolbar.contains(evt.target as Node)) return;
            if (this.settings.dockedMode) return;
            this.isDragging = true;
            this.toolbar.hide();
        });

        // ── mouseup ─────────────────────────────────────────────────────────
        this.registerDomEvent(getActiveDocument(), 'mouseup', (evt: MouseEvent) => {
            this.isDragging = false;
            this.lastMousePos = { x: evt.clientX, y: evt.clientY };

            if (this.toolbar.contains(evt.target as Node)) return;
            if (this.settings.dockedMode) return;

            getActiveWindow().setTimeout(() => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (!view) { this.toolbar.hide(); return; }
                if (!(view.contentEl?.contains(evt.target as Node) ?? false)) { this.toolbar.hide(); return; }
                const sel = view.editor.getSelection();
                if (sel && sel.length > 0) {
                    this.toolbar.show(view.editor, { x: evt.clientX, y: evt.clientY }, this.settings);
                } else {
                    this.toolbar.hide();
                }
            }, 10);
        });

        // ── Escape ──────────────────────────────────────────────────────────
        this.registerDomEvent(getActiveDocument(), 'keydown', (evt: KeyboardEvent) => {
            if (evt.key === 'Escape') this.toolbar.hide();
        });

        // ── Mount dock on startup if setting is saved ────────────────────────
        if (this.settings.dockedMode) {
            this.app.workspace.onLayoutReady(() => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (view) this.toolbar.show(view.editor, { x: 0, y: 0 }, this.settings);
            });
        }
    }

    onunload() { this.toolbar.destroy(); }

    async loadSettings() {
        const data: unknown = await this.loadData();
        const stored = (typeof data === 'object' && data !== null) ? data as Partial<PluginSettings> : {};
        this.settings = Object.assign({}, DEFAULT_SETTINGS, stored);
    }
    async saveSettings() { await this.saveData(this.settings); }
}
