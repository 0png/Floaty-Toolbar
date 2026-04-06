import { Editor, setIcon } from 'obsidian';
import {
    applyBold,
    applyItalic,
    applyStrikethrough,
    applyCode,
    applyHighlight,
    applyLink,
    applyHeading,
    applyCallout,
    getSelectionRect,
    CalloutType,
} from './utils';
import type { PluginSettings } from './main';

interface IconAction {
    icon: string;
    tooltip: string;
    action: (editor: Editor, settings: PluginSettings) => void | Promise<void>;
}

const ACTIONS: IconAction[] = [
    { icon: 'bold',          tooltip: 'Bold',          action: (e) => applyBold(e) },
    { icon: 'italic',        tooltip: 'Italic',        action: (e) => applyItalic(e) },
    { icon: 'strikethrough', tooltip: 'Strikethrough', action: (e) => applyStrikethrough(e) },
    { icon: 'code',          tooltip: 'Inline Code',   action: (e) => applyCode(e) },
    { icon: 'highlighter',   tooltip: 'Highlight',     action: (e) => applyHighlight(e) },
    { icon: 'link',          tooltip: 'Insert Link',   action: (e, s) => applyLink(e, s.smartUrl) },
];

const HEADING_OPTIONS: { label: string; level: 0 | 1 | 2 | 3 | 4 }[] = [
    { label: 'H1', level: 1 },
    { label: 'H2', level: 2 },
    { label: 'H3', level: 3 },
    { label: 'H4', level: 4 },
    { label: 'Plain', level: 0 },
];

const CALLOUT_OPTIONS: { label: string; type: CalloutType; icon: string }[] = [
    { label: 'Note',      type: 'note',      icon: 'info' },
    { label: 'Tip',       type: 'tip',       icon: 'lightbulb' },
    { label: 'Warning',   type: 'warning',   icon: 'alert-triangle' },
    { label: 'Important', type: 'important', icon: 'alert-circle' },
    { label: 'Caution',   type: 'caution',   icon: 'flame' },
];

const TOOLBAR_W_ESTIMATE = 380;
const TOOLBAR_H_ESTIMATE = 44;
const GAP = 10;

// ─── SVG helper ──────────────────────────────────────────────────────────────

function createChevronSvg(): SVGSVGElement {
    const NS  = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg') as SVGSVGElement;
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.classList.add('floaty-chevron');
    const path = document.createElementNS(NS, 'path') as SVGPathElement;
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('d', 'M6 9l6 6 6-6');
    svg.appendChild(path);
    return svg;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function ensureStyles(): void {
    if (document.getElementById('floaty-toolbar-styles')) return;
    const style = document.createElement('style');
    style.id = 'floaty-toolbar-styles';
    style.textContent = `
        @keyframes floaty-in {
            0%   { opacity: 0; transform: translateY(6px) scale(0.97); }
            60%  { opacity: 1; transform: translateY(-1px) scale(1.005); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes floaty-out {
            0%   { opacity: 1; transform: translateY(0) scale(1); }
            100% { opacity: 0; transform: translateY(4px) scale(0.97); }
        }
        @keyframes floaty-dropdown-in {
            0%   { opacity: 0; transform: translateY(4px) scale(0.96); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
        }

        /* ── Floating toolbar ──────────────────────────────────────────────── */
        .floaty-toolbar {
            position: fixed !important;
            z-index: 9999 !important;
            display: flex !important;
            align-items: center;
            gap: 1px;
            padding: 4px 6px;
            background: var(--background-floating, var(--background-primary));
            color: var(--text-normal);
            border: 1px solid var(--divider-color);
            border-radius: var(--radius-m);
            box-shadow:
                0 4px 16px rgba(0,0,0,0.25),
                0 1px 4px rgba(0,0,0,0.15),
                0 0 0 1px var(--background-modifier-border);
            opacity: 0;
            pointer-events: none;
            transition: left 80ms ease, top 80ms ease;
        }
        .floaty-toolbar.is-active {
            pointer-events: auto !important;
            animation: floaty-in 200ms cubic-bezier(0.25,1,0.5,1) forwards !important;
        }
        .floaty-toolbar.is-hiding {
            pointer-events: none !important;
            animation: floaty-out 160ms cubic-bezier(0.4,0,1,1) forwards !important;
        }

        /* ── Docked toolbar ────────────────────────────────────────────────── */
        .floaty-toolbar-docked {
            position: sticky !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            z-index: 100 !important;
            display: flex !important;
            align-items: center;
            gap: 1px;
            padding: 4px 8px;
            background: var(--background-primary);
            border-bottom: 1px solid var(--divider-color);
            box-shadow: 0 1px 4px rgba(0,0,0,0.08);
            opacity: 1 !important;
            pointer-events: auto !important;
            /* No animation — always visible */
        }

        /* ── Divider ───────────────────────────────────────────────────────── */
        .floaty-divider {
            width: 1px;
            height: 18px;
            background: var(--divider-color);
            margin: 0 3px;
            flex-shrink: 0;
            border-radius: 1px;
        }

        /* ── Action buttons ────────────────────────────────────────────────── */
        .floaty-action-item {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            border-radius: var(--radius-s);
            cursor: pointer;
            color: var(--text-muted);
            transition: background 100ms ease, color 100ms ease, transform 100ms ease;
        }
        .floaty-action-item:hover {
            background: var(--background-modifier-hover);
            color: var(--text-normal);
        }
        .floaty-action-item:active { transform: scale(0.88); background: var(--background-modifier-active-hover); color: var(--text-normal); }
        .floaty-action-item:focus-visible { outline: 2px solid var(--interactive-accent); outline-offset: -2px; }
        .floaty-action-item svg { width: 16px; height: 16px; pointer-events: none; stroke-width: 2px; }

        /* ── Dropdown trigger buttons ──────────────────────────────────────── */
        .floaty-dropdown-trigger {
            display: flex;
            align-items: center;
            gap: 3px;
            padding: 0 7px;
            height: 32px;
            border-radius: var(--radius-s);
            cursor: pointer;
            color: var(--text-muted);
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 0.01em;
            font-family: var(--font-interface);
            white-space: nowrap;
            transition: background 100ms ease, color 100ms ease;
            user-select: none;
        }
        .floaty-dropdown-trigger:hover { background: var(--background-modifier-hover); color: var(--text-normal); }
        .floaty-dropdown-trigger.is-open { background: var(--background-modifier-hover); color: var(--text-normal); }
        .floaty-dropdown-trigger:focus-visible { outline: 2px solid var(--interactive-accent); outline-offset: -2px; }
        .floaty-dropdown-trigger svg { width: 14px; height: 14px; pointer-events: none; stroke-width: 2px; flex-shrink: 0; }
        .floaty-dropdown-trigger .floaty-chevron { width: 10px; height: 10px; opacity: 0.5; transition: transform 150ms ease, opacity 150ms ease; }
        .floaty-dropdown-trigger.is-open .floaty-chevron { transform: rotate(180deg); opacity: 0.8; }

        /* ── Dropdown panel ────────────────────────────────────────────────── */
        .floaty-dropdown {
            position: fixed;
            z-index: 10000;
            min-width: 130px;
            padding: 4px;
            background: var(--background-floating, var(--background-primary));
            border: 1px solid var(--divider-color);
            border-radius: var(--radius-m);
            box-shadow: 0 8px 24px rgba(0,0,0,0.2), 0 2px 8px rgba(0,0,0,0.12), 0 0 0 1px var(--background-modifier-border);
            animation: floaty-dropdown-in 150ms cubic-bezier(0.25,1,0.5,1) forwards;
        }
        .floaty-dropdown-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 10px;
            border-radius: var(--radius-s);
            cursor: pointer;
            color: var(--text-muted);
            font-size: 13px;
            font-family: var(--font-interface);
            transition: background 80ms ease, color 80ms ease;
            user-select: none;
        }
        .floaty-dropdown-item:hover { background: var(--background-modifier-hover); color: var(--text-normal); }
        .floaty-dropdown-item:active { background: var(--background-modifier-active-hover); }
        .floaty-dropdown-item svg { width: 14px; height: 14px; flex-shrink: 0; stroke-width: 2px; color: var(--text-faint); }
        .floaty-dropdown-item:hover svg { color: var(--text-muted); }

        .floaty-heading-badge {
            display: inline-flex; align-items: center; justify-content: center;
            width: 24px; height: 20px; border-radius: 4px;
            background: var(--background-modifier-hover);
            color: var(--text-normal);
            font-size: 11px; font-weight: 700; font-family: var(--font-monospace); flex-shrink: 0;
        }
        .floaty-dropdown-item:hover .floaty-heading-badge { background: var(--interactive-accent); color: var(--text-on-accent); }
        .floaty-heading-plain { font-size: 12px; color: var(--text-faint); }

        .floaty-callout-icon-note      { color: var(--color-blue); }
        .floaty-callout-icon-tip       { color: var(--color-green); }
        .floaty-callout-icon-warning   { color: var(--color-yellow); }
        .floaty-callout-icon-important { color: var(--color-purple); }
        .floaty-callout-icon-caution   { color: var(--color-red); }
    `;
    document.head.appendChild(style);
}

// ─── FloatyToolbar class ──────────────────────────────────────────────────────

export class FloatyToolbar {
    /** Floating mode: the popup element */
    private containerEl: HTMLElement | null = null;
    private hideTimer: ReturnType<typeof setTimeout> | null = null;

    /** Docked mode: the persistent bar element */
    private dockedEl: HTMLElement | null = null;
    /** The .cm-editor container the docked bar is mounted inside */
    private dockedParent: HTMLElement | null = null;

    /** Currently open dropdown */
    private openDropdown: HTMLElement | null = null;

    // ── Public API ──────────────────────────────────────────────────────────

    show(editor: Editor, mouse: { x: number; y: number }, settings: PluginSettings): void {
        ensureStyles();

        if (settings.dockedMode) {
            this.showDocked(editor, settings);
        } else {
            this.showFloating(editor, mouse, settings);
        }
    }

    hide(): void {
        this.closeDropdown();
        // Floating hide
        this.hideFloating();
        // Docked: just leave it mounted (it's always visible in docked mode)
    }

    /** Full teardown — called on plugin unload */
    destroy(): void {
        this.closeDropdown();
        this.hideFloating();
        this.dockedEl?.remove();
        this.dockedEl   = null;
        this.dockedParent = null;
    }

    contains(node: Node): boolean {
        return (
            (this.containerEl?.contains(node) ?? false) ||
            (this.dockedEl?.contains(node)    ?? false) ||
            (this.openDropdown?.contains(node) ?? false)
        );
    }

    // ── Docked mode ─────────────────────────────────────────────────────────

    private showDocked(editor: Editor, settings: PluginSettings): void {
        // Find the CodeMirror editor DOM container
        const cmEditor = (editor as any).cm?.dom as HTMLElement | undefined;
        const parent   = cmEditor?.closest('.cm-editor') as HTMLElement | null
                      ?? cmEditor?.parentElement as HTMLElement | null;

        if (!parent) return;

        // If already mounted in the same parent, just update editor ref
        if (this.dockedEl && this.dockedParent === parent) {
            this.rebuildDockedButtons(editor, settings);
            return;
        }

        // Remove old docked bar if it was in a different editor pane
        this.dockedEl?.remove();

        const bar = document.createElement('div');
        bar.className = 'floaty-toolbar-docked';
        this.dockedEl     = bar;
        this.dockedParent = parent;

        this.buildToolbarContent(bar, editor, settings);
        this.setupKeyboardNav(bar);

        // Insert at the very top of the editor container
        parent.insertBefore(bar, parent.firstChild);
    }

    /** Rebuild buttons in docked bar when editor changes (e.g. tab switch) */
    private rebuildDockedButtons(editor: Editor, settings: PluginSettings): void {
        if (!this.dockedEl) return;
        this.dockedEl.empty();
        this.buildToolbarContent(this.dockedEl, editor, settings);
        this.setupKeyboardNav(this.dockedEl);
    }

    // ── Floating mode ────────────────────────────────────────────────────────

    private showFloating(editor: Editor, mouse: { x: number; y: number }, settings: PluginSettings): void {
        if (this.hideTimer !== null) {
            clearTimeout(this.hideTimer);
            this.hideTimer = null;
        }

        const alreadyVisible = this.containerEl !== null;

        if (!alreadyVisible) {
            this.containerEl = document.body.createEl('div', { cls: 'floaty-toolbar' });
            this.buildToolbarContent(this.containerEl, editor, settings);
            this.setupKeyboardNav(this.containerEl);
        } else {
            this.containerEl!.removeClass('is-hiding');
            this.containerEl!.addClass('is-active');
        }

        this.positionToolbar(mouse);

        if (!alreadyVisible) {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    this.containerEl?.addClass('is-active');
                });
            });
        }
    }

    private hideFloating(): void {
        if (!this.containerEl) return;
        const el = this.containerEl;
        this.containerEl = null;
        el.removeClass('is-active');
        el.addClass('is-hiding');
        this.hideTimer = setTimeout(() => { el.remove(); this.hideTimer = null; }, 200);
        el.addEventListener('animationend', () => {
            if (this.hideTimer !== null) { clearTimeout(this.hideTimer); this.hideTimer = null; }
            el.remove();
        }, { once: true });
    }

    // ── Build toolbar content (shared between floating and docked) ───────────

    private buildToolbarContent(container: HTMLElement, editor: Editor, settings: PluginSettings): void {
        // Group 1: bold, italic
        this.createActionItem(container, ACTIONS[0], editor, settings);
        this.createActionItem(container, ACTIONS[1], editor, settings);
        container.createEl('div', { cls: 'floaty-divider' });
        // Group 2: strikethrough, code
        this.createActionItem(container, ACTIONS[2], editor, settings);
        this.createActionItem(container, ACTIONS[3], editor, settings);
        container.createEl('div', { cls: 'floaty-divider' });
        // Group 3: highlight, link
        this.createActionItem(container, ACTIONS[4], editor, settings);
        this.createActionItem(container, ACTIONS[5], editor, settings);
        container.createEl('div', { cls: 'floaty-divider' });
        // Group 4: heading + callout dropdowns
        this.createHeadingDropdown(container, editor);
        container.createEl('div', { cls: 'floaty-divider' });
        this.createCalloutDropdown(container, editor);
    }

    // ── Keyboard navigation ──────────────────────────────────────────────────

    /**
     * Single keydown listener on the toolbar container.
     * Tab / Shift+Tab cycles focus through all focusable items.
     * Escape closes dropdowns or hides the floating toolbar.
     */
    private setupKeyboardNav(container: HTMLElement): void {
        container.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key !== 'Tab' && e.key !== 'Escape') return;

            if (e.key === 'Escape') {
                if (this.openDropdown) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.closeDropdown();
                }
                return;
            }

            // Tab navigation
            const focusable = Array.from(
                container.querySelectorAll<HTMLElement>('.floaty-action-item, .floaty-dropdown-trigger')
            );
            if (focusable.length === 0) return;

            const active = document.activeElement as HTMLElement;
            const idx    = focusable.indexOf(active);

            e.preventDefault();
            e.stopPropagation();

            if (e.shiftKey) {
                // Shift+Tab: go backwards, wrap to end
                const prev = idx <= 0 ? focusable[focusable.length - 1] : focusable[idx - 1];
                prev.focus();
            } else {
                // Tab: go forward, wrap to start
                const next = idx === -1 || idx === focusable.length - 1 ? focusable[0] : focusable[idx + 1];
                next.focus();
            }
        });
    }

    // ── Dropdown helpers ─────────────────────────────────────────────────────

    private closeDropdown(): void {
        if (!this.openDropdown) return;
        this.openDropdown.remove();
        this.openDropdown = null;
        this.containerEl?.querySelectorAll<HTMLElement>('.floaty-dropdown-trigger').forEach(el => el.removeClass('is-open'));
        this.dockedEl?.querySelectorAll<HTMLElement>('.floaty-dropdown-trigger').forEach(el => el.removeClass('is-open'));
    }

    private openDropdownPanel(triggerEl: HTMLElement): HTMLElement {
        this.closeDropdown();
        triggerEl.addClass('is-open');

        const panel = document.body.createEl('div', { cls: 'floaty-dropdown' });
        this.openDropdown = panel;

        const tr   = triggerEl.getBoundingClientRect();
        let left   = tr.left;
        let top    = tr.bottom + 6;

        panel.style.left = `${left}px`;
        panel.style.top  = `${top}px`;

        requestAnimationFrame(() => {
            const pr = panel.getBoundingClientRect();
            if (left + pr.width > window.innerWidth - 8)  left = window.innerWidth - pr.width - 8;
            if (top  + pr.height > window.innerHeight - 8) top  = tr.top - pr.height - 6;
            panel.style.left = `${left}px`;
            panel.style.top  = `${top}px`;
        });

        // Close on outside click
        const onOutside = (e: MouseEvent) => {
            if (!panel.contains(e.target as Node) && !triggerEl.contains(e.target as Node)) {
                this.closeDropdown();
                document.removeEventListener('mousedown', onOutside, true);
            }
        };
        setTimeout(() => document.addEventListener('mousedown', onOutside, true), 0);

        // Close on Escape
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                this.closeDropdown();
                document.removeEventListener('keydown', onKey, true);
            }
        };
        document.addEventListener('keydown', onKey, true);

        return panel;
    }

    // ── Heading dropdown ─────────────────────────────────────────────────────

    private createHeadingDropdown(container: HTMLElement, editor: Editor): void {
        const trigger = container.createEl('div', {
            cls: 'floaty-dropdown-trigger',
            attr: { 'aria-label': 'Heading', role: 'button', tabindex: '0' },
        });
        trigger.createSpan({ text: 'H' });
        trigger.appendChild(createChevronSvg());

        const open = () => {
            if (trigger.hasClass('is-open')) { this.closeDropdown(); return; }
            const panel = this.openDropdownPanel(trigger);

            for (const opt of HEADING_OPTIONS) {
                const item = panel.createEl('div', { cls: 'floaty-dropdown-item' });
                if (opt.level === 0) {
                    item.createSpan({ cls: 'floaty-heading-plain', text: 'Plain text' });
                } else {
                    item.createEl('span', { cls: 'floaty-heading-badge', text: `H${opt.level}` });
                    item.createSpan({ text: `Heading ${opt.level}` });
                }
                item.addEventListener('mousedown', (e) => {
                    e.preventDefault(); e.stopPropagation();
                    applyHeading(editor, opt.level);
                    this.closeDropdown();
                    if (!this.dockedEl) this.hideFloating();
                });
            }
        };

        trigger.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); open(); });
        trigger.addEventListener('keydown',   (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    }

    // ── Callout dropdown ─────────────────────────────────────────────────────

    private createCalloutDropdown(container: HTMLElement, editor: Editor): void {
        const trigger = container.createEl('div', {
            cls: 'floaty-dropdown-trigger',
            attr: { 'aria-label': 'Callout', role: 'button', tabindex: '0' },
        });
        setIcon(trigger, 'quote-glyph');
        trigger.appendChild(createChevronSvg());

        const open = () => {
            if (trigger.hasClass('is-open')) { this.closeDropdown(); return; }
            const panel = this.openDropdownPanel(trigger);

            for (const opt of CALLOUT_OPTIONS) {
                const item = panel.createEl('div', { cls: 'floaty-dropdown-item' });
                const iconWrap = item.createEl('span', { cls: `floaty-callout-icon-${opt.type}` });
                setIcon(iconWrap, opt.icon);
                item.createSpan({ text: opt.label });

                item.addEventListener('mousedown', (e) => {
                    e.preventDefault(); e.stopPropagation();
                    applyCallout(editor, opt.type);
                    this.closeDropdown();
                    if (!this.dockedEl) this.hideFloating();
                });
            }
        };

        trigger.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); open(); });
        trigger.addEventListener('keydown',   (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    }

    // ── Position (floating only) ─────────────────────────────────────────────

    private positionToolbar(mouse: { x: number; y: number }): void {
        if (!this.containerEl) return;

        const selRect = getSelectionRect();
        let anchorX: number, anchorTop: number, anchorBottom: number;

        if (selRect && selRect.height > 0) {
            anchorX      = selRect.left + selRect.width / 2;
            anchorTop    = selRect.top;
            anchorBottom = selRect.bottom;
        } else {
            anchorX = mouse.x; anchorTop = mouse.y; anchorBottom = mouse.y;
        }

        const tbRect = this.containerEl.getBoundingClientRect();
        const tbW    = tbRect.width  || TOOLBAR_W_ESTIMATE;
        const tbH    = tbRect.height || TOOLBAR_H_ESTIMATE;

        let left = anchorX - tbW / 2;
        let top  = anchorTop - tbH - GAP;

        left = Math.max(8, Math.min(left, window.innerWidth - tbW - 8));
        if (top < 8) top = anchorBottom + GAP;

        this.containerEl.style.left = `${left}px`;
        this.containerEl.style.top  = `${top}px`;
    }

    // ── Create regular action item ───────────────────────────────────────────

    private createActionItem(
        container: HTMLElement,
        cfg: IconAction,
        editor: Editor,
        settings: PluginSettings
    ): void {
        const item = container.createEl('div', {
            cls: 'floaty-action-item',
            attr: { 'aria-label': cfg.tooltip, role: 'button', tabindex: '0' },
        });
        setIcon(item, cfg.icon);

        const execute = () => {
            const result = cfg.action(editor, settings);
            // If floating mode, hide after action
            if (!this.dockedEl) {
                if (result instanceof Promise) {
                    result.then(() => this.hideFloating());
                } else {
                    this.hideFloating();
                }
            }
        };

        item.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); execute(); });
        item.addEventListener('keydown',   (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); execute(); } });
    }
}