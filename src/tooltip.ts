// ─── Tooltip system ───────────────────────────────────────────────────────────
//
// A single floating tooltip shared across the entire toolbar. Only one tooltip
// can be visible at a time; showing a new one always cancels the previous.

let tooltipEl:    HTMLElement | null                    = null;
let tooltipTimer: ReturnType<typeof setTimeout> | null  = null;

export function showTooltip(text: string, anchor: HTMLElement, above: boolean): void {
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

export function hideTooltip(): void {
    if (tooltipTimer !== null) { clearTimeout(tooltipTimer); tooltipTimer = null; }
    tooltipEl?.remove();
    tooltipEl = null;
}

export function attachTooltip(el: HTMLElement, text: string, above: boolean): void {
    el.addEventListener('mouseenter', () => showTooltip(text, el, above));
    el.addEventListener('mouseleave', hideTooltip);
    el.addEventListener('mousedown',  hideTooltip);
}
