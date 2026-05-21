import { Notice, Plugin, TFile } from 'obsidian';

// ─── Types ────────────────────────────────────────────────────────────────────

type PomodoroPhase = 'idle' | 'work' | 'break';

// ─── Popover helper ───────────────────────────────────────────────────────────

function openPopover(anchorEl: HTMLElement, build: (panel: HTMLElement) => void): HTMLElement {
    document.querySelectorAll('.floaty-hud-popover').forEach(el => el.remove());
    const panel = document.body.createEl('div', { cls: 'floaty-hud-popover' });
    build(panel);

    // Position: prefer above the anchor, clamp to viewport
    panel.setCssProps({ visibility: 'hidden', position: 'fixed', left: '0px', top: '0px' });

    requestAnimationFrame(() => {
        const ar = anchorEl.getBoundingClientRect();
        const pr = panel.getBoundingClientRect();
        let left = ar.left + ar.width / 2 - pr.width / 2;
        left = Math.max(8, Math.min(left, window.innerWidth - pr.width - 8));
        const top = Math.max(8, ar.top - pr.height - 8);
        panel.setCssProps({ left: `${left}px`, top: `${top}px`, visibility: '' });
    });

    const onOutside = (e: MouseEvent) => {
        if (!panel.contains(e.target as Node) && !anchorEl.contains(e.target as Node)) {
            panel.remove();
            document.removeEventListener('mousedown', onOutside, true);
        }
    };
    setTimeout(() => document.addEventListener('mousedown', onOutside, true), 0);
    return panel;
}

// ─── FloatyHud ────────────────────────────────────────────────────────────────

export class FloatyHud {
    private plugin: Plugin;

    // Pomodoro
    private pomPhase: PomodoroPhase = 'idle';
    private pomRemaining = 0;
    private pomWorkMins  = 25;
    private pomBreakMins = 5;
    private pomTimer: ReturnType<typeof setInterval> | null = null;

    // Status bar elements (always created, shown/hidden via CSS)
    private pomBarItem:     HTMLElement | null = null;
    private sessionBarItem: HTMLElement | null = null;
    private fileBarItem:    HTMLElement | null = null;

    // Dock HUD elements (created when dock is mounted, removed when not)
    private dockHudSection: HTMLElement | null = null;
    private pomDockItem:     HTMLElement | null = null;
    private sessionDockItem: HTMLElement | null = null;
    private fileDockItem:    HTMLElement | null = null;

    // Timers
    private sessionStart = Date.now();
    private sessionTimer: ReturnType<typeof setInterval> | null = null;
    private fileStart: number | null = null;
    private fileTimer: ReturnType<typeof setInterval> | null = null;
    private currentFile: string | null = null;

    constructor(plugin: Plugin) {
        this.plugin = plugin;
    }

    // ── Public ────────────────────────────────────────────────────────────────

    /** Call once on plugin load. Always creates status bar items. */
    mount(): void {
        this.mountStatusBarItems();
        this.startTimers();
    }

    /**
     * Call whenever docked mode changes.
     * dockEl = the dock container element (pass null when undocking).
     */
    setDockedMode(docked: boolean, dockEl: HTMLElement | null): void {
        if (docked && dockEl) {
            // Hide status bar items
            this.pomBarItem?.addClass('hud-hidden');
            this.sessionBarItem?.addClass('hud-hidden');
            this.fileBarItem?.addClass('hud-hidden');
            // Inject HUD section into dock
            this.mountDockHud(dockEl);
        } else {
            // Remove dock HUD section
            this.unmountDockHud();
            // Show status bar items again
            this.pomBarItem?.removeClass('hud-hidden');
            this.sessionBarItem?.removeClass('hud-hidden');
            this.fileBarItem?.removeClass('hud-hidden');
        }
    }

    destroy(): void {
        this.pomPause();
        if (this.sessionTimer) { clearInterval(this.sessionTimer); this.sessionTimer = null; }
        if (this.fileTimer)    { clearInterval(this.fileTimer);    this.fileTimer    = null; }
        this.unmountDockHud();
        document.querySelectorAll('.floaty-hud-popover').forEach(el => el.remove());
    }

    // ── Status bar items ──────────────────────────────────────────────────────

    private mountStatusBarItems(): void {
        // Pomodoro
        const pomItem = this.plugin.addStatusBarItem();
        pomItem.addClass('floaty-hud-item');
        this.pomBarItem = pomItem;
        this.pomRenderInto(pomItem);
        pomItem.addEventListener('click', () => this.openPomodoroPopover(pomItem));

        // Session timer
        const sessItem = this.plugin.addStatusBarItem();
        sessItem.addClass('floaty-hud-item');
        sessItem.setAttribute('aria-label', 'Session time — click to reset');
        this.sessionBarItem = sessItem;
        this.renderSessionInto(sessItem);
        sessItem.addEventListener('click', () => {
            this.sessionStart = Date.now();
            this.renderSessionInto(sessItem);
        });

        // File timer
        const fileItem = this.plugin.addStatusBarItem();
        fileItem.addClass('floaty-hud-item');
        fileItem.setAttribute('aria-label', 'Time on current file');
        this.fileBarItem = fileItem;
        this.renderFileInto(fileItem);
    }

