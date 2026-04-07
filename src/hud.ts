import { Notice, Plugin, TFile } from 'obsidian';

// ─── Types ────────────────────────────────────────────────────────────────────

type PomodoroPhase = 'idle' | 'work' | 'break';

// ─── Popover helper ───────────────────────────────────────────────────────────

function openPopover(
    anchorEl: HTMLElement,
    build: (panel: HTMLElement) => void
): HTMLElement {
    // Close any existing popovers
    document.querySelectorAll('.floaty-hud-popover').forEach(el => el.remove());

    const panel = document.body.createEl('div', { cls: 'floaty-hud-popover' });
    build(panel);

    // Position above the anchor — start invisible while measuring
    const ar = anchorEl.getBoundingClientRect();
    panel.addClass('is-measuring');
    panel.setCssStyles({ left: `${ar.left}px`, top: '0px' });

    requestAnimationFrame(() => {
        const pr = panel.getBoundingClientRect();
        let left = ar.left + ar.width / 2 - pr.width / 2;
        left = Math.max(8, Math.min(left, window.innerWidth - pr.width - 8));
        const top = ar.top - pr.height - 8;
        panel.setCssStyles({ left: `${left}px`, top: `${Math.max(8, top)}px` });
        panel.removeClass('is-measuring');
    });

    // Close on outside click
    const onOutside = (e: MouseEvent) => {
        if (!panel.contains(e.target as Node) && !anchorEl.contains(e.target as Node)) {
            panel.remove();
            document.removeEventListener('mousedown', onOutside, true);
        }
    };
    setTimeout(() => document.addEventListener('mousedown', onOutside, true), 0);

    return panel;
}

// ─── HUD class ────────────────────────────────────────────────────────────────

export class FloatyHud {
    private plugin: Plugin;

    // Pomodoro state
    private pomPhase: PomodoroPhase = 'idle';
    private pomRemaining  = 0;   // seconds
    private pomWorkMins   = 25;
    private pomBreakMins  = 5;
    private pomTimer: ReturnType<typeof setInterval> | null = null;
    private pomBarItem: HTMLElement | null = null;

    // Session timer (counts up from plugin load)
    private sessionStart   = Date.now();
    private sessionBarItem: HTMLElement | null = null;
    private sessionTimer: ReturnType<typeof setInterval> | null = null;

    // File timer (counts up from file open)
    private fileStart: number | null = null;
    private fileBarItem: HTMLElement | null = null;
    private fileTimer: ReturnType<typeof setInterval> | null = null;
    private currentFile: string | null = null;

    constructor(plugin: Plugin) {
        this.plugin = plugin;
    }

    // ── Public ────────────────────────────────────────────────────────────────

    mount(): void {
        this.mountPomodoro();
        this.mountSessionTimer();
        this.mountFileTimer();
    }

    destroy(): void {
        this.pomStop();
        if (this.sessionTimer) { clearInterval(this.sessionTimer); this.sessionTimer = null; }
        if (this.fileTimer)    { clearInterval(this.fileTimer);    this.fileTimer    = null; }
        document.querySelectorAll('.floaty-hud-popover').forEach(el => el.remove());
    }

    // ── Pomodoro ──────────────────────────────────────────────────────────────

    private mountPomodoro(): void {
        const item = this.plugin.addStatusBarItem();
        item.addClass('floaty-hud-item');
        this.pomBarItem = item;
        this.pomUpdateBar();

        item.addEventListener('click', () => this.openPomodoroPopover(item));
    }

    private pomStart(): void {
        if (this.pomPhase === 'idle') {
            this.pomPhase     = 'work';
            this.pomRemaining = this.pomWorkMins * 60;
        }
        if (this.pomTimer) return;
        this.pomTimer = setInterval(() => {
            this.pomRemaining--;
            this.pomUpdateBar();
            if (this.pomRemaining <= 0) {
                this.pomTick();
            }
        }, 1000);
    }

    private pomPause(): void {
        if (this.pomTimer) { clearInterval(this.pomTimer); this.pomTimer = null; }
    }

    private pomStop(): void {
        this.pomPause();
        this.pomPhase = 'idle';
        this.pomRemaining = 0;
        this.pomUpdateBar();
    }

    private pomTick(): void {
        this.pomPause();
        if (this.pomPhase === 'work') {
            new Notice('🍅 pomodoro done! Take a break.', 8000);
            this.pomPhase     = 'break';
            this.pomRemaining = this.pomBreakMins * 60;
        } else {
            new Notice('✅ break done! Ready for the next pomodoro?', 8000);
            this.pomPhase     = 'idle';
            this.pomRemaining = 0;
        }
        this.pomUpdateBar();
        // Refresh any open popover
        document.querySelectorAll('.floaty-hud-popover').forEach(el => el.remove());
    }

    private pomUpdateBar(): void {
        if (!this.pomBarItem) return;
        const item = this.pomBarItem;
        item.empty();

        item.removeClass('pomodoro-work', 'pomodoro-break');

        if (this.pomPhase === 'idle') {
            item.createSpan({ text: '🍅' });
            item.createSpan({ text: `${this.pomWorkMins}:00` });
        } else {
            const mins = Math.floor(this.pomRemaining / 60).toString().padStart(2, '0');
            const secs = (this.pomRemaining % 60).toString().padStart(2, '0');
            item.createSpan({ text: this.pomPhase === 'work' ? '🍅' : '☕' });
            item.createSpan({ text: `${mins}:${secs}` });
            item.addClass(this.pomPhase === 'work' ? 'pomodoro-work' : 'pomodoro-break');
        }
    }

    private openPomodoroPopover(anchor: HTMLElement): void {
        // If popover already open, close it
        const existing = document.querySelector('.floaty-hud-popover');
        if (existing) { existing.remove(); return; }

        openPopover(anchor, (panel) => {
            panel.createEl('h3', { text: '🍅 pomodoro' });

            // Big countdown
            const countdown = panel.createEl('div', { cls: 'floaty-hud-countdown' });
            const phaseLabel = panel.createEl('div', { cls: 'floaty-hud-phase-label' });

            const refreshCountdown = () => {
                countdown.removeClass('phase-work', 'phase-break');
                if (this.pomPhase === 'idle') {
                    const m = this.pomWorkMins.toString().padStart(2, '0');
                    countdown.textContent = `${m}:00`;
                    phaseLabel.textContent = 'Ready';
                } else {
                    const mins = Math.floor(this.pomRemaining / 60).toString().padStart(2, '0');
                    const secs = (this.pomRemaining % 60).toString().padStart(2, '0');
                    countdown.textContent = `${mins}:${secs}`;
                    phaseLabel.textContent = this.pomPhase === 'work' ? 'Focus' : 'Break';
                    countdown.addClass(this.pomPhase === 'work' ? 'phase-work' : 'phase-break');
                }
            };
            refreshCountdown();

            // Live-update the countdown inside the popover while it's open
            const liveTimer = setInterval(refreshCountdown, 500);
            panel.addEventListener('remove', () => clearInterval(liveTimer));
            // Observe DOM removal for cleanup
            const obs = new MutationObserver(() => {
                if (!document.contains(panel)) { clearInterval(liveTimer); obs.disconnect(); }
            });
            obs.observe(document.body, { childList: true, subtree: false });

            // Controls
            const controls = panel.createEl('div', { cls: 'floaty-hud-controls' });

            const startPauseBtn = controls.createEl('div', {
                cls: 'floaty-hud-btn primary',
                text: this.pomTimer ? 'Pause' : (this.pomPhase === 'idle' ? 'Start' : 'Resume'),
            });
            startPauseBtn.addEventListener('click', () => {
                if (this.pomTimer) {
                    this.pomPause();
                    startPauseBtn.textContent = 'Resume';
                } else {
                    this.pomStart();
                    startPauseBtn.textContent = 'Pause';
                }
            });

            const resetBtn = controls.createEl('div', { cls: 'floaty-hud-btn', text: 'Reset' });
            resetBtn.addEventListener('click', () => {
                this.pomStop();
                startPauseBtn.textContent = 'Start';
                refreshCountdown();
            });

            panel.createEl('div', { cls: 'floaty-hud-sep' });

            // Work duration slider
            this.addSlider(panel, 'Work', 1, 90, this.pomWorkMins, 'min', (v) => {
                this.pomWorkMins = v;
                if (this.pomPhase === 'idle') refreshCountdown();
            });

            // Break duration slider
            this.addSlider(panel, 'Break', 1, 30, this.pomBreakMins, 'min', (v) => {
                this.pomBreakMins = v;
            });
        });
    }

    private addSlider(
        parent: HTMLElement,
        label: string,
        min: number,
        max: number,
        value: number,
        unit: string,
        onChange: (v: number) => void
    ): void {
        const row = parent.createEl('div', { cls: 'floaty-hud-setting-row' });
        row.createEl('span', { cls: 'floaty-hud-setting-label', text: label });
        const slider = row.createEl('input');
        slider.type  = 'range';
        slider.min   = String(min);
        slider.max   = String(max);
        slider.value = String(value);
        const valEl = row.createEl('span', { cls: 'floaty-hud-setting-value', text: `${value}${unit}` });
        slider.addEventListener('input', () => {
            const v = Number(slider.value);
            valEl.textContent = `${v}${unit}`;
            onChange(v);
        });
    }

    // ── Session timer ─────────────────────────────────────────────────────────

    private mountSessionTimer(): void {
        const item = this.plugin.addStatusBarItem();
        item.addClass('floaty-hud-item');
        this.sessionBarItem = item;
        this.updateSessionBar();

        this.sessionTimer = setInterval(() => this.updateSessionBar(), 1000);

        item.addEventListener('click', () => {
            // Click resets session timer
            this.sessionStart = Date.now();
            this.updateSessionBar();
        });

        item.setAttribute('aria-label', 'Session time (click to reset)');
    }

    private updateSessionBar(): void {
        if (!this.sessionBarItem) return;
        const elapsed = Math.floor((Date.now() - this.sessionStart) / 1000);
        this.sessionBarItem.empty();
        this.sessionBarItem.createSpan({ text: '⏱' });
        this.sessionBarItem.createSpan({ text: this.formatDuration(elapsed) });
    }

    // ── File timer ────────────────────────────────────────────────────────────

    private mountFileTimer(): void {
        const item = this.plugin.addStatusBarItem();
        item.addClass('floaty-hud-item');
        this.fileBarItem = item;
        this.updateFileBar();

        this.fileTimer = setInterval(() => this.updateFileBar(), 1000);

        // Track file opens
        this.plugin.registerEvent(
            this.plugin.app.workspace.on('file-open', (file: TFile | null) => {
                const path = file?.path ?? null;
                if (path !== this.currentFile) {
                    this.currentFile = path;
                    this.fileStart   = file ? Date.now() : null;
                    this.updateFileBar();
                }
            })
        );

        item.setAttribute('aria-label', 'Time on current file');
    }

    private updateFileBar(): void {
        if (!this.fileBarItem) return;
        this.fileBarItem.empty();
        this.fileBarItem.createSpan({ text: '📄' });
        if (this.fileStart === null) {
            this.fileBarItem.createSpan({ text: '--:--' });
        } else {
            const elapsed = Math.floor((Date.now() - this.fileStart) / 1000);
            this.fileBarItem.createSpan({ text: this.formatDuration(elapsed) });
        }
    }

    // ── Utils ─────────────────────────────────────────────────────────────────

    private formatDuration(totalSeconds: number): string {
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        if (h > 0) {
            return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
}