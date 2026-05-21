import { Plugin, MarkdownView, Editor, EventRef, PluginSettingTab, App, Setting, setIcon } from 'obsidian';
import { FloatyToolbar, DEFAULT_BUTTON_ORDER, ToolbarItemId } from './toolbar';
import { FloatyHud } from './hud';
import {
    applyBold, applyItalic, applyStrikethrough, applyCode,
    applyHighlight, applyLink, applyHeading, applyCallout,
} from './utils';

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface PluginSettings {
    dockedMode: boolean;
    smartUrl: boolean;
    buttonOrder: ToolbarItemId[];
}

const DEFAULT_SETTINGS: PluginSettings = {
    dockedMode: false,
    smartUrl: false,
    buttonOrder: [...DEFAULT_BUTTON_ORDER],
};

function getActiveDocument(): Document {
    return window.activeDocument;
}

function getActiveWindow(): Window {
    return window.activeWindow;
}

// ─── Settings tab ─────────────────────────────────────────────────────────────

class FloatySettingTab extends PluginSettingTab {
    plugin: FloatyToolbarPlugin;
    constructor(app: App, plugin: FloatyToolbarPlugin) { super(app, plugin); this.plugin = plugin; }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('Smart URL detection')
            .setDesc('When inserting a link, automatically paste a URL from your clipboard if one is detected.')
            .addToggle(t => t
                .setValue(this.plugin.settings.smartUrl)
                .onChange(async (v) => {
                    this.plugin.settings.smartUrl = v;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('Dock mode')
            .setDesc('Toggle between floating and dock mode using the pin icon (📌) inside the toolbar itself.')
            .addToggle(t => t
                .setValue(this.plugin.settings.dockedMode)
                .setDisabled(true)
            );

        new Setting(containerEl)
            .setName('Toolbar button order')
            .setHeading();
        containerEl.createEl('p', {
            text: 'Drag to reorder. You can also long-press any button in the toolbar itself to drag it.',
            cls: 'setting-item-description',
        });

        const listEl = containerEl.createEl('div', { cls: 'floaty-settings-order-list' });
        this.renderOrderList(listEl);

        new Setting(containerEl)
            .addButton(btn => btn
                .setButtonText('Reset to default')
                .onClick(async () => {
                    this.plugin.settings.buttonOrder = [...DEFAULT_BUTTON_ORDER];
                    await this.plugin.saveSettings();
                    this.renderOrderList(listEl);
                })
            );
    }

    private renderOrderList(listEl: HTMLElement): void {
        listEl.empty();
        const order = this.plugin.settings.buttonOrder;

        const labels: Record<ToolbarItemId, string> = {
            bold: 'Bold',
            italic: 'Italic',
            strikethrough: 'Strikethrough',
            code: 'Inline Code',
            highlight: 'Highlight',
            link: 'Insert Link',
            heading: 'Heading',
            callout: 'Callout',
        };
        const icons: Record<ToolbarItemId, string> = {
            bold: 'bold',
            italic: 'italic',
            strikethrough: 'strikethrough',
            code: 'code',
            highlight: 'highlighter',
            link: 'link',
            heading: 'heading-1',
            callout: 'quote-glyph',
        };

        let dragSrc: HTMLElement | null = null;

        for (const id of order) {
            const row = listEl.createEl('div', { cls: 'floaty-settings-order-row', attr: { draggable: 'true' } });

            const handle = row.createEl('span', { cls: 'floaty-settings-drag-handle' });
            setIcon(handle, 'grip-vertical');

            const iconEl = row.createEl('span', { cls: 'floaty-settings-item-icon' });
            setIcon(iconEl, icons[id] ?? 'circle');

            row.createEl('span', { cls: 'floaty-settings-item-label', text: labels[id] ?? id });

            row.addEventListener('dragstart', () => {
                dragSrc = row;
                setTimeout(() => row.addClass('floaty-settings-dragging'), 0);
            });
            row.addEventListener('dragend', () => {
                row.removeClass('floaty-settings-dragging');
                listEl.querySelectorAll<HTMLElement>('.floaty-settings-drag-over')
                    .forEach(el => el.removeClass('floaty-settings-drag-over'));
                dragSrc = null;
            });
            row.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (dragSrc && dragSrc !== row) row.addClass('floaty-settings-drag-over');
            });
            row.addEventListener('dragleave', () => row.removeClass('floaty-settings-drag-over'));
            row.addEventListener('drop', (e) => {
                void (async () => {
                    e.preventDefault();
                    row.removeClass('floaty-settings-drag-over');
                    if (!dragSrc || dragSrc === row) return;

                    const srcLabel = dragSrc.querySelector<HTMLElement>('.floaty-settings-item-label')?.textContent;
                    const dstLabel = row.querySelector<HTMLElement>('.floaty-settings-item-label')?.textContent;
                    const srcKey = (Object.keys(labels) as ToolbarItemId[]).find(k => labels[k] === srcLabel);
                    const dstKey = (Object.keys(labels) as ToolbarItemId[]).find(k => labels[k] === dstLabel);

                    if (!srcKey || !dstKey) return;

                    const arr = [...this.plugin.settings.buttonOrder];
                    const fi = arr.indexOf(srcKey);
                    const ti = arr.indexOf(dstKey);
                    if (fi === -1 || ti === -1) return;
                    arr.splice(fi, 1);
                    arr.splice(ti, 0, srcKey);
                    this.plugin.settings.buttonOrder = arr;
                    await this.plugin.saveSettings();
                    this.renderOrderList(listEl);
                })();
            });
        }
    }
}

// ─── Workspace event interface ────────────────────────────────────────────────

interface WorkspaceWithEvents {
    on(name: 'editor-selection-change', callback: (editor: Editor, view: MarkdownView) => void): EventRef;
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export default class FloatyToolbarPlugin extends Plugin {
    toolbar: FloatyToolbar = new FloatyToolbar();
    hud!: FloatyHud;
    settings: PluginSettings = { ...DEFAULT_SETTINGS };
    private lastMousePos: { x: number; y: number } = { x: 0, y: 0 };
    private isDragging = false;

    async onload() {
        await this.loadSettings();
        this.hud = new FloatyHud(this);
        this.hud.mount();
        this.toolbar.hud = this.hud;
        this.addSettingTab(new FloatySettingTab(this.app, this));

        this.toolbar.onButtonReorder = (newOrder: ToolbarItemId[]) => {
            void (async () => {
                this.settings.buttonOrder = newOrder;
                await this.saveSettings();
                if (this.settings.dockedMode) {
                    this.toolbar.destroy();
                    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                    if (view) this.toolbar.show(view.editor, { x: 0, y: 0 }, this.settings);
                }
            })();
        };

        this.toolbar.onPinToggle = (docked: boolean) => {
            void (async () => {
                this.settings.dockedMode = docked;
                await this.saveSettings();

                if (!docked) {
                    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                    const sel = view?.editor.getSelection();
                    if (view && sel && sel.length > 0) {
                        this.toolbar.destroy();
                        this.toolbar.show(view.editor, this.lastMousePos, this.settings);
                    } else {
                        this.toolbar.destroyDockAnimated(() => { this.toolbar.destroy(); });
                    }
                } else {
                    this.toolbar.destroy();
                    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                    if (view) this.toolbar.show(view.editor, { x: 0, y: 0 }, this.settings);
                }
            })();
        };

        this.addCommand({ id: 'floaty-bold',              name: 'Bold',               editorCallback: (e) => applyBold(e) });
        this.addCommand({ id: 'floaty-italic',            name: 'Italic',             editorCallback: (e) => applyItalic(e) });
        this.addCommand({ id: 'floaty-strikethrough',     name: 'Strikethrough',      editorCallback: (e) => applyStrikethrough(e) });
        this.addCommand({ id: 'floaty-inline-code',       name: 'Inline code',        editorCallback: (e) => applyCode(e) });
        this.addCommand({ id: 'floaty-highlight',         name: 'Highlight',          editorCallback: (e) => applyHighlight(e) });
        this.addCommand({ id: 'floaty-insert-link',       name: 'Insert link',        editorCallback: (e) => { void applyLink(e, this.settings.smartUrl); } });
        this.addCommand({ id: 'floaty-heading-1',         name: 'Heading 1',          editorCallback: (e) => applyHeading(e, 1) });
        this.addCommand({ id: 'floaty-heading-2',         name: 'Heading 2',          editorCallback: (e) => applyHeading(e, 2) });
        this.addCommand({ id: 'floaty-heading-3',         name: 'Heading 3',          editorCallback: (e) => applyHeading(e, 3) });
        this.addCommand({ id: 'floaty-heading-4',         name: 'Heading 4',          editorCallback: (e) => applyHeading(e, 4) });
        this.addCommand({ id: 'floaty-heading-plain',     name: 'Remove heading',     editorCallback: (e) => applyHeading(e, 0) });
        this.addCommand({ id: 'floaty-callout-note',      name: 'Callout: note',      editorCallback: (e) => applyCallout(e, 'note') });
        this.addCommand({ id: 'floaty-callout-tip',       name: 'Callout: tip',       editorCallback: (e) => applyCallout(e, 'tip') });
        this.addCommand({ id: 'floaty-callout-warning',   name: 'Callout: warning',   editorCallback: (e) => applyCallout(e, 'warning') });
        this.addCommand({ id: 'floaty-callout-important', name: 'Callout: important', editorCallback: (e) => applyCallout(e, 'important') });
        this.addCommand({ id: 'floaty-callout-caution',   name: 'Callout: caution',   editorCallback: (e) => applyCallout(e, 'caution') });

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

        this.registerDomEvent(getActiveDocument(), 'mousedown', (evt: MouseEvent) => {
            if (this.toolbar.contains(evt.target as Node)) return;
            if (this.settings.dockedMode) return;
            this.isDragging = true;
            this.toolbar.hide();
        });

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

        this.registerDomEvent(getActiveDocument(), 'keydown', (evt: KeyboardEvent) => {
            if (evt.key === 'Escape') this.toolbar.hide();
        });

        this.registerDomEvent(getActiveWindow(), 'wheel', () => {
            if (this.settings.dockedMode) return;
            this.toolbar.hide();
        }, { passive: true });

        if (this.settings.dockedMode) {
            this.app.workspace.onLayoutReady(() => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (view) this.toolbar.show(view.editor, { x: 0, y: 0 }, this.settings);
            });
        }
    }

    onunload() {
        this.toolbar.destroy();
        this.hud.destroy();
    }

    async loadSettings() {
        const data: unknown = await this.loadData();
        const stored = (typeof data === 'object' && data !== null) ? data as Partial<PluginSettings> : {};
        this.settings = Object.assign({}, DEFAULT_SETTINGS, stored);

        const saved = new Set(this.settings.buttonOrder);
        for (const id of DEFAULT_BUTTON_ORDER) {
            if (!saved.has(id)) this.settings.buttonOrder.push(id);
        }
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}
