import { Editor, setIcon } from 'obsidian';
import {
    applyBold, applyItalic, applyStrikethrough, applyCode,
    applyHighlight, applyLink, applyHeading, applyCallout,
    getSelectionRect, CalloutType,
} from './utils';
import type { PluginSettings } from './main';

// ─── Types ────────────────────────────────────────────────────────────────────

interface IconAction {
    icon: string;
    tooltip: string;
    action: (editor: Editor, settings: PluginSettings) => void | Promise<void>;
}

const ACTIONS: IconAction[] = [
    { icon: 'bold',          tooltip: 'Bold',          action: (e)    => applyBold(e) },
    { icon: 'italic',        tooltip: 'Italic',        action: (e)    => applyItalic(e) },
    { icon: 'strikethrough', tooltip: 'Strikethrough', action: (e)    => applyStrikethrough(e) },
    { icon: 'code',          tooltip: 'Inline Code',   action: (e)    => applyCode(e) },
    { icon: 'highlighter',   tooltip: 'Highlight',     action: (e)    => applyHighlight(e) },
    { icon: 'link',          tooltip: 'Insert Link',   action: (e, s) => applyLink(e, s.smartUrl) },
];

const HEADING_OPTIONS: { label: string; level: 0 | 1 | 2 | 3 | 4 }[] = [
    { label: 'H1', level: 1 }, { label: 'H2', level: 2 },
    { label: 'H3', level: 3 }, { label: 'H4', level: 4 },
    { label: 'Plain', level: 0 },
];

const CALLOUT_OPTIONS: { label: string; type: CalloutType; icon: string }[] = [
    { label: 'Note',      type: 'note',      icon: 'info' },
    { label: 'Tip',       type: 'tip',       icon: 'lightbulb' },
    { label: 'Warning',   type: 'warning',   icon: 'alert-triangle' },
    { label: 'Important', type: 'important', icon: 'alert-circle' },
    { label: 'Caution',   type: 'caution',   icon: 'flame' },
];

const TOOLBAR_W_ESTIMATE = 420;
const TOOLBAR_H_ESTIMATE = 44;
const GAP = 10;

// ─── Tooltip system ───────────────────────────────────────────────────────────
// We render our own tooltip so we can guarantee z-index above the dock.

let tooltipEl: HTMLElement | null = null;
let tooltipTimer: ReturnType<typeof setTimeout> | null = null;

function showTooltip(text: string, anchor: HTMLElement, above: boolean): void {
    hideTooltip();
    tooltipTimer = setTimeout(() => {
        const tip = document.body.createEl('div', { cls: 'floaty-custom-tooltip', text });
        tooltipEl = tip;

        const r = anchor.getBoundingClientRect();
        tip.style.visibility = 'hidden';
        tip.style.position   = 'fixed';
        tip.style.zIndex     = '10002';

        requestAnimationFrame(() => {
            const tw = tip.offsetWidth;
            let left = r.left + r.width / 2 - tw / 2;
            left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
            const top = above
                ? r.top - tip.offsetHeight - 6
                : r.bottom + 6;

            tip.style.left       = `${left}px`;
            tip.style.top        = `${top}px`;
            tip.style.visibility = '';
        });
    }, 400);
}

function hideTooltip(): void {
    if (tooltipTimer !== null) { clearTimeout(tooltipTimer); tooltipTimer = null; }
    tooltipEl?.remove();
    tooltipEl = null;
}

function attachTooltip(el: HTMLElement, text: string, above: boolean): void {
    el.addEventListener('mouseenter', () => showTooltip(text, el, above));
    el.addEventListener('mouseleave', hideTooltip);
    el.addEventListener('mousedown',  hideTooltip);
}

// ─── SVG helper ───────────────────────────────────────────────────────────────

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
            0%   { opacity: 0; transform: translateY(6px) scale(0.96); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes dock-rise {
            0%   { opacity: 0; transform: translateX(-50%) translateY(24px) scale(0.95); }
            60%  { transform: translateX(-50%) translateY(-3px) scale(1.01); }
            100% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }

        /* ── Custom tooltip ───────────────────────────────────────────────── */
        .floaty-custom-tooltip {
            position: fixed;
            z-index: 10002;
            padding: 4px 8px;
            background: var(--background-modifier-message, #1e1e1e);
            color: var(--text-normal, #fff);
            font-size: 12px;
            font-family: var(--font-interface);
            border-radius: var(--radius-s);
            pointer-events: none;
            white-space: nowrap;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            opacity: 0.95;
        }

        /* ── Selection floating toolbar ───────────────────────────────────── */
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

        /* ── Dock ─────────────────────────────────────────────────────────── */
        .floaty-dock {
            position: fixed !important;
            bottom: 20px !important;
            left: 50% !important;
            /* z-index BELOW Obsidian tooltips (9999) but above content */
            z-index: 9000 !important;
            display: flex !important;
            align-items: center;
            gap: 2px;
            padding: 6px 10px;
            background: var(--background-floating, var(--background-primary));
            border: 1px solid var(--divider-color);
            border-radius: 20px;
            box-shadow:
                0 8px 32px rgba(0,0,0,0.20),
                0 2px 8px rgba(0,0,0,0.12),
                0 0 0 1px var(--background-modifier-border);
            opacity: 0;
            pointer-events: none;
            transition:
                opacity 300ms cubic-bezier(0.4,0,0.2,1),
                transform 300ms cubic-bezier(0.4,0,0.2,1);
        }
        .floaty-dock.dock-visible {
            opacity: 1 !important;
            pointer-events: auto !important;
            transform: translateX(-50%) translateY(0) !important;
        }
        .floaty-dock.dock-hidden {
            opacity: 0 !important;
            pointer-events: none !important;
            transform: translateX(-50%) translateY(32px) !important;
        }
        .floaty-dock.dock-rising {
            animation: dock-rise 350ms cubic-bezier(0.34,1.56,0.64,1) forwards !important;
        }

        /* Apple magnification */
        .floaty-dock .floaty-action-item,
        .floaty-dock .floaty-dropdown-trigger,
        .floaty-dock .floaty-pin-btn {
            transition:
                background 100ms ease,
                color 100ms ease,
                transform 200ms cubic-bezier(0.34,1.56,0.64,1) !important;
        }
        .floaty-dock .floaty-action-item:hover,
        .floaty-dock .floaty-dropdown-trigger:hover,
        .floaty-dock .floaty-pin-btn:hover {
            transform: scale(1.25) translateY(-4px) !important;
            background: var(--background-modifier-hover);
            color: var(--text-normal);
        }
        .floaty-dock .floaty-action-item:active,
        .floaty-dock .floaty-dropdown-trigger:active,
        .floaty-dock .floaty-pin-btn:active {
            transform: scale(0.92) translateY(0) !important;
        }

        /* ── Divider ──────────────────────────────────────────────────────── */
        .floaty-divider {
            width: 1px;
            height: 18px;
            background: var(--divider-color);
            margin: 0 4px;
            flex-shrink: 0;
            border-radius: 1px;
        }

        /* ── Action buttons ───────────────────────────────────────────────── */
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
        .floaty-action-item:hover  { background: var(--background-modifier-hover); color: var(--text-normal); }
        .floaty-action-item:active { transform: scale(0.88); background: var(--background-modifier-active-hover); color: var(--text-normal); }
        .floaty-action-item:focus-visible { outline: 2px solid var(--interactive-accent); outline-offset: -2px; }
        .floaty-action-item svg    { width: 16px; height: 16px; pointer-events: none; stroke-width: 2px; }

        /* ── Pin button ───────────────────────────────────────────────────── */
        .floaty-pin-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            border-radius: var(--radius-s);
            cursor: pointer;
            color: var(--text-faint);
            transition: background 100ms ease, color 100ms ease, transform 100ms ease;
            flex-shrink: 0;
        }
        .floaty-pin-btn:hover  { background: var(--background-modifier-hover); color: var(--text-muted); }
        .floaty-pin-btn:active { transform: scale(0.88); }
        .floaty-pin-btn.is-pinned {
            color: var(--interactive-accent);
        }
        .floaty-pin-btn svg { width: 14px; height: 14px; pointer-events: none; stroke-width: 2px; }

        /* ── Dropdown trigger ─────────────────────────────────────────────── */
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
        .floaty-dropdown-trigger:hover   { background: var(--background-modifier-hover); color: var(--text-normal); }
        .floaty-dropdown-trigger.is-open { background: var(--background-modifier-hover); color: var(--text-normal); }
        .floaty-dropdown-trigger:focus-visible { outline: 2px solid var(--interactive-accent); outline-offset: -2px; }
        .floaty-dropdown-trigger svg { width: 14px; height: 14px; pointer-events: none; stroke-width: 2px; flex-shrink: 0; }
        .floaty-chevron { width: 10px; height: 10px; opacity: 0.5; transition: transform 150ms ease, opacity 150ms ease; }
        .floaty-dropdown-trigger.is-open .floaty-chevron { transform: rotate(180deg); opacity: 0.8; }

        /* ── Dropdown panel ───────────────────────────────────────────────── */
        .floaty-dropdown {
            position: fixed;
            z-index: 10001;
            min-width: 140px;
            padding: 4px;
            background: var(--background-floating, var(--background-primary));
            border: 1px solid var(--divider-color);
            border-radius: var(--radius-m);
            box-shadow:
                0 -4px 24px rgba(0,0,0,0.18),
                0 2px 8px rgba(0,0,0,0.10),
                0 0 0 1px var(--background-modifier-border);
            animation: floaty-dropdown-in 160ms cubic-bezier(0.25,1,0.5,1) forwards;
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
        .floaty-dropdown-item:hover  { background: var(--background-modifier-hover); color: var(--text-normal); }
        .floaty-dropdown-item:active { background: var(--background-modifier-active-hover); }
        .floaty-dropdown-item svg { width: 14px; height: 14px; flex-shrink: 0; stroke-width: 2px; color: var(--text-faint); }
        .floaty-dropdown-item:hover svg { color: var(--text-muted); }
        .floaty-heading-badge {
            display: inline-flex; align-items: center; justify-content: center;
            width: 24px; height: 20px; border-radius: 4px;
            background: var(--background-modifier-hover); color: var(--text-normal);
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

// ─── FloatyToolbar ────────────────────────────────────────────────────────────

export class FloatyToolbar {
    private containerEl: HTMLElement | null = null;
    private hideTimer: ReturnType<typeof setTimeout> | null = null;

    private dockEl: HTMLElement | null     = null;
    private dockEditor: Editor | null      = null;
    private dockSettings: PluginSettings | null = null;
    private dockIsVisible                  = false;
    private dockAutoHideTimer: ReturnType<typeof setTimeout> | null = null;

    private _onMouseMove: ((e: MouseEvent) => void) | null  = null;
    private _onKeyDown:   ((e: KeyboardEvent) => void) | null = null;

    private openDropdown: HTMLElement | null = null;

    /** Callback to notify main.ts when pin is toggled */
    onPinToggle: ((docked: boolean) => void) | null = null;

    // ── Public ────────────────────────────────────────────────────────────────

    show(editor: Editor, mouse: { x: number; y: number }, settings: PluginSettings): void {
        ensureStyles();
        if (settings.dockedMode) {
            this.mountDock(editor, settings);
        } else {
            this.showFloating(editor, mouse, settings);
        }
    }

    hide(): void {
        hideTooltip();
        this.closeDropdown();
        this.hideFloating();
    }

    destroy(): void {
        hideTooltip();
        this.closeDropdown();
        this.hideFloating();
        this.destroyDock();
    }

    contains(node: Node): boolean {
        return (
            (this.containerEl?.contains(node)  ?? false) ||
            (this.dockEl?.contains(node)        ?? false) ||
            (this.openDropdown?.contains(node)  ?? false)
        );
    }

    // ── Dock ──────────────────────────────────────────────────────────────────

    private mountDock(editor: Editor, settings: PluginSettings): void {
        this.dockEditor   = editor;
        this.dockSettings = settings;

        if (this.dockEl) {
            // Already mounted — just reveal it
            this.dockReveal();
            return;
        }

        const dock = document.body.createEl('div', { cls: 'floaty-dock' });
        this.dockEl = dock;

        this.buildToolbarContent(dock, editor, settings, true);
        this.setupKeyboardNav(dock);

        // Rise animation
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                dock.addClass('dock-rising');
                dock.addEventListener('animationend', () => {
                    dock.removeClass('dock-rising');
                    dock.addClass('dock-visible');
                    this.dockIsVisible = true;
                }, { once: true });
            });
        });

        // Auto-hide on typing
        this._onKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            if (this.openDropdown) return;
            if (this.dockEl?.contains(e.target as Node)) return;
            this.dockAutoHide();
        };
        document.addEventListener('keydown', this._onKeyDown, true);

        // Reveal on mouse near bottom
        this._onMouseMove = (e: MouseEvent) => {
            if (e.clientY > window.innerHeight - 80) this.dockReveal();
        };
        document.addEventListener('mousemove', this._onMouseMove, { passive: true });

        // Hovering dock cancels hide
        dock.addEventListener('mouseenter', () => {
            if (this.dockAutoHideTimer !== null) { clearTimeout(this.dockAutoHideTimer); this.dockAutoHideTimer = null; }
            this.dockReveal();
        });
    }

    private dockReveal(): void {
        if (!this.dockEl) return;
        if (this.dockAutoHideTimer !== null) { clearTimeout(this.dockAutoHideTimer); this.dockAutoHideTimer = null; }
        if (this.dockIsVisible) return;
        this.dockEl.removeClass('dock-hidden');
        this.dockEl.addClass('dock-visible');
        this.dockIsVisible = true;
    }

    private dockAutoHide(): void {
        if (!this.dockEl || !this.dockIsVisible) return;
        if (this.dockAutoHideTimer !== null) clearTimeout(this.dockAutoHideTimer);
        this.dockAutoHideTimer = setTimeout(() => {
            if (!this.dockEl) return;
            this.dockEl.removeClass('dock-visible');
            this.dockEl.addClass('dock-hidden');
            this.dockIsVisible = false;
            this.dockAutoHideTimer = null;
        }, 1200);
    }

    private destroyDock(): void {
        if (this._onKeyDown)   document.removeEventListener('keydown',   this._onKeyDown, true);
        if (this._onMouseMove) document.removeEventListener('mousemove', this._onMouseMove);
        this._onKeyDown   = null;
        this._onMouseMove = null;
        if (this.dockAutoHideTimer !== null) { clearTimeout(this.dockAutoHideTimer); this.dockAutoHideTimer = null; }
        this.dockEl?.remove();
        this.dockEl       = null;
        this.dockEditor   = null;
        this.dockSettings = null;
        this.dockIsVisible = false;
    }

    // ── Floating toolbar ──────────────────────────────────────────────────────

    private showFloating(editor: Editor, mouse: { x: number; y: number }, settings: PluginSettings): void {
        if (this.hideTimer !== null) { clearTimeout(this.hideTimer); this.hideTimer = null; }

        const alreadyVisible = this.containerEl !== null;

        if (!alreadyVisible) {
            this.containerEl = document.body.createEl('div', { cls: 'floaty-toolbar' });
            this.buildToolbarContent(this.containerEl, editor, settings, false);
            this.setupKeyboardNav(this.containerEl);
        } else {
            this.containerEl!.removeClass('is-hiding');
            this.containerEl!.addClass('is-active');
        }

        this.positionToolbar(mouse);

        if (!alreadyVisible) {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => { this.containerEl?.addClass('is-active'); });
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

    // ── Build content ─────────────────────────────────────────────────────────

    private buildToolbarContent(
        container: HTMLElement,
        editor: Editor,
        settings: PluginSettings,
        isDock: boolean
    ): void {
        const above = isDock; // dropdowns open upward in dock, downward in floating

        this.createActionItem(container, ACTIONS[0], editor, settings, isDock);
        this.createActionItem(container, ACTIONS[1], editor, settings, isDock);
        container.createEl('div', { cls: 'floaty-divider' });
        this.createActionItem(container, ACTIONS[2], editor, settings, isDock);
        this.createActionItem(container, ACTIONS[3], editor, settings, isDock);
        container.createEl('div', { cls: 'floaty-divider' });
        this.createActionItem(container, ACTIONS[4], editor, settings, isDock);
        this.createActionItem(container, ACTIONS[5], editor, settings, isDock);
        container.createEl('div', { cls: 'floaty-divider' });
        this.createHeadingDropdown(container, editor, above, isDock);
        container.createEl('div', { cls: 'floaty-divider' });
        this.createCalloutDropdown(container, editor, above, isDock);
        container.createEl('div', { cls: 'floaty-divider' });

        // Pin button — always last
        this.createPinButton(container, settings, isDock);
    }

    // ── Pin button ────────────────────────────────────────────────────────────

    private createPinButton(container: HTMLElement, settings: PluginSettings, isDock: boolean): void {
        const btn = container.createEl('div', {
            cls: 'floaty-pin-btn' + (isDock ? ' is-pinned' : ''),
            attr: { role: 'button', tabindex: '0' },
        });
        setIcon(btn, 'pin');
        attachTooltip(btn, isDock ? 'Switch to floating mode' : 'Pin to dock', isDock);

        const toggle = () => {
            const newDocked = !settings.dockedMode;
            hideTooltip();
            if (this.onPinToggle) this.onPinToggle(newDocked);
        };

        btn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); toggle(); });
        btn.addEventListener('keydown',   (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    }

    // ── Keyboard nav ──────────────────────────────────────────────────────────

    private setupKeyboardNav(container: HTMLElement): void {
        container.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (this.openDropdown) { e.preventDefault(); e.stopPropagation(); this.closeDropdown(); }
                return;
            }
            if (e.key !== 'Tab') return;

            const focusable = Array.from(
                container.querySelectorAll<HTMLElement>(
                    '.floaty-action-item, .floaty-dropdown-trigger, .floaty-pin-btn'
                )
            );
            if (!focusable.length) return;

            const idx = focusable.indexOf(document.activeElement as HTMLElement);
            e.preventDefault();
            e.stopPropagation();

            if (e.shiftKey) {
                (idx <= 0 ? focusable[focusable.length - 1] : focusable[idx - 1]).focus();
            } else {
                (idx === -1 || idx === focusable.length - 1 ? focusable[0] : focusable[idx + 1]).focus();
            }
        });
    }

    // ── Dropdown helpers ──────────────────────────────────────────────────────

    private closeDropdown(): void {
        if (!this.openDropdown) return;
        this.openDropdown.remove();
        this.openDropdown = null;
        this.containerEl?.querySelectorAll<HTMLElement>('.floaty-dropdown-trigger').forEach(el => el.removeClass('is-open'));
        this.dockEl?.querySelectorAll<HTMLElement>('.floaty-dropdown-trigger').forEach(el => el.removeClass('is-open'));
    }

    private openDropdownPanel(triggerEl: HTMLElement, openUpward: boolean): HTMLElement {
        this.closeDropdown();
        triggerEl.addClass('is-open');

        const panel = document.body.createEl('div', { cls: 'floaty-dropdown' });
        this.openDropdown = panel;

        panel.style.visibility = 'hidden';
        panel.style.position   = 'fixed';

        const tr = triggerEl.getBoundingClientRect();
        let left = tr.left;
        panel.style.left = `${left}px`;
        panel.style.top  = '0px';

        requestAnimationFrame(() => {
            const pr = panel.getBoundingClientRect();
            if (left + pr.width > window.innerWidth - 8) left = window.innerWidth - pr.width - 8;
            left = Math.max(8, left);

            const top = openUpward
                ? tr.top - pr.height - 8
                : tr.bottom + 6;

            panel.style.left       = `${left}px`;
            panel.style.top        = `${Math.max(8, top)}px`;
            panel.style.visibility = '';
        });

        const onOutside = (e: MouseEvent) => {
            if (!panel.contains(e.target as Node) && !triggerEl.contains(e.target as Node)) {
                this.closeDropdown();
                document.removeEventListener('mousedown', onOutside, true);
            }
        };
        setTimeout(() => document.addEventListener('mousedown', onOutside, true), 0);

        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { this.closeDropdown(); document.removeEventListener('keydown', onKey, true); }
        };
        document.addEventListener('keydown', onKey, true);

        return panel;
    }

    // ── Heading dropdown ──────────────────────────────────────────────────────

    private createHeadingDropdown(container: HTMLElement, editor: Editor, openUpward: boolean, isDock: boolean): void {
        const trigger = container.createEl('div', {
            cls: 'floaty-dropdown-trigger',
            attr: { role: 'button', tabindex: '0' },
        });
        trigger.createSpan({ text: 'H' });
        trigger.appendChild(createChevronSvg());
        attachTooltip(trigger, 'Heading', openUpward);

        const open = () => {
            if (trigger.hasClass('is-open')) { this.closeDropdown(); return; }
            const panel = this.openDropdownPanel(trigger, openUpward);
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
                    if (!isDock) this.hideFloating();
                });
            }
        };
        trigger.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); open(); });
        trigger.addEventListener('keydown',   (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    }

    // ── Callout dropdown ──────────────────────────────────────────────────────

    private createCalloutDropdown(container: HTMLElement, editor: Editor, openUpward: boolean, isDock: boolean): void {
        const trigger = container.createEl('div', {
            cls: 'floaty-dropdown-trigger',
            attr: { role: 'button', tabindex: '0' },
        });
        setIcon(trigger, 'quote-glyph');
        trigger.appendChild(createChevronSvg());
        attachTooltip(trigger, 'Callout', openUpward);

        const open = () => {
            if (trigger.hasClass('is-open')) { this.closeDropdown(); return; }
            const panel = this.openDropdownPanel(trigger, openUpward);
            for (const opt of CALLOUT_OPTIONS) {
                const item = panel.createEl('div', { cls: 'floaty-dropdown-item' });
                const iconWrap = item.createEl('span', { cls: `floaty-callout-icon-${opt.type}` });
                setIcon(iconWrap, opt.icon);
                item.createSpan({ text: opt.label });
                item.addEventListener('mousedown', (e) => {
                    e.preventDefault(); e.stopPropagation();
                    applyCallout(editor, opt.type);
                    this.closeDropdown();
                    if (!isDock) this.hideFloating();
                });
            }
        };
        trigger.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); open(); });
        trigger.addEventListener('keydown',   (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    }

    // ── Position (floating) ───────────────────────────────────────────────────

    private positionToolbar(mouse: { x: number; y: number }): void {
        if (!this.containerEl) return;
        const selRect = getSelectionRect();
        let anchorX: number, anchorTop: number, anchorBottom: number;

        if (selRect && selRect.height > 0) {
            anchorX = selRect.left + selRect.width / 2;
            anchorTop = selRect.top; anchorBottom = selRect.bottom;
        } else {
            anchorX = mouse.x; anchorTop = mouse.y; anchorBottom = mouse.y;
        }

        const tbRect = this.containerEl.getBoundingClientRect();
        const tbW = tbRect.width || TOOLBAR_W_ESTIMATE;
        const tbH = tbRect.height || TOOLBAR_H_ESTIMATE;

        let left = anchorX - tbW / 2;
        let top  = anchorTop - tbH - GAP;
        left = Math.max(8, Math.min(left, window.innerWidth - tbW - 8));
        if (top < 8) top = anchorBottom + GAP;

        this.containerEl.style.left = `${left}px`;
        this.containerEl.style.top  = `${top}px`;
    }

    // ── Action button ─────────────────────────────────────────────────────────

    private createActionItem(
        container: HTMLElement,
        cfg: IconAction,
        editor: Editor,
        settings: PluginSettings,
        isDock: boolean
    ): void {
        const item = container.createEl('div', {
            cls: 'floaty-action-item',
            attr: { role: 'button', tabindex: '0' },
        });
        setIcon(item, cfg.icon);
        // Tooltips above for dock (upward), below for floating toolbar
        attachTooltip(item, cfg.tooltip, isDock);

        const execute = () => {
            const result = cfg.action(editor, settings);
            if (!isDock) {
                if (result instanceof Promise) result.then(() => this.hideFloating());
                else this.hideFloating();
            }
        };

        item.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); execute(); });
        item.addEventListener('keydown',   (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); execute(); } });
    }
}