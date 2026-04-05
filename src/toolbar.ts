import { Editor, setIcon } from 'obsidian';
import {
    applyBold,
    applyItalic,
    applyStrikethrough,
    applyCode,
    applyHighlight,
    applyLink,
    getSelectionRect,
} from './utils';

interface IconAction {
    icon: string;
    tooltip: string;
    action: (editor: Editor) => void;
}

const ACTIONS: IconAction[] = [
    { icon: 'bold',          tooltip: 'Bold',          action: applyBold },
    { icon: 'italic',        tooltip: 'Italic',        action: applyItalic },
    { icon: 'strikethrough', tooltip: 'Strikethrough', action: applyStrikethrough },
    { icon: 'code',          tooltip: 'Inline Code',   action: applyCode },
    { icon: 'highlighter',   tooltip: 'Highlight',     action: applyHighlight },
    { icon: 'link',          tooltip: 'Insert Link',   action: applyLink },
];

const TOOLBAR_W_ESTIMATE = 260;
const TOOLBAR_H_ESTIMATE = 44;
const GAP = 10;

/**
 * Inject critical styles into <head> using official Obsidian CSS variables.
 * This ensures the toolbar is visible even if styles.css fails to load,
 * and automatically adapts to any theme (light/dark/custom).
 */
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

        .floaty-toolbar {
            position: fixed !important;
            z-index: 9999 !important;
            display: flex !important;
            align-items: center;
            gap: 1px;
            padding: 4px 6px;

            /* Use Obsidian's floating surface variable, fall back to primary background */
            background: var(--background-floating, var(--background-primary));
            color: var(--text-normal);

            border: 1px solid var(--divider-color);
            border-radius: var(--radius-m);
            box-shadow:
                0 4px 16px rgba(0, 0, 0, 0.25),
                0 1px 4px rgba(0, 0, 0, 0.15),
                0 0 0 1px var(--background-modifier-border);

            opacity: 0;
            pointer-events: none;
            transition: left 80ms ease, top 80ms ease;
        }

        .floaty-toolbar.is-active {
            pointer-events: auto !important;
            animation: floaty-in 200ms cubic-bezier(0.25, 1, 0.5, 1) forwards !important;
        }

        .floaty-toolbar.is-hiding {
            pointer-events: none !important;
            animation: floaty-out 160ms cubic-bezier(0.4, 0, 1, 1) forwards !important;
        }

        /* Divider between button groups */
        .floaty-divider {
            width: 1px;
            height: 18px;
            background: var(--divider-color);
            margin: 0 3px;
            flex-shrink: 0;
            border-radius: 1px;
        }

        /* Individual action buttons */
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

        .floaty-action-item:active {
            transform: scale(0.88);
            background: var(--background-modifier-active-hover);
            color: var(--text-normal);
        }

        .floaty-action-item:focus-visible {
            outline: 2px solid var(--interactive-accent);
            outline-offset: -2px;
        }

        .floaty-action-item svg {
            width: 16px;
            height: 16px;
            pointer-events: none;
            stroke-width: 2px;
        }
    `;
    document.head.appendChild(style);
    console.log('[FloatyToolbar] injected inline styles with Obsidian CSS variables');
}

export class FloatyToolbar {
    private containerEl: HTMLElement | null = null;
    private hideTimer: ReturnType<typeof setTimeout> | null = null;

    show(editor: Editor, mouse: { x: number; y: number }): void {
        console.log('[FloatyToolbar] show() called | mouse:', mouse, '| containerEl exists:', this.containerEl !== null);

        ensureStyles();

        if (this.hideTimer !== null) {
            console.log('[FloatyToolbar] show() cancelling in-flight hideTimer');
            clearTimeout(this.hideTimer);
            this.hideTimer = null;
        }

        const alreadyVisible = this.containerEl !== null;

        if (!alreadyVisible) {
            console.log('[FloatyToolbar] show() creating DOM element');
            this.containerEl = document.body.createEl('div', { cls: 'floaty-toolbar' });

            const groups = [
                ACTIONS.slice(0, 2),
                ACTIONS.slice(2, 4),
                ACTIONS.slice(4),
            ];

            groups.forEach((group, gi) => {
                group.forEach(action => this.createActionItem(action, editor));
                if (gi < groups.length - 1) {
                    this.containerEl!.createEl('div', { cls: 'floaty-divider' });
                }
            });

            console.log('[FloatyToolbar] show() DOM created, children:', this.containerEl.children.length);
        } else {
            console.log('[FloatyToolbar] show() toolbar already visible, refreshing');
            this.containerEl!.removeClass('is-hiding');
            this.containerEl!.addClass('is-active');
        }

        this.positionToolbar(mouse);

        if (!alreadyVisible) {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    console.log('[FloatyToolbar] show() adding is-active class');
                    this.containerEl?.addClass('is-active');
                });
            });
        }
    }

    hide(): void {
        if (!this.containerEl) {
            console.log('[FloatyToolbar] hide() nothing to hide');
            return;
        }

        console.log('[FloatyToolbar] hide() hiding toolbar');
        const el = this.containerEl;
        this.containerEl = null;

        el.removeClass('is-active');
        el.addClass('is-hiding');

        this.hideTimer = setTimeout(() => {
            el.remove();
            this.hideTimer = null;
        }, 200);

        el.addEventListener('animationend', () => {
            if (this.hideTimer !== null) {
                clearTimeout(this.hideTimer);
                this.hideTimer = null;
            }
            el.remove();
        }, { once: true });
    }

    contains(node: Node): boolean {
        return this.containerEl?.contains(node) ?? false;
    }

    private positionToolbar(mouse: { x: number; y: number }): void {
        if (!this.containerEl) return;

        const selRect = getSelectionRect();
        console.log('[FloatyToolbar] positionToolbar() selRect:', selRect);

        let anchorX: number;
        let anchorTop: number;
        let anchorBottom: number;

        if (selRect && selRect.height > 0) {
            anchorX      = selRect.left + selRect.width / 2;
            anchorTop    = selRect.top;
            anchorBottom = selRect.bottom;
        } else {
            anchorX      = mouse.x;
            anchorTop    = mouse.y;
            anchorBottom = mouse.y;
        }

        const tbRect = this.containerEl.getBoundingClientRect();
        const tbW = tbRect.width  || TOOLBAR_W_ESTIMATE;
        const tbH = tbRect.height || TOOLBAR_H_ESTIMATE;

        let left = anchorX - tbW / 2;
        let top  = anchorTop - tbH - GAP;

        left = Math.max(8, Math.min(left, window.innerWidth - tbW - 8));
        if (top < 8) top = anchorBottom + GAP;

        console.log('[FloatyToolbar] positionToolbar() left:', left, 'top:', top);
        this.containerEl.style.left = `${left}px`;
        this.containerEl.style.top  = `${top}px`;
    }

    private createActionItem(cfg: IconAction, editor: Editor): void {
        if (!this.containerEl) return;

        const item = this.containerEl.createEl('div', {
            cls: 'floaty-action-item',
            attr: {
                // aria-label is used by Obsidian's built-in tooltip system — no "title" attr needed
                'aria-label': cfg.tooltip,
                role: 'button',
                tabindex: '0',
            },
        });

        setIcon(item, cfg.icon);

        item.addEventListener('mousedown', (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('[FloatyToolbar] action clicked:', cfg.tooltip);
            cfg.action(editor);
            this.hide();
        });

        item.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                cfg.action(editor);
                this.hide();
            }
        });
    }
}