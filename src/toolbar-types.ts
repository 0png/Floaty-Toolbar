import { Editor } from 'obsidian';
import {
    applyBold, applyItalic, applyStrikethrough, applyCode,
    applyHighlight, applyLink, CalloutType,
} from './utils';
import type { PluginSettings } from './main';

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

// ─── Action registry ──────────────────────────────────────────────────────────

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

// ─── Dropdown option lists ────────────────────────────────────────────────────

export const HEADING_OPTIONS: { label: string; level: 0 | 1 | 2 | 3 | 4 }[] = [
    { label: 'H1', level: 1 }, { label: 'H2', level: 2 },
    { label: 'H3', level: 3 }, { label: 'H4', level: 4 },
    { label: 'Plain', level: 0 },
];

export const CALLOUT_OPTIONS: { label: string; type: CalloutType; icon: string }[] = [
    { label: 'Note',      type: 'note',      icon: 'info' },
    { label: 'Tip',       type: 'tip',       icon: 'lightbulb' },
    { label: 'Warning',   type: 'warning',   icon: 'alert-triangle' },
    { label: 'Important', type: 'important', icon: 'alert-circle' },
    { label: 'Caution',   type: 'caution',   icon: 'flame' },
];

// ─── Layout / timing constants ────────────────────────────────────────────────

export const TOOLBAR_W_ESTIMATE = 420;
export const TOOLBAR_H_ESTIMATE = 44;
export const GAP                = 10;

// Long-press threshold in ms before drag mode activates
export const LONG_PRESS_MS = 500;
