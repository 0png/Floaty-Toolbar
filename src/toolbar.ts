import { Editor, setIcon } from 'obsidian';
import {
    applyBold, applyItalic, applyStrikethrough, applyCode,
    applyHighlight, applyLink, applyHeading, applyCallout,
    getSelectionRect, CalloutType,
} from './utils';
import type { PluginSettings } from './main';
import type { FloatyHud } from './hud';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IconAction {
    id:      string;
    icon:    string;
    tooltip: string;
    action:  (editor: Editor, settings: PluginSettings) => void | Promise<void>;
}

export type ToolbarItemId =
    | 'bold' | 'italic' | 'strikethrough' | 'code' | 'highlight' | 'link'
    | 'heading' | 'callout';

// All available actions — id is the stable key stored in settings
export const ALL_ACTIONS: IconAction[] = [
    { id: 'bold',          icon: 'bold',          tooltip: 'Bold',          action: (e)    => applyBold(e) },
    { id: 'italic',        icon: 'italic',        tooltip: 'Italic',        action: (e)    => applyItalic(e) },
    { id: 'strikethrough', icon: 'strikethrough', tooltip: 'Strikethrough', action: (e)    => applyStrikethrough(e) },
    { id: 'code',          icon: 'code',          tooltip: 'Inline Code',   action: (e)    => applyCode(e) },
    { id: 'highlight',     icon: 'highlighter',   tooltip: 'Highlight',     action: (e)    => applyHighlight(e) },
    { id: 'link',          icon: 'link',          tooltip: 'Insert Link',   action: (e, s) => applyLink(e, s.smartUrl) },
];

export const DEFAULT_BUTTON_ORDER: ToolbarItemId[] = [
    'bold', 'italic', 'strikethrough', 'code', 'highlight', 'link', 'heading', 'callout',
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
const GAP                = 10;

// Long-press threshold in ms before drag mode activates
const LONG_PRESS_MS = 500;

// ─── Tooltip system ───────────────────────────────────────────────────────────

let tooltipEl:    HTMLElement | null              = null;
let tooltipTimer: ReturnType<typeof setTimeout> | null = null;

function showTooltip(text: string, anchor: HTMLElement, above: boolean): void {
    hideTooltip();
    tooltipTimer = setTimeout(() => {
        const tip = document.body.createEl('div', { cls: 'floaty-custom-tooltip', text });
        tooltipEl  = tip;

        const r = anchor.getBoundingClientRect();
        tip.addClass('floaty-measuring');

        requestAnimationFrame(() => {
            const tw   = tip.offsetWidth;
            let   left = r.left + r.width / 2 - tw / 2;
            left        = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
            const top   = above ? r.top - tip.offsetHeight - 6 : r.bottom + 6;
            tip.style.left = `${left}px`;
            tip.style.top  = `${top}px`;
            tip.removeClass('floaty-measuring');
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

// ─── SVG helpers ──────────────────────────────────────────────────────────────

function createChevronSvg(): SVGSVGElement {
    const NS  = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.classList.add('floaty-chevron');
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('d', 'M6 9l6 6 6-6');
    svg.appendChild(path);
    return svg;
}

// ─── Drag-reorder state ───────────────────────────────────────────────────────

interface DragState {
    itemId:       ToolbarItemId;
    sourceEl:     HTMLElement;
    ghostEl:      HTMLElement;
    containerEl:  HTMLElement;
    offsetX:      number;
    offsetY:      number;
    isDock:       boolean;
    onReorder:    (newOrder: ToolbarItemId[]) => void;
}

let activeDrag: DragState | null = null;

function startDrag(
    itemId:      ToolbarItemId,
    sourceEl:    HTMLElement,
    containerEl: HTMLElement,
    startEvt:    MouseEvent,
    isDock:      boolean,
    onReorder:   (newOrder: ToolbarItemId[]) => void
): void {
    if (activeDrag) return;
    hideTooltip();

    // Ghost: visual copy of the button that follows the cursor
    const rect  = sourceEl.getBoundingClientRect();
    const ghost = document.body.createEl('div', { cls: 'floaty-drag-ghost' });
    ghost.style.width  = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.left   = `${rect.left}px`;
    ghost.style.top    = `${rect.top}px`;
    // Copy the inner icon
    ghost.innerHTML = sourceEl.innerHTML;

    sourceEl.addClass('floaty-drag-source');

    activeDrag = {
        itemId, sourceEl, ghostEl: ghost, containerEl,
        offsetX: startEvt.clientX - rect.left,
        offsetY: startEvt.clientY - rect.top,
        isDock, onReorder,
    };

    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup',   onDragEnd, { once: true });
}

function onDragMove(e: MouseEvent): void {
    if (!activeDrag) return;
    const { ghostEl, offsetX, offsetY } = activeDrag;
    ghostEl.style.left = `${e.clientX - offsetX}px`;
    ghostEl.style.top  = `${e.clientY - offsetY}px`;

    // Find drop target
    const target = findDropTarget(e.clientX, e.clientY, activeDrag);
    highlightDropTarget(target);
}

function onDragEnd(e: MouseEvent): void {
    if (!activeDrag) return;
    document.removeEventListener('mousemove', onDragMove);

    const { sourceEl, ghostEl, containerEl, itemId, onReorder } = activeDrag;

    const target = findDropTarget(e.clientX, e.clientY, activeDrag);
    clearDropHighlights(containerEl);

    ghostEl.remove();
    sourceEl.removeClass('floaty-drag-source');

    if (target && target !== itemId) {
        // Build new order by swapping itemId into target's position
        const draggableItems = Array.from(
            containerEl.querySelectorAll<HTMLElement>('[data-floaty-id]')
        ).map(el => el.dataset.floatyId as ToolbarItemId);

        const fromIdx = draggableItems.indexOf(itemId);
        const toIdx   = draggableItems.indexOf(target);
        if (fromIdx !== -1 && toIdx !== -1) {
            draggableItems.splice(fromIdx, 1);
            draggableItems.splice(toIdx, 0, itemId);
            onReorder(draggableItems);
        }
    }

    activeDrag = null;
}

function findDropTarget(x: number, y: number, drag: DragState): ToolbarItemId | null {
    const items = Array.from(
        drag.containerEl.querySelectorAll<HTMLElement>('[data-floaty-id]')
    );
    for (const el of items) {
        const r = el.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
            return el.dataset.floatyId as ToolbarItemId;
        }
    }
    return null;
}

function highlightDropTarget(targetId: ToolbarItemId | null): void {
    if (!activeDrag) return;
    const items = Array.from(
        activeDrag.containerEl.querySelectorAll<HTMLElement>('[data-floaty-id]')
    );
    for (const el of items) {
        if (el.dataset.floatyId === targetId && targetId !== activeDrag.itemId) {
            el.addClass('floaty-drop-target');
        } else {
            el.removeClass('floaty-drop-target');
        }
    }
}

function clearDropHighlights(container: HTMLElement): void {
    container.querySelectorAll<HTMLElement>('.floaty-drop-target')
        .forEach(el => el.removeClass('floaty-drop-target'));
}

// ─── FloatyToolbar ────────────────────────────────────────────────────────────

export class FloatyToolbar {
    private containerEl: HTMLElement | null = null;
    private hideTimer:   ReturnType<typeof setTimeout> | null = null;

    private dockEl:       HTMLElement | null      = null;
    private dockEditor:   Editor | null           = null;
    private dockSettings: PluginSettings | null   = null;
    private dockIsVisible                         = false;
    private dockAutoHideTimer: ReturnType<typeof setTimeout> | null = null;

    // Peek state — the two-phase reveal
    private dockIsPeeking = false;
    private dockPeekTimer: ReturnType<typeof setTimeout> | null = null;

    private _onMouseMove: ((e: MouseEvent) => void) | null   = null;
    private _onKeyDown:   ((e: KeyboardEvent) => void) | null = null;

    private openDropdown: HTMLElement | null = null;

    onPinToggle: ((docked: boolean) => void) | null = null;
    hud:         FloatyHud | null                   = null;

    // Callback so main.ts can persist the new order
    onButtonReorder: ((newOrder: ToolbarItemId[]) => void) | null = null;

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
            // Dock already exists — just update editor ref. Do NOT call dockReveal()
            // here: that would cancel the auto-hide timer every time a selection
            // change fires, making the dock impossible to hide while typing.
            this.dockEditor   = editor;
            this.dockSettings = settings;
            // If the dock is hidden, reveal it (e.g. user switched notes)
            if (!this.dockIsVisible && !this.dockIsPeeking) {
                this.dockReveal();
            }
            return;
        }

        const dock = document.body.createEl('div', { cls: 'floaty-dock' });
        this.dockEl = dock;

        this.buildToolbarContent(dock, () => this.dockEditor!, settings, true);
        this.setupKeyboardNav(dock);
        this.hud?.setDockedMode(true, dock);

        // Rise animation
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                dock.addClass('dock-rising');
                dock.addEventListener('animationend', () => {
                    dock.removeClass('dock-rising');
                    dock.addClass('dock-visible');
                    this.dockIsVisible  = true;
                    this.dockIsPeeking  = false;
                }, { once: true });
            });
        });

        // Auto-hide on typing
        this._onKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            if (this.openDropdown) return;
            if (this.dockEl?.contains(e.target as Node)) return;
            // eslint-disable-next-line no-console
            console.log('[floaty] keydown fired, dockIsVisible=', this.dockIsVisible, 'key=', e.key);
            this.dockAutoHide();
        };
        document.addEventListener('keydown', this._onKeyDown, true);

        // Mouse proximity logic — peek zone and full-reveal zone
        this._onMouseMove = (e: MouseEvent) => {
            const fromBottom = window.innerHeight - e.clientY;

            if (fromBottom <= 12) {
                // Deep inside edge → full reveal
                this.cancelPeek();
                this.dockReveal();
            } else if (fromBottom <= 72) {
                // eslint-disable-next-line no-console
                console.log('[floaty] mousemove in peek zone — fromBottom=', fromBottom, 'dockIsVisible=', this.dockIsVisible, 'dockIsPeeking=', this.dockIsPeeking, 'classes=', this.dockEl?.className);
                // Outer hot zone → start peek if not already visible or peeking
                if (!this.dockIsVisible && !this.dockIsPeeking) {
                    this.startPeek();
                }
            } else {
                // Outside zone — cancel peek if it hasn't fired
                this.cancelPeek();
            }
        };
        document.addEventListener('mousemove', this._onMouseMove, { passive: true });

        // Hovering the dock itself cancels auto-hide
        dock.addEventListener('mouseenter', () => {
            this.cancelPeek();
            if (this.dockAutoHideTimer !== null) { clearTimeout(this.dockAutoHideTimer); this.dockAutoHideTimer = null; }
            this.dockReveal();
        });

        // Mouse leaving dock toward content area starts the hide timer
        dock.addEventListener('mouseleave', (e: MouseEvent) => {
            // Only auto-hide if moving upward (away from bottom edge, into content)
            if (e.clientY < window.innerHeight - 100) {
                this.dockAutoHide();
            }
        });
    }

    // Two-phase reveal: first a tiny peek, then full rise on continued hover
    private startPeek(): void {
        // eslint-disable-next-line no-console
        console.log('[floaty] startPeek called — dockIsPeeking=', this.dockIsPeeking, 'dockIsVisible=', this.dockIsVisible, 'dockEl=', !!this.dockEl, 'classes=', this.dockEl?.className);
        if (this.dockIsPeeking || this.dockIsVisible || !this.dockEl) return;
        this.dockIsPeeking = true;
        this.dockEl.addClass('dock-peeking');
        // eslint-disable-next-line no-console
        console.log('[floaty] startPeek — added dock-peeking, classes now=', this.dockEl.className);

        // After a short delay, if mouse is still in zone, do full reveal
        this.dockPeekTimer = setTimeout(() => {
            this.dockPeekTimer = null;
            // Check mouse is still near bottom — _onMouseMove will have called
            // dockReveal() already if they moved into the 72px zone
        }, 300);
    }

    private cancelPeek(): void {
        // eslint-disable-next-line no-console
        console.log('[floaty] cancelPeek called — dockIsPeeking=', this.dockIsPeeking, 'dockIsVisible=', this.dockIsVisible);
        if (this.dockPeekTimer !== null) { clearTimeout(this.dockPeekTimer); this.dockPeekTimer = null; }
        if (this.dockIsPeeking && !this.dockIsVisible) {
            this.dockEl?.removeClass('dock-peeking');
            this.dockIsPeeking = false;
        }
    }

    private dockReveal(): void {
        if (!this.dockEl) return;
        if (this.dockAutoHideTimer !== null) { clearTimeout(this.dockAutoHideTimer); this.dockAutoHideTimer = null; }
        if (this.dockIsVisible) return;

        // Strip any animation classes so the transition (not a keyframe) drives the reveal
        this.dockEl.removeClass('dock-hidden', 'dock-peeking', 'dock-hiding', 'dock-rising');
        // Force a reflow so the browser registers the class removal before adding dock-visible
        void this.dockEl.offsetWidth;
        this.dockEl.addClass('dock-visible');
        this.dockIsVisible = true;
        this.dockIsPeeking = false;
    }

    // Called by mountDock when the dock already exists and the editor fires
    // selection-change. We intentionally do NOT cancel the auto-hide timer here —
    // the dock is already mounted and the selection change doesn't mean the user
    // wants it visible again (keystrokes handle auto-hide separately).
    private dockRefreshEditor(editor: Editor, settings: PluginSettings): void {
        this.dockEditor   = editor;
        this.dockSettings = settings;
        // Only reveal if already visible; don't fight the auto-hide timer
        if (this.dockIsVisible) return;
    }

    private dockAutoHide(): void {
        // eslint-disable-next-line no-console
        console.log('[floaty] dockAutoHide called, dockIsVisible=', this.dockIsVisible, 'dockEl=', !!this.dockEl);
        if (!this.dockEl || !this.dockIsVisible) return;
        if (this.dockAutoHideTimer !== null) clearTimeout(this.dockAutoHideTimer);
        // eslint-disable-next-line no-console
        console.log('[floaty] scheduling hide in 1200ms');
        this.dockAutoHideTimer = setTimeout(() => {
            // eslint-disable-next-line no-console
            console.log('[floaty] hide timer fired, dockEl=', !!this.dockEl, 'classes=', this.dockEl?.className);
            if (!this.dockEl) return;
            this.dockEl.removeClass('dock-visible');
            // Force a reflow so the browser flushes the dock-visible style before
            // dock-hiding (which has transition:none) is applied — otherwise the
            // base opacity/transform transition fights the keyframe animation.
            void this.dockEl.offsetWidth;
            this.dockEl.addClass('dock-hiding');
            // eslint-disable-next-line no-console
            console.log('[floaty] classes after adding dock-hiding:', this.dockEl.className);

            // dock-hiding uses an animation (not a transition), so listen for animationend
            this.dockIsVisible    = false;
            this.dockAutoHideTimer = null;

            let ended = false;
            const onEnd = () => {
                if (ended) return;
                ended = true;
                // eslint-disable-next-line no-console
                console.log('[floaty] animationend/fallback fired, switching to dock-hidden');
                this.dockEl?.removeClass('dock-hiding');
                this.dockEl?.addClass('dock-hidden');
            };
            this.dockEl.addEventListener('animationend', onEnd, { once: true });
            // Safety fallback
            setTimeout(onEnd, 400);
        }, 1200);
    }

    private destroyDock(): void {
        this.hud?.setDockedMode(false, null);
        if (this._onKeyDown)   document.removeEventListener('keydown',   this._onKeyDown, true);
        if (this._onMouseMove) document.removeEventListener('mousemove', this._onMouseMove);
        this._onKeyDown    = null;
        this._onMouseMove  = null;
        if (this.dockAutoHideTimer !== null) { clearTimeout(this.dockAutoHideTimer); this.dockAutoHideTimer = null; }
        if (this.dockPeekTimer     !== null) { clearTimeout(this.dockPeekTimer);     this.dockPeekTimer     = null; }
        this.dockEl?.remove();
        this.dockEl        = null;
        this.dockEditor    = null;
        this.dockSettings  = null;
        this.dockIsVisible = false;
        this.dockIsPeeking = false;
    }

    destroyDockAnimated(onDone: () => void): void {
        this.hud?.setDockedMode(false, null);
        if (!this.dockEl) { onDone(); return; }
        if (this._onKeyDown)   document.removeEventListener('keydown',   this._onKeyDown, true);
        if (this._onMouseMove) document.removeEventListener('mousemove', this._onMouseMove);
        this._onKeyDown   = null;
        this._onMouseMove = null;
        if (this.dockAutoHideTimer !== null) { clearTimeout(this.dockAutoHideTimer); this.dockAutoHideTimer = null; }
        if (this.dockPeekTimer     !== null) { clearTimeout(this.dockPeekTimer);     this.dockPeekTimer     = null; }
        const el   = this.dockEl;
        let   done = false;
        const finish = () => { if (done) return; done = true; el.remove(); onDone(); };
        el.removeClass('dock-visible', 'dock-hidden', 'dock-rising', 'dock-peeking');
        el.addClass('dock-falling');
        el.addEventListener('animationend', finish, { once: true });
        setTimeout(finish, 400);
        this.dockEl        = null;
        this.dockEditor    = null;
        this.dockSettings  = null;
        this.dockIsVisible = false;
        this.dockIsPeeking = false;
    }

    // ── Floating toolbar ──────────────────────────────────────────────────────

    private showFloating(editor: Editor, mouse: { x: number; y: number }, settings: PluginSettings): void {
        if (this.hideTimer !== null) { clearTimeout(this.hideTimer); this.hideTimer = null; }

        const alreadyVisible = this.containerEl !== null;

        if (!alreadyVisible) {
            this.containerEl = document.body.createEl('div', { cls: 'floaty-toolbar' });
            this.buildToolbarContent(this.containerEl, () => editor, settings, false);
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
        container:  HTMLElement,
        getEditor:  () => Editor,
        settings:   PluginSettings,
        isDock:     boolean
    ): void {
        const above    = isDock;
        const order    = settings.buttonOrder ?? DEFAULT_BUTTON_ORDER;
        let   lastType = ''; // track whether to insert a divider

        const getType = (id: ToolbarItemId): string => {
            if (id === 'bold' || id === 'italic')                           return 'emphasis';
            if (id === 'strikethrough' || id === 'code')                    return 'inline';
            if (id === 'highlight' || id === 'link')                        return 'insert';
            if (id === 'heading' || id === 'callout')                       return 'block';
            return 'other';
        };

        for (const id of order) {
            const type = getType(id);
            if (lastType && type !== lastType) {
                container.createEl('div', { cls: 'floaty-divider' });
            }
            lastType = type;

            if (id === 'heading') {
                this.createHeadingDropdown(container, getEditor, above, isDock);
            } else if (id === 'callout') {
                this.createCalloutDropdown(container, getEditor, above, isDock);
            } else {
                const action = ALL_ACTIONS.find(a => a.id === id);
                if (action) this.createActionItem(container, action, getEditor, settings, isDock);
            }
        }

        container.createEl('div', { cls: 'floaty-divider' });
        this.createPinButton(container, settings, isDock);
    }

    // ── Pin button ────────────────────────────────────────────────────────────

    private createPinButton(container: HTMLElement, settings: PluginSettings, isDock: boolean): void {
        const btn = container.createEl('div', {
            cls:  'floaty-pin-btn' + (isDock ? ' is-pinned' : ''),
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

        panel.addClass('floaty-measuring');

        const tr   = triggerEl.getBoundingClientRect();
        let   left = tr.left;
        panel.style.left = `${left}px`;

        requestAnimationFrame(() => {
            const pr = panel.getBoundingClientRect();
            if (left + pr.width > window.innerWidth - 8) left = window.innerWidth - pr.width - 8;
            left = Math.max(8, left);

            const top = openUpward ? tr.top - pr.height - 8 : tr.bottom + 6;

            panel.style.left = `${left}px`;
            panel.style.top  = `${Math.max(8, top)}px`;
            panel.removeClass('floaty-measuring');
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

    private createHeadingDropdown(container: HTMLElement, getEditor: () => Editor, openUpward: boolean, isDock: boolean): void {
        const wrapper = container.createEl('div', { cls: 'floaty-item-wrapper', attr: { 'data-floaty-id': 'heading' } });
        this.attachLongPressDrag(wrapper, 'heading', container, isDock);

        const trigger = wrapper.createEl('div', {
            cls:  'floaty-dropdown-trigger',
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
        const wrapper = container.createEl('div', { cls: 'floaty-item-wrapper', attr: { 'data-floaty-id': 'callout' } });
        this.attachLongPressDrag(wrapper, 'callout', container, isDock);

        const trigger = wrapper.createEl('div', {
            cls:  'floaty-dropdown-trigger',
            attr: { role: 'button', tabindex: '0' },
        });
        setIcon(trigger, 'quote-glyph');
        trigger.appendChild(createChevronSvg());
        attachTooltip(trigger, 'Callout', openUpward);

        const open = () => {
            if (trigger.hasClass('is-open')) { this.closeDropdown(); return; }
            const panel = this.openDropdownPanel(trigger, openUpward);
            for (const opt of CALLOUT_OPTIONS) {
                const item     = panel.createEl('div', { cls: 'floaty-dropdown-item' });
                const iconWrap = item.createEl('span', { cls: `floaty-callout-icon-${opt.type}` });
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

    // ── Action button ─────────────────────────────────────────────────────────

    private createActionItem(
        container: HTMLElement,
        cfg:       IconAction,
        getEditor: () => Editor,
        settings:  PluginSettings,
        isDock:    boolean
    ): void {
        // Wrapper carries the data-floaty-id for drag-reorder hit testing
        const wrapper = container.createEl('div', {
            cls:  'floaty-item-wrapper',
            attr: { 'data-floaty-id': cfg.id },
        });
        this.attachLongPressDrag(wrapper, cfg.id as ToolbarItemId, container, isDock);

        const item = wrapper.createEl('div', {
            cls:  'floaty-action-item',
            attr: { role: 'button', tabindex: '0' },
        });
        setIcon(item, cfg.icon);
        attachTooltip(item, cfg.tooltip, isDock);

        const execute = () => {
            const result = cfg.action(getEditor(), settings);
            if (!isDock) {
                if (result instanceof Promise) void result.then(() => this.hideFloating());
                else this.hideFloating();
            }
        };

        item.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); execute(); });
        item.addEventListener('keydown',   (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); execute(); } });
    }

    // ── Long-press drag attachment ────────────────────────────────────────────

    private attachLongPressDrag(
        el:          HTMLElement,
        itemId:      ToolbarItemId,
        containerEl: HTMLElement,
        isDock:      boolean
    ): void {
        let longPressTimer: ReturnType<typeof setTimeout> | null = null;
        let startEvt: MouseEvent | null = null;

        el.addEventListener('mousedown', (e: MouseEvent) => {
            if (e.button !== 0) return;
            startEvt = e;

            longPressTimer = setTimeout(() => {
                longPressTimer = null;
                if (!startEvt) return;
                // Show drag-ready state before user moves
                el.addClass('floaty-long-press-ready');
                startDrag(itemId, el, containerEl, startEvt, isDock, (newOrder) => {
                    if (this.onButtonReorder) this.onButtonReorder(newOrder);
                });
            }, LONG_PRESS_MS);
        });

        el.addEventListener('mouseup', () => {
            if (longPressTimer !== null) { clearTimeout(longPressTimer); longPressTimer = null; }
            el.removeClass('floaty-long-press-ready');
        });

        el.addEventListener('mouseleave', () => {
            if (longPressTimer !== null) { clearTimeout(longPressTimer); longPressTimer = null; }
            el.removeClass('floaty-long-press-ready');
        });
    }
}