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

function getActiveDocument(): Document {
    return window.activeDocument;
}

function getActiveWindow(): Window {
    return window.activeWindow;
}

function setFloatingPosition(el: HTMLElement, left: number, top: number): void {
    el.setCssProps({
        left: `${left}px`,
        top: `${top}px`,
    });
}

function showTooltip(text: string, anchor: HTMLElement, above: boolean): void {
    hideTooltip();
    tooltipTimer = getActiveWindow().setTimeout(() => {
        const tip = getActiveDocument().body.createDiv({ cls: 'floaty-custom-tooltip', text });
        tooltipEl = tip;

        const r = anchor.getBoundingClientRect();
        tip.addClass('floaty-measuring');

        getActiveWindow().requestAnimationFrame(() => {
            const tw = tip.offsetWidth;
            let left = r.left + r.width / 2 - tw / 2;
            left = Math.max(8, Math.min(left, getActiveWindow().innerWidth - tw - 8));
            const top = above
                ? r.top - tip.offsetHeight - 6
                : r.bottom + 6;

            setFloatingPosition(tip, left, top);
            tip.removeClass('floaty-measuring');
        });
    }, 400);
}

function hideTooltip(): void {
    if (tooltipTimer !== null) { getActiveWindow().clearTimeout(tooltipTimer); tooltipTimer = null; }
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
    const svg = getActiveDocument().createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.classList.add('floaty-chevron');
    const path = getActiveDocument().createElementNS(NS, 'path');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('d', 'M6 9l6 6 6-6');
    svg.appendChild(path);
    return svg;
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
    onPinToggle: ((docked: boolean) => void | Promise<void>) | null = null;

    // ── Public ────────────────────────────────────────────────────────────────

    show(editor: Editor, mouse: { x: number; y: number }, settings: PluginSettings): void {
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

        const dock = getActiveDocument().body.createDiv({ cls: 'floaty-dock' });
        this.dockEl = dock;

        this.buildToolbarContent(dock, () => this.dockEditor!, settings, true);
        this.setupKeyboardNav(dock);

        // Rise animation
        getActiveWindow().requestAnimationFrame(() => {
            getActiveWindow().requestAnimationFrame(() => {
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
        getActiveDocument().addEventListener('keydown', this._onKeyDown, true);

        // Reveal on mouse near bottom
        this._onMouseMove = (e: MouseEvent) => {
            if (e.clientY > getActiveWindow().innerHeight - 80) this.dockReveal();
        };
        getActiveDocument().addEventListener('mousemove', this._onMouseMove, { passive: true });

        // Hovering dock cancels hide
        dock.addEventListener('mouseenter', () => {
            if (this.dockAutoHideTimer !== null) { getActiveWindow().clearTimeout(this.dockAutoHideTimer); this.dockAutoHideTimer = null; }
            this.dockReveal();
        });
    }

    private dockReveal(): void {
        if (!this.dockEl) return;
        if (this.dockAutoHideTimer !== null) { getActiveWindow().clearTimeout(this.dockAutoHideTimer); this.dockAutoHideTimer = null; }
        if (this.dockIsVisible) return;
        this.dockEl.removeClass('dock-hidden');
        this.dockEl.addClass('dock-visible');
        this.dockIsVisible = true;
    }

    private dockAutoHide(): void {
        if (!this.dockEl || !this.dockIsVisible) return;
        if (this.dockAutoHideTimer !== null) getActiveWindow().clearTimeout(this.dockAutoHideTimer);
        this.dockAutoHideTimer = getActiveWindow().setTimeout(() => {
            if (!this.dockEl) return;
            this.dockEl.removeClass('dock-visible');
            this.dockEl.addClass('dock-hidden');
            this.dockIsVisible = false;
            this.dockAutoHideTimer = null;
        }, 1200);
    }

    private destroyDock(): void {
        if (this._onKeyDown)   getActiveDocument().removeEventListener('keydown', this._onKeyDown, true);
        if (this._onMouseMove) getActiveDocument().removeEventListener('mousemove', this._onMouseMove);
        this._onKeyDown   = null;
        this._onMouseMove = null;
        if (this.dockAutoHideTimer !== null) { getActiveWindow().clearTimeout(this.dockAutoHideTimer); this.dockAutoHideTimer = null; }
        this.dockEl?.remove();
        this.dockEl       = null;
        this.dockEditor   = null;
        this.dockSettings = null;
        this.dockIsVisible = false;
    }

    destroyDockAnimated(onDone: () => void): void {
        if (!this.dockEl) { onDone(); return; }
        if (this._onKeyDown)   getActiveDocument().removeEventListener('keydown', this._onKeyDown, true);
        if (this._onMouseMove) getActiveDocument().removeEventListener('mousemove', this._onMouseMove);
        this._onKeyDown   = null;
        this._onMouseMove = null;
        if (this.dockAutoHideTimer !== null) { getActiveWindow().clearTimeout(this.dockAutoHideTimer); this.dockAutoHideTimer = null; }
        const el = this.dockEl;
        let done = false;
        const finish = () => { if (done) return; done = true; el.remove(); onDone(); };
        el.removeClass('dock-visible', 'dock-hidden', 'dock-rising');
        el.addClass('dock-falling');
        el.addEventListener('animationend', finish, { once: true });
        getActiveWindow().setTimeout(finish, 400); // safety fallback
        this.dockEl       = null;
        this.dockEditor   = null;
        this.dockSettings = null;
        this.dockIsVisible = false;
    }

    // ── Floating toolbar ──────────────────────────────────────────────────────

    private showFloating(editor: Editor, mouse: { x: number; y: number }, settings: PluginSettings): void {
        if (this.hideTimer !== null) { getActiveWindow().clearTimeout(this.hideTimer); this.hideTimer = null; }

        const alreadyVisible = this.containerEl !== null;

        if (!alreadyVisible) {
            this.containerEl = getActiveDocument().body.createDiv({ cls: 'floaty-toolbar' });
            this.buildToolbarContent(this.containerEl, () => editor, settings, false);
            this.setupKeyboardNav(this.containerEl);
        } else {
            this.containerEl!.removeClass('is-hiding');
            this.containerEl!.addClass('is-active');
        }

        this.positionToolbar(mouse);

        if (!alreadyVisible) {
            getActiveWindow().requestAnimationFrame(() => {
                getActiveWindow().requestAnimationFrame(() => { this.containerEl?.addClass('is-active'); });
            });
        }
    }

    private hideFloating(): void {
        if (!this.containerEl) return;
        const el = this.containerEl;
        this.containerEl = null;
        el.removeClass('is-active');
        el.addClass('is-hiding');
        this.hideTimer = getActiveWindow().setTimeout(() => { el.remove(); this.hideTimer = null; }, 200);
        el.addEventListener('animationend', () => {
            if (this.hideTimer !== null) { getActiveWindow().clearTimeout(this.hideTimer); this.hideTimer = null; }
            el.remove();
        }, { once: true });
    }

    // ── Build content ─────────────────────────────────────────────────────────

    private buildToolbarContent(
        container: HTMLElement,
        getEditor: () => Editor,
        settings: PluginSettings,
        isDock: boolean
    ): void {
        const above = isDock; // dropdowns open upward in dock, downward in floating

        this.createActionItem(container, ACTIONS[0], getEditor, settings, isDock);
        this.createActionItem(container, ACTIONS[1], getEditor, settings, isDock);
        container.createDiv({ cls: 'floaty-divider' });
        this.createActionItem(container, ACTIONS[2], getEditor, settings, isDock);
        this.createActionItem(container, ACTIONS[3], getEditor, settings, isDock);
        container.createDiv({ cls: 'floaty-divider' });
        this.createActionItem(container, ACTIONS[4], getEditor, settings, isDock);
        this.createActionItem(container, ACTIONS[5], getEditor, settings, isDock);
        container.createDiv({ cls: 'floaty-divider' });
        this.createHeadingDropdown(container, getEditor, above, isDock);
        container.createDiv({ cls: 'floaty-divider' });
        this.createCalloutDropdown(container, getEditor, above, isDock);
        container.createDiv({ cls: 'floaty-divider' });

        // Pin button — always last
        this.createPinButton(container, settings, isDock);
    }

    // ── Pin button ────────────────────────────────────────────────────────────

    private createPinButton(container: HTMLElement, settings: PluginSettings, isDock: boolean): void {
        const btn = container.createDiv({
            cls: 'floaty-pin-btn' + (isDock ? ' is-pinned' : ''),
            attr: { role: 'button', tabindex: '0' },
        });
        setIcon(btn, 'pin');
        attachTooltip(btn, isDock ? 'Switch to floating mode' : 'Pin to dock', isDock);

        const toggle = () => {
            const newDocked = !settings.dockedMode;
            hideTooltip();
            if (this.onPinToggle) void this.onPinToggle(newDocked);
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

            const idx = focusable.indexOf(getActiveDocument().activeElement as HTMLElement);
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

        const panel = getActiveDocument().body.createDiv({ cls: 'floaty-dropdown' });
        this.openDropdown = panel;

        panel.addClass('floaty-measuring');

        const tr = triggerEl.getBoundingClientRect();
        let left = tr.left;
        setFloatingPosition(panel, left, 0);

        getActiveWindow().requestAnimationFrame(() => {
            const pr = panel.getBoundingClientRect();
            if (left + pr.width > getActiveWindow().innerWidth - 8) left = getActiveWindow().innerWidth - pr.width - 8;
            left = Math.max(8, left);

            const top = openUpward
                ? tr.top - pr.height - 8
                : tr.bottom + 6;

            setFloatingPosition(panel, left, Math.max(8, top));
            panel.removeClass('floaty-measuring');
        });

        const onOutside = (e: MouseEvent) => {
            if (!panel.contains(e.target as Node) && !triggerEl.contains(e.target as Node)) {
                this.closeDropdown();
                getActiveDocument().removeEventListener('mousedown', onOutside, true);
            }
        };
        getActiveWindow().setTimeout(() => getActiveDocument().addEventListener('mousedown', onOutside, true), 0);

        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { this.closeDropdown(); getActiveDocument().removeEventListener('keydown', onKey, true); }
        };
        getActiveDocument().addEventListener('keydown', onKey, true);

        return panel;
    }

    // ── Heading dropdown ──────────────────────────────────────────────────────

    private createHeadingDropdown(container: HTMLElement, getEditor: () => Editor, openUpward: boolean, isDock: boolean): void {
        const trigger = container.createDiv({
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
                const item = panel.createDiv({ cls: 'floaty-dropdown-item' });
                if (opt.level === 0) {
                    item.createSpan({ cls: 'floaty-heading-plain', text: 'Plain text' });
                } else {
                    item.createSpan({ cls: 'floaty-heading-badge', text: `H${opt.level}` });
                    item.createSpan({ text: `Heading ${opt.level}` });
                }
                item.addEventListener('mousedown', (e) => {
                    e.preventDefault(); e.stopPropagation();
                    applyHeading(getEditor(), opt.level);
                    this.closeDropdown();
                    if (!isDock) this.hideFloating();
                });
            }
        };
        trigger.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); open(); });
        trigger.addEventListener('keydown',   (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    }

    // ── Callout dropdown ──────────────────────────────────────────────────────

    private createCalloutDropdown(container: HTMLElement, getEditor: () => Editor, openUpward: boolean, isDock: boolean): void {
        const trigger = container.createDiv({
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
                const item = panel.createDiv({ cls: 'floaty-dropdown-item' });
                const iconWrap = item.createSpan({ cls: `floaty-callout-icon-${opt.type}` });
                setIcon(iconWrap, opt.icon);
                item.createSpan({ text: opt.label });
                item.addEventListener('mousedown', (e) => {
                    e.preventDefault(); e.stopPropagation();
                    applyCallout(getEditor(), opt.type);
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
        left = Math.max(8, Math.min(left, getActiveWindow().innerWidth - tbW - 8));
        if (top < 8) top = anchorBottom + GAP;

        setFloatingPosition(this.containerEl, left, top);
    }

    // ── Action button ─────────────────────────────────────────────────────────

    private createActionItem(
        container: HTMLElement,
        cfg: IconAction,
        getEditor: () => Editor,
        settings: PluginSettings,
        isDock: boolean
    ): void {
        const item = container.createDiv({
            cls: 'floaty-action-item',
            attr: { role: 'button', tabindex: '0' },
        });
        setIcon(item, cfg.icon);
        // Tooltips above for dock (upward), below for floating toolbar
        attachTooltip(item, cfg.tooltip, isDock);

        const execute = () => {
            const result = cfg.action(getEditor(), settings);
            if (!isDock) {
                if (result instanceof Promise) void result.then(() => this.hideFloating()).catch(() => {});
                else this.hideFloating();
            }
        };

        item.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); execute(); });
        item.addEventListener('keydown',   (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); execute(); } });
    }
}
