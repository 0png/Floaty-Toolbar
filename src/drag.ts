import type { ToolbarItemId } from './toolbar-types';
import { hideTooltip } from './tooltip';

// ─── Drag-reorder system ──────────────────────────────────────────────────────
//
// Long-press on any toolbar item fires startDrag(). A ghost element follows the
// cursor; releasing over another item triggers onReorder with the new order array.
// Only one drag can be in flight at a time (guarded by activeDrag).

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

export function startDrag(
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
