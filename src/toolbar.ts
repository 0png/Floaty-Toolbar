import { Editor, setIcon } from 'obsidian';
import {
    applyHeading, applyCallout,
    getSelectionRect,
} from './utils';
import type { PluginSettings } from './main';
import type { FloatyHud } from './hud';
import {
    IconAction, ToolbarItemId,
    ALL_ACTIONS, DEFAULT_BUTTON_ORDER,
    HEADING_OPTIONS, CALLOUT_OPTIONS,
    TOOLBAR_W_ESTIMATE, TOOLBAR_H_ESTIMATE, GAP, LONG_PRESS_MS,
} from './toolbar-types';
import { hideTooltip, attachTooltip } from './tooltip';
import { startDrag } from './drag';

// Re-export the public API so main.ts import path stays unchanged
export type { IconAction, ToolbarItemId };
export { ALL_ACTIONS, DEFAULT_BUTTON_ORDER };

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

// ─── FloatyToolbar ────────────────────────────────────────────────────────────

export class FloatyToolbar {
    private containerEl: HTMLElement | null = null;
    private hideTimer:   ReturnType<typeof setTimeout> | null = null;

    private dockEl:       HTMLElement | null    = null;
    private dockEditor:   Editor | null         = null;
    private dockIsVisible                       = false;
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

        if (this.dockEl) {
            // Dock already exists — just update editor ref. Do NOT call dockReveal()
            // here: that would cancel the auto-hide timer every time a selection
            // change fires, making the dock impossible to hide while typing.
            this.dockEditor   = editor;
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

    // ── Dock: two-phase reveal (peek → full) ──────────────────────────────────

    private startPeek(): void {
        if (this.dockIsPeeking || this.dockIsVisible || !this.dockEl) return;
        this.dockIsPeeking = true;
        this.dockEl.addClass('dock-peeking');

        // After a short delay, if mouse is still in zone, do full reveal
        this.dockPeekTimer = setTimeout(() => {
            this.dockPeekTimer = null;
            // _onMouseMove will call dockReveal() if still in the zone
        }, 300);
    }

    private cancelPeek(): void {
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

    // ── Dock: auto-hide ───────────────────────────────────────────────────────

    private dockAutoHide(): void {
        if (!this.dockEl || !this.dockIsVisible) return;
        if (this.dockAutoHideTimer !== null) clearTimeout(this.dockAutoHideTimer);
        this.dockAutoHideTimer = setTimeout(() => {
            if (!this.dockEl) return;
            this.dockEl.removeClass('dock-visible');
            // Force a reflow so the browser flushes the dock-visible style before
            // dock-hiding (which has transition:none) is applied — otherwise the
            // base opacity/transform transition fights the keyframe animation.
            void this.dockEl.offsetWidth;
            this.dockEl.addClass('dock-hiding');

            // dock-hiding uses an animation (not a transition), so listen for animationend
            this.dockIsVisible    = false;
            this.dockAutoHideTimer = null;

            let ended = false;
            const onEnd = () => {
                if (ended) return;
                ended = true;
                this.dockEl?.removeClass('dock-hiding');
                this.dockEl?.addClass('dock-hidden');
            };
            this.dockEl.addEventListener('animationend', onEnd, { once: true });
            // Safety fallback
            setTimeout(onEnd, 400);
        }, 1200);
    }

    // ── Dock: lifecycle ───────────────────────────────────────────────────────

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

    // ── Build toolbar content ─────────────────────────────────────────────────

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