    // ── Dock HUD section ──────────────────────────────────────────────────────

    private mountDockHud(dockEl: HTMLElement): void {
        this.unmountDockHud(); // clean up any leftover

        // Separator before HUD section
        const section = dockEl.createEl('div', { cls: 'floaty-dock-hud-section' });
        this.dockHudSection = section;

        // Divider
        section.createEl('div', { cls: 'floaty-divider' });

        // Pomodoro
        const pomItem = section.createEl('div', { cls: 'floaty-dock-hud-item' });
        this.pomDockItem = pomItem;
        this.pomRenderInto(pomItem);
        pomItem.addEventListener('mousedown', (e) => {
            e.preventDefault(); e.stopPropagation();
            this.openPomodoroPopover(pomItem);
        });

        // Session timer
        const sessItem = section.createEl('div', { cls: 'floaty-dock-hud-item' });
        this.sessionDockItem = sessItem;
        this.renderSessionInto(sessItem);
        sessItem.addEventListener('mousedown', (e) => {
            e.preventDefault(); e.stopPropagation();
            this.sessionStart = Date.now();
            this.renderSessionInto(sessItem);
            this.renderSessionInto(this.sessionBarItem);
        });

        // File timer
        const fileItem = section.createEl('div', { cls: 'floaty-dock-hud-item' });
        this.fileDockItem = fileItem;
        this.renderFileInto(fileItem);
    }

    private unmountDockHud(): void {
        this.dockHudSection?.remove();
        this.dockHudSection  = null;
        this.pomDockItem     = null;
        this.sessionDockItem = null;
        this.fileDockItem    = null;
    }

    // ── Timers ────────────────────────────────────────────────────────────────

    private startTimers(): void {
        this.sessionTimer = setInterval(() => {
            this.renderSessionInto(this.sessionBarItem);
            this.renderSessionInto(this.sessionDockItem);
        }, 1000);

        this.fileTimer = setInterval(() => {
            this.renderFileInto(this.fileBarItem);
            this.renderFileInto(this.fileDockItem);
        }, 1000);

        // Track file switches
        this.plugin.registerEvent(
            this.plugin.app.workspace.on('file-open', (file: TFile | null) => {
                const path = file?.path ?? null;
                if (path !== this.currentFile) {
                    this.currentFile = path;
                    this.fileStart   = file ? Date.now() : null;
                    this.renderFileInto(this.fileBarItem);
                    this.renderFileInto(this.fileDockItem);
                }
            })
        );
    }

    // ── Render helpers ────────────────────────────────────────────────────────

    /** Renders pomodoro state into any element (status bar or dock). */
    private pomRenderInto(el: HTMLElement | null): void {
        if (!el) return;
        el.empty();
        el.removeClass('pomodoro-work', 'pomodoro-break');

        if (this.pomPhase === 'idle') {
            el.createSpan({ text: '🍅' });
            el.createSpan({ text: `${String(this.pomWorkMins).padStart(2,'0')}:00` });
        } else {
            const mins = Math.floor(this.pomRemaining / 60).toString().padStart(2, '0');
            const secs = (this.pomRemaining % 60).toString().padStart(2, '0');
            el.createSpan({ text: this.pomPhase === 'work' ? '🍅' : '☕' });
            el.createSpan({ text: `${mins}:${secs}` });
            el.addClass(this.pomPhase === 'work' ? 'pomodoro-work' : 'pomodoro-break');
        }
    }

    private renderSessionInto(el: HTMLElement | null): void {
        if (!el) return;
        const elapsed = Math.floor((Date.now() - this.sessionStart) / 1000);
        el.empty();
        el.createSpan({ text: '⏱' });
        el.createSpan({ text: this.formatDuration(elapsed) });
    }

    private renderFileInto(el: HTMLElement | null): void {
        if (!el) return;
        el.empty();
        el.createSpan({ text: '📄' });
        if (this.fileStart === null) {
            el.createSpan({ text: '--:--' });
        } else {
            const elapsed = Math.floor((Date.now() - this.fileStart) / 1000);
            el.createSpan({ text: this.formatDuration(elapsed) });
        }
    }

    private pomRefreshAll(): void {
        this.pomRenderInto(this.pomBarItem);
        this.pomRenderInto(this.pomDockItem);
    }

    // ── Pomodoro logic ────────────────────────────────────────────────────────

    private pomStart(): void {
        if (this.pomPhase === 'idle') {
            this.pomPhase     = 'work';
            this.pomRemaining = this.pomWorkMins * 60;
        }
        if (this.pomTimer) return;
        this.pomTimer = setInterval(() => {
            this.pomRemaining--;
            this.pomRefreshAll();
            if (this.pomRemaining <= 0) this.pomTick();
        }, 1000);
    }

    private pomPause(): void {
        if (this.pomTimer) { clearInterval(this.pomTimer); this.pomTimer = null; }
    }

    private pomStop(): void {
        this.pomPause();
        this.pomPhase     = 'idle';
        this.pomRemaining = 0;
        this.pomRefreshAll();
    }

    private pomTick(): void {
        this.pomPause();
        if (this.pomPhase === 'work') {
            new Notice('Pomodoro complete! Take a break. 🍅', 8000);
            this.pomPhase     = 'break';
            this.pomRemaining = this.pomBreakMins * 60;
        } else {
            new Notice('Break over! Ready for the next pomodoro? ✅', 8000);
            this.pomPhase     = 'idle';
            this.pomRemaining = 0;
        }
        this.pomRefreshAll();
        document.querySelectorAll('.floaty-hud-popover').forEach(el => el.remove());
    }

    // ── Pomodoro popover ──────────────────────────────────────────────────────

    private openPomodoroPopover(anchor: HTMLElement): void {
        if (document.querySelector('.floaty-hud-popover')) {
            document.querySelectorAll('.floaty-hud-popover').forEach(el => el.remove());
            return;
        }

        openPopover(anchor, (panel) => {
            panel.createEl('h3', { text: '🍅 pomodoro' });

            const countdown  = panel.createEl('div', { cls: 'floaty-hud-countdown' });
            const phaseLabel = panel.createEl('div', { cls: 'floaty-hud-phase-label' });

            const refreshDisplay = () => {
                countdown.removeClass('phase-work', 'phase-break');
                if (this.pomPhase === 'idle') {
                    countdown.textContent  = `${String(this.pomWorkMins).padStart(2,'0')}:00`;
                    phaseLabel.textContent = 'Ready';
                } else {
                    const m = Math.floor(this.pomRemaining / 60).toString().padStart(2, '0');
                    const s = (this.pomRemaining % 60).toString().padStart(2, '0');
                    countdown.textContent  = `${m}:${s}`;
                    phaseLabel.textContent = this.pomPhase === 'work' ? 'Focus' : 'Break';
                    countdown.addClass(this.pomPhase === 'work' ? 'phase-work' : 'phase-break');
                }
            };
            refreshDisplay();

            // Live update while popover is open
            const liveTimer = setInterval(refreshDisplay, 500);
            const obs = new MutationObserver(() => {
                if (!document.contains(panel)) { clearInterval(liveTimer); obs.disconnect(); }
            });
            obs.observe(document.body, { childList: true, subtree: false });

            // Controls
            const controls = panel.createEl('div', { cls: 'floaty-hud-controls' });
            const startBtn  = controls.createEl('div', {
                cls:  'floaty-hud-btn primary',
                text: this.pomTimer ? 'Pause' : (this.pomPhase === 'idle' ? 'Start' : 'Resume'),
            });
            startBtn.addEventListener('click', () => {
                if (this.pomTimer) { this.pomPause(); startBtn.textContent = 'Resume'; }
                else               { this.pomStart(); startBtn.textContent = 'Pause'; }
            });

            controls.createEl('div', { cls: 'floaty-hud-btn', text: 'Reset' })
                .addEventListener('click', () => {
                    this.pomStop();
                    startBtn.textContent = 'Start';
                    refreshDisplay();
                });

            panel.createEl('div', { cls: 'floaty-hud-sep' });

            this.addSlider(panel, 'Work',  1, 90, this.pomWorkMins,  'min', (v) => {
                this.pomWorkMins = v;
                if (this.pomPhase === 'idle') refreshDisplay();
            });
            this.addSlider(panel, 'Break', 1, 30, this.pomBreakMins, 'min', (v) => {
                this.pomBreakMins = v;
            });
        });
    }

    private addSlider(
        parent: HTMLElement, label: string, min: number, max: number,
        value: number, unit: string, onChange: (v: number) => void
    ): void {
        const row    = parent.createEl('div', { cls: 'floaty-hud-setting-row' });
        row.createEl('span', { cls: 'floaty-hud-setting-label', text: label });
        const slider = row.createEl('input');
        slider.type  = 'range';
        slider.min   = String(min);
        slider.max   = String(max);
        slider.value = String(value);
        const valEl  = row.createEl('span', { cls: 'floaty-hud-setting-value', text: `${value}${unit}` });
        slider.addEventListener('input', () => {
            const v = Number(slider.value);
            valEl.textContent = `${v}${unit}`;
            onChange(v);
        });
    }

    // ── Util ──────────────────────────────────────────────────────────────────

    private formatDuration(totalSeconds: number): string {
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        if (h > 0) return `${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
        return `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
    }
}