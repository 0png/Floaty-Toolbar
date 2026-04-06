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

interface IconAction {
    icon: string;
    tooltip: string;
    action: (editor: Editor) => void;
}

// Standard formatting actions (no dropdown)
const ACTIONS: IconAction[] = [
    { icon: 'bold',          tooltip: 'Bold',          action: applyBold },
    { icon: 'italic',        tooltip: 'Italic',        action: applyItalic },
    { icon: 'strikethrough', tooltip: 'Strikethrough', action: applyStrikethrough },
    { icon: 'code',          tooltip: 'Inline Code',   action: applyCode },
    { icon: 'highlighter',   tooltip: 'Highlight',     action: applyHighlight },
    { icon: 'link',          tooltip: 'Insert Link',   action: applyLink },
];

const TOOLBAR_W_ESTIMATE = 340;
const TOOLBAR_H_ESTIMATE = 44;
const GAP = 10;

// ── Heading dropdown options ────────────────────────────────────────────────
const HEADING_OPTIONS: { label: string; level: 0 | 1 | 2 | 3 | 4 }[] = [
    { label: 'H1', level: 1 },
    { label: 'H2', level: 2 },
    { label: 'H3', level: 3 },
    { label: 'H4', level: 4 },
    { label: 'Plain', level: 0 },
];

// ── Callout dropdown options ────────────────────────────────────────────────
const CALLOUT_OPTIONS: { label: string; type: CalloutType; icon: string }[] = [
    { label: 'Note',      type: 'note',      icon: 'info' },
    { label: 'Tip',       type: 'tip',       icon: 'lightbulb' },
    { label: 'Warning',   type: 'warning',   icon: 'alert-triangle' },
    { label: 'Important', type: 'important', icon: 'alert-circle' },
    { label: 'Caution',   type: 'caution',   icon: 'flame' },
];

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

        /* ── Toolbar container ─────────────────────────────────────────────── */
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

        /* ── Divider ───────────────────────────────────────────────────────── */
        .floaty-divider {
            width: 1px;
            height: 18px;
            background: var(--divider-color);
            margin: 0 3px;
            flex-shrink: 0;
            border-radius: 1px;
        }

        /* ── Regular action buttons ────────────────────────────────────────── */
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

        /* ── Heading / Callout trigger buttons ─────────────────────────────── */
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
        .floaty-dropdown-trigger:hover {
            background: var(--background-modifier-hover);
            color: var(--text-normal);
        }
        .floaty-dropdown-trigger.is-open {
            background: var(--background-modifier-hover);
            color: var(--text-normal);
        }
        .floaty-dropdown-trigger svg {
            width: 14px;
            height: 14px;
            pointer-events: none;
            stroke-width: 2px;
            flex-shrink: 0;
        }
        /* Small chevron indicator */
        .floaty-dropdown-trigger .floaty-chevron {
            width: 10px;
            height: 10px;
            opacity: 0.5;
            transition: transform 150ms ease, opacity 150ms ease;
        }
        .floaty-dropdown-trigger.is-open .floaty-chevron {
            transform: rotate(180deg);
            opacity: 0.8;
        }

        /* ── Dropdown panel ────────────────────────────────────────────────── */
        .floaty-dropdown {
            position: fixed;
            z-index: 10000;
            min-width: 130px;
            padding: 4px;
            background: var(--background-floating, var(--background-primary));
            border: 1px solid var(--divider-color);
            border-radius: var(--radius-m);
            box-shadow:
                0 8px 24px rgba(0, 0, 0, 0.2),
                0 2px 8px rgba(0, 0, 0, 0.12),
                0 0 0 1px var(--background-modifier-border);
            animation: floaty-dropdown-in 150ms cubic-bezier(0.25, 1, 0.5, 1) forwards;
        }

        /* ── Dropdown items ────────────────────────────────────────────────── */
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
        .floaty-dropdown-item:hover {
            background: var(--background-modifier-hover);
            color: var(--text-normal);
        }
        .floaty-dropdown-item:active {
            background: var(--background-modifier-active-hover);
        }
        .floaty-dropdown-item svg {
            width: 14px;
            height: 14px;
            flex-shrink: 0;
            stroke-width: 2px;
            color: var(--text-faint);
        }
        .floaty-dropdown-item:hover svg {
            color: var(--text-muted);
        }

        /* Heading items: show the H label in a styled badge */
        .floaty-heading-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 20px;
            border-radius: 4px;
            background: var(--background-modifier-hover);
            color: var(--text-normal);
            font-size: 11px;
            font-weight: 700;
            font-family: var(--font-monospace);
            flex-shrink: 0;
        }
        .floaty-dropdown-item:hover .floaty-heading-badge {
            background: var(--interactive-accent);
            color: var(--text-on-accent);
        }
        /* Plain text item */
        .floaty-heading-plain {
            font-size: 12px;
            color: var(--text-faint);
        }

        /* Callout colour accents on the icon */
        .floaty-callout-icon-note      { color: var(--color-blue); }
        .floaty-callout-icon-tip       { color: var(--color-green); }
        .floaty-callout-icon-warning   { color: var(--color-yellow); }
        .floaty-callout-icon-important { color: var(--color-purple); }
        .floaty-callout-icon-caution   { color: var(--color-red); }
    `;
    document.head.appendChild(style);
}

/** Creates a chevron-down SVG using the correct SVG namespace (not createEl). */
function createChevronSvg(): SVGSVGElement {
    const NS = 'http://www.w3.org/2000/svg';
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

export class FloatyToolbar {
    private containerEl: HTMLElement | null = null;
    private hideTimer: ReturnType<typeof setTimeout> | null = null;
    /** Currently open dropdown panel — kept so contains() covers it */
    private openDropdown: HTMLElement | null = null;

    show(editor: Editor, mouse: { x: number; y: number }): void {
        ensureStyles();

        if (this.hideTimer !== null) {
            clearTimeout(this.hideTimer);
            this.hideTimer = null;
        }

        const alreadyVisible = this.containerEl !== null;

        if (!alreadyVisible) {
            this.containerEl = document.body.createEl('div', { cls: 'floaty-toolbar' });

            // Group 1: bold, italic
            this.createActionItem(ACTIONS[0], editor);
            this.createActionItem(ACTIONS[1], editor);
            this.containerEl.createEl('div', { cls: 'floaty-divider' });

            // Group 2: strikethrough, code
            this.createActionItem(ACTIONS[2], editor);
            this.createActionItem(ACTIONS[3], editor);
            this.containerEl.createEl('div', { cls: 'floaty-divider' });

            // Group 3: highlight, link
            this.createActionItem(ACTIONS[4], editor);
            this.createActionItem(ACTIONS[5], editor);
            this.containerEl.createEl('div', { cls: 'floaty-divider' });

            // Group 4: heading dropdown + callout dropdown
            this.createHeadingDropdown(editor);
            this.containerEl.createEl('div', { cls: 'floaty-divider' });
            this.createCalloutDropdown(editor);

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

    hide(): void {
        // Close any open dropdown first
        this.closeDropdown();

        if (!this.containerEl) return;

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

    /** Returns true if the node is inside the toolbar OR any open dropdown */
    contains(node: Node): boolean {
        return (
            (this.containerEl?.contains(node) ?? false) ||
            (this.openDropdown?.contains(node) ?? false)
        );
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private closeDropdown(): void {
        if (!this.openDropdown) return;
        this.openDropdown.remove();
        this.openDropdown = null;
        // Un-highlight all trigger buttons
        this.containerEl?.querySelectorAll('.floaty-dropdown-trigger').forEach(el => {
            el.removeClass('is-open');
        });
    }

    /**
     * Opens a dropdown panel anchored below (or above) a trigger button.
     * Returns the panel element.
     */
    private openDropdownPanel(triggerEl: HTMLElement): HTMLElement {
        // If a dropdown is already open, close it first
        this.closeDropdown();

        triggerEl.addClass('is-open');

        const panel = document.body.createEl('div', { cls: 'floaty-dropdown' });
        this.openDropdown = panel;

        // Position: below the trigger, aligned to its left edge
        const tr = triggerEl.getBoundingClientRect();
        let left = tr.left;
        let top  = tr.bottom + 6;

        // Clamp right edge
        // We don't know width yet — use rAF to adjust after render
        requestAnimationFrame(() => {
            const pr = panel.getBoundingClientRect();
            if (left + pr.width > window.innerWidth - 8) {
                left = window.innerWidth - pr.width - 8;
            }
            // Flip above if not enough room below
            if (top + pr.height > window.innerHeight - 8) {
                top = tr.top - pr.height - 6;
            }
            panel.style.left = `${left}px`;
            panel.style.top  = `${top}px`;
        });

        // Set initial position before rAF so it doesn't flash at 0,0
        panel.style.left = `${left}px`;
        panel.style.top  = `${top}px`;

        // Close on outside click (next event loop tick so this click doesn't count)
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

    /** Builds the heading dropdown trigger + panel */
    private createHeadingDropdown(editor: Editor): void {
        if (!this.containerEl) return;

        const trigger = this.containerEl.createEl('div', {
            cls: 'floaty-dropdown-trigger',
            attr: { 'aria-label': 'Heading', role: 'button', tabindex: '0' },
        });

        // "H" text label + chevron
        trigger.createSpan({ text: 'H' });
        trigger.appendChild(createChevronSvg());

        trigger.addEventListener('mousedown', (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();

            if (trigger.hasClass('is-open')) {
                this.closeDropdown();
                return;
            }

            const panel = this.openDropdownPanel(trigger);

            for (const opt of HEADING_OPTIONS) {
                const item = panel.createEl('div', { cls: 'floaty-dropdown-item' });

                if (opt.level === 0) {
                    item.createSpan({ cls: 'floaty-heading-plain', text: 'Plain text' });
                } else {
                    const badge = item.createEl('span', { cls: 'floaty-heading-badge', text: `H${opt.level}` });
                    // Size hint in the label
                    const sizes = ['', '2em', '1.5em', '1.25em', '1em'];
                    badge.style.fontSize = '11px';
                    item.createSpan({ text: `Heading ${opt.level}` });
                }

                item.addEventListener('mousedown', (e: MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    applyHeading(editor, opt.level);
                    this.closeDropdown();
                    this.hide();
                });
            }
        });
    }

    /** Builds the callout dropdown trigger + panel */
    private createCalloutDropdown(editor: Editor): void {
        if (!this.containerEl) return;

        const trigger = this.containerEl.createEl('div', {
            cls: 'floaty-dropdown-trigger',
            attr: { 'aria-label': 'Callout', role: 'button', tabindex: '0' },
        });

        // Quote icon + chevron
        setIcon(trigger, 'quote-glyph');
        trigger.appendChild(createChevronSvg());

        trigger.addEventListener('mousedown', (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();

            if (trigger.hasClass('is-open')) {
                this.closeDropdown();
                return;
            }

            const panel = this.openDropdownPanel(trigger);

            for (const opt of CALLOUT_OPTIONS) {
                const item = panel.createEl('div', { cls: 'floaty-dropdown-item' });

                // Coloured icon
                const iconWrap = item.createEl('span', { cls: `floaty-callout-icon-${opt.type}` });
                setIcon(iconWrap, opt.icon);

                item.createSpan({ text: opt.label });

                item.addEventListener('mousedown', (e: MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    applyCallout(editor, opt.type);
                    this.closeDropdown();
                    this.hide();
                });
            }
        });
    }

    private positionToolbar(mouse: { x: number; y: number }): void {
        if (!this.containerEl) return;

        const selRect = getSelectionRect();

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

        this.containerEl.style.left = `${left}px`;
        this.containerEl.style.top  = `${top}px`;
    }

    private createActionItem(cfg: IconAction, editor: Editor): void {
        if (!this.containerEl) return;

        const item = this.containerEl.createEl('div', {
            cls: 'floaty-action-item',
            attr: {
                'aria-label': cfg.tooltip,
                role: 'button',
                tabindex: '0',
            },
        });

        setIcon(item, cfg.icon);

        item.addEventListener('mousedown', (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
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