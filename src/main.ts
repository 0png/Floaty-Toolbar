import { Plugin, MarkdownView, Editor, EventRef, PluginSettingTab, App, Setting } from 'obsidian';
import { FloatyToolbar } from './toolbar';
import {
    applyBold, applyItalic, applyStrikethrough, applyCode,
    applyHighlight, applyLink, applyHeading, applyCallout,
} from './utils';

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface PluginSettings {
    dockedMode: boolean;
    smartUrl:   boolean;
}

const DEFAULT_SETTINGS: PluginSettings = {
    dockedMode: false,
    smartUrl:   false,
};

// ─── Settings tab — only smartUrl here, dockedMode is toggled via pin button ──

class FloatySettingTab extends PluginSettingTab {
    plugin: FloatyToolbarPlugin;
    constructor(app: App, plugin: FloatyToolbarPlugin) { super(app, plugin); this.plugin = plugin; }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Floaty Toolbar' });

        new Setting(containerEl)
            .setName('Smart URL detection')
            .setDesc('When inserting a link, automatically paste a URL from your clipboard if one is detected. When disabled, a reminder notice will appear.')
            .addToggle(t => t
                .setValue(this.plugin.settings.smartUrl)
                .onChange(async (v) => { this.plugin.settings.smartUrl = v; await this.plugin.saveSettings(); })
            );

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
            // Tear everything down and remount in the new mode
            this.toolbar.destroy();
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (docked && view) {
                this.toolbar.show(view.editor, { x: 0, y: 0 }, this.settings);
            }
            // In floating mode the toolbar will show on the next selection
        };

        // ── Commands ────────────────────────────────────────────────────────
        this.addCommand({ id: 'floaty-bold',              name: 'Bold',             editorCallback: (e) => applyBold(e) });
        this.addCommand({ id: 'floaty-italic',            name: 'Italic',           editorCallback: (e) => applyItalic(e) });
        this.addCommand({ id: 'floaty-strikethrough',     name: 'Strikethrough',    editorCallback: (e) => applyStrikethrough(e) });
        this.addCommand({ id: 'floaty-inline-code',       name: 'Inline Code',      editorCallback: (e) => applyCode(e) });
        this.addCommand({ id: 'floaty-highlight',         name: 'Highlight',        editorCallback: (e) => applyHighlight(e) });
        this.addCommand({ id: 'floaty-insert-link',       name: 'Insert Link',      editorCallback: (e) => applyLink(e, this.settings.smartUrl) });
        this.addCommand({ id: 'floaty-heading-1',         name: 'Heading 1',        editorCallback: (e) => applyHeading(e, 1) });
        this.addCommand({ id: 'floaty-heading-2',         name: 'Heading 2',        editorCallback: (e) => applyHeading(e, 2) });
        this.addCommand({ id: 'floaty-heading-3',         name: 'Heading 3',        editorCallback: (e) => applyHeading(e, 3) });
        this.addCommand({ id: 'floaty-heading-4',         name: 'Heading 4',        editorCallback: (e) => applyHeading(e, 4) });
        this.addCommand({ id: 'floaty-heading-plain',     name: 'Remove Heading',   editorCallback: (e) => applyHeading(e, 0) });
        this.addCommand({ id: 'floaty-callout-note',      name: 'Callout: Note',      editorCallback: (e) => applyCallout(e, 'note') });
        this.addCommand({ id: 'floaty-callout-tip',       name: 'Callout: Tip',       editorCallback: (e) => applyCallout(e, 'tip') });
        this.addCommand({ id: 'floaty-callout-warning',   name: 'Callout: Warning',   editorCallback: (e) => applyCallout(e, 'warning') });
        this.addCommand({ id: 'floaty-callout-important', name: 'Callout: Important', editorCallback: (e) => applyCallout(e, 'important') });
        this.addCommand({ id: 'floaty-callout-caution',   name: 'Callout: Caution',   editorCallback: (e) => applyCallout(e, 'caution') });

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
        this.registerDomEvent(document, 'mousedown', (evt: MouseEvent) => {
            if (this.toolbar.contains(evt.target as Node)) return;
            if (this.settings.dockedMode) return;
            this.isDragging = true;
            this.toolbar.hide();
        });

        // ── mouseup ─────────────────────────────────────────────────────────
        this.registerDomEvent(document, 'mouseup', (evt: MouseEvent) => {
            this.isDragging = false;
            this.lastMousePos = { x: evt.clientX, y: evt.clientY };

            if (this.toolbar.contains(evt.target as Node)) return;
            if (this.settings.dockedMode) return;

            setTimeout(() => {
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
        this.registerDomEvent(document, 'keydown', (evt: KeyboardEvent) => {
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
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }
    async saveSettings() { await this.saveData(this.settings); }
}