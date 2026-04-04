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

interface ToolbarButton {
    icon: string;
    tooltip: string;
    action: (editor: Editor) => void;
}

const BUTTONS: ToolbarButton[] = [
    { icon: 'bold',          tooltip: 'Bold (Ctrl+B)',          action: applyBold },
    { icon: 'italic',        tooltip: 'Italic (Ctrl+I)',        action: applyItalic },
    { icon: 'strikethrough', tooltip: 'Strikethrough',          action: applyStrikethrough },
    { icon: 'code',          tooltip: 'Inline Code',            action: applyCode },
    { icon: 'highlighter',   tooltip: 'Highlight',              action: applyHighlight },
    { icon: 'link',          tooltip: 'Insert Link',            action: applyLink },
];

export class FloatyToolbar {
    private containerEl: HTMLElement | null = null;

    /** Show the toolbar near the current text selection. */
    show(editor: Editor): void {
        this.hide(); // remove any stale instance

        const rect = getSelectionRect();
        if (!rect) return;

        // Build container
        this.containerEl = document.body.createEl('div', { cls: 'floaty-toolbar' });

        // Build buttons
        for (const btn of BUTTONS) {
            this.addButton(btn, editor);
        }

        // Add a subtle separator before the link button
        const sep = this.containerEl.children[4] as HTMLElement;
        if (sep) {
            sep.style.borderLeft = '1px solid var(--background-modifier-border)';
            sep.style.marginLeft = '4px';
            sep.style.paddingLeft = '4px';
        }

        // Position: centred above the selection, stays within viewport
        document.body.appendChild(this.containerEl);

        const tbRect = this.containerEl.getBoundingClientRect();
        const gap = 8; // px gap between selection top and toolbar bottom

        let left = rect.left + rect.width / 2 - tbRect.width / 2 + window.scrollX;
        let top  = rect.top  - tbRect.height - gap + window.scrollY;

        // Clamp to viewport
        const maxLeft = window.innerWidth - tbRect.width - 8;
        left = Math.max(8, Math.min(left, maxLeft));

        if (top < window.scrollY + 8) {
            // flip below selection if not enough room above
            top = rect.bottom + gap + window.scrollY;
        }

        this.containerEl.style.left = `${left}px`;
        this.containerEl.style.top  = `${top}px`;

        // Animate in
        requestAnimationFrame(() => {
            this.containerEl?.addClass('floaty-toolbar--visible');
        });
    }

    /** Remove the toolbar from the DOM. */
    hide(): void {
        if (this.containerEl) {
            this.containerEl.remove();
            this.containerEl = null;
        }
    }

    /** Returns true while the toolbar element is present in the DOM. */
    isVisible(): boolean {
        return this.containerEl !== null;
    }

    /** Returns true if the given node is inside the toolbar element. */
    contains(node: Node): boolean {
        return this.containerEl?.contains(node) ?? false;
    }

    // ─── Private helpers ────────────────────────────────────────────────────────

    private addButton(cfg: ToolbarButton, editor: Editor): void {
        if (!this.containerEl) return;

        const btn = this.containerEl.createEl('button', {
            cls: 'floaty-btn',
            attr: { 'aria-label': cfg.tooltip, title: cfg.tooltip },
        });

        setIcon(btn, cfg.icon);

        btn.addEventListener('mousedown', (e: MouseEvent) => {
            // Prevent the editor from losing focus / clearing the selection
            e.preventDefault();
            e.stopPropagation();
            cfg.action(editor);
            this.hide();
        });
    }
}
