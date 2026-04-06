import { Plugin, MarkdownView, Editor, EventRef, PluginSettingTab, App, Setting } from 'obsidian';
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

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface PluginSettings {
    dockedMode: boolean;
    smartUrl:   boolean;
}

const DEFAULT_SETTINGS: PluginSettings = {
    dockedMode: false,
    smartUrl:   false,
};

// ─── Settings tab ─────────────────────────────────────────────────────────────

class FloatySettingTab extends PluginSettingTab {
    plugin: FloatyToolbarPlugin;

    constructor(app: App, plugin: FloatyToolbarPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Floaty Toolbar' });

        // ── Docked Mode ──────────────────────────────────────────────────────
        new Setting(containerEl)
            .setName('Docked mode')
            .setDesc('Pin the toolbar to the top of the editor instead of floating above selections. Reload the plugin after changing this setting.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.dockedMode)
                .onChange(async (value) => {
                    this.plugin.settings.dockedMode = value;
                    await this.plugin.saveSettings();
                    // Tear down and remount with new mode
                    this.plugin.toolbar.destroy();
                })
            );

        // ── Smart URL ────────────────────────────────────────────────────────
        new Setting(containerEl)
            .setName('Smart URL detection')
            .setDesc('When inserting a link, automatically use a URL from your clipboard if one is detected. When disabled, a reminder notice will appear.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.smartUrl)
                .onChange(async (value) => {
                    this.plugin.settings.smartUrl = value;
                    await this.plugin.saveSettings();
                })
            );
    }
}

// ─── Workspace event interface ────────────────────────────────────────────────

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

        // ── Formatting commands ─────────────────────────────────────────────
        this.addCommand({ id: 'floaty-bold',         name: 'Bold',             editorCallback: (e) => applyBold(e) });
        this.addCommand({ id: 'floaty-italic',       name: 'Italic',           editorCallback: (e) => applyItalic(e) });
        this.addCommand({ id: 'floaty-strikethrough',name: 'Strikethrough',    editorCallback: (e) => applyStrikethrough(e) });
        this.addCommand({ id: 'floaty-inline-code',  name: 'Inline Code',      editorCallback: (e) => applyCode(e) });
        this.addCommand({ id: 'floaty-highlight',    name: 'Highlight',        editorCallback: (e) => applyHighlight(e) });
        this.addCommand({ id: 'floaty-insert-link',  name: 'Insert Link',      editorCallback: (e) => applyLink(e, this.settings.smartUrl) });

        // ── Heading commands ────────────────────────────────────────────────
        this.addCommand({ id: 'floaty-heading-1',    name: 'Heading 1',        editorCallback: (e) => applyHeading(e, 1) });
        this.addCommand({ id: 'floaty-heading-2',    name: 'Heading 2',        editorCallback: (e) => applyHeading(e, 2) });
        this.addCommand({ id: 'floaty-heading-3',    name: 'Heading 3',        editorCallback: (e) => applyHeading(e, 3) });
        this.addCommand({ id: 'floaty-heading-4',    name: 'Heading 4',        editorCallback: (e) => applyHeading(e, 4) });
        this.addCommand({ id: 'floaty-heading-plain',name: 'Remove Heading',   editorCallback: (e) => applyHeading(e, 0) });

        // ── Callout commands ────────────────────────────────────────────────
        this.addCommand({ id: 'floaty-callout-note',      name: 'Callout: Note',      editorCallback: (e) => applyCallout(e, 'note') });
        this.addCommand({ id: 'floaty-callout-tip',       name: 'Callout: Tip',       editorCallback: (e) => applyCallout(e, 'tip') });
        this.addCommand({ id: 'floaty-callout-warning',   name: 'Callout: Warning',   editorCallback: (e) => applyCallout(e, 'warning') });
        this.addCommand({ id: 'floaty-callout-important', name: 'Callout: Important', editorCallback: (e) => applyCallout(e, 'important') });
        this.addCommand({ id: 'floaty-callout-caution',   name: 'Callout: Caution',   editorCallback: (e) => applyCallout(e, 'caution') });

        // ── editor-selection-change ─────────────────────────────────────────
        this.registerEvent(
            (this.app.workspace as unknown as WorkspaceWithEvents).on(
                'editor-selection-change',
                (editor: Editor, _view: MarkdownView) => {
                    // In docked mode, always show (toolbar is always mounted)
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
            // In docked mode, never hide on mousedown
            if (this.settings.dockedMode) return;
            this.isDragging = true;
            this.toolbar.hide();
        });

        // ── mouseup ─────────────────────────────────────────────────────────
        this.registerDomEvent(document, 'mouseup', (evt: MouseEvent) => {
            this.isDragging = false;
            this.lastMousePos = { x: evt.clientX, y: evt.clientY };

            if (this.toolbar.contains(evt.target as Node)) return;
            if (this.settings.dockedMode) return; // docked: nothing to do on mouseup

            setTimeout(() => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (!view) { this.toolbar.hide(); return; }

                const clickedInsideEditor = view.contentEl?.contains(evt.target as Node) ?? false;
                if (!clickedInsideEditor) { this.toolbar.hide(); return; }

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

        // ── If docked mode is on at startup, mount immediately ──────────────
        if (this.settings.dockedMode) {
            this.app.workspace.onLayoutReady(() => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (view) this.toolbar.show(view.editor, { x: 0, y: 0 }, this.settings);
            });
        }
    }

    onunload() {
        this.toolbar.destroy();
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}