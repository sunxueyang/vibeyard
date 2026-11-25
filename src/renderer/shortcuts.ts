import { appState } from './state.js';
import { isMac } from './platform.js';

export interface ShortcutDef {
  id: string;
  label: string;
  category: string;
  defaultKeys: string;
  handler: (() => void) | null;
}

interface ShortcutDefault {
  id: string;
  label: string;
  category: string;
  defaultKeys: string;
}

export const SHORTCUT_DEFAULTS: ShortcutDefault[] = [
  { id: 'new-session', label: '新建会话', category: '会话', defaultKeys: 'CmdOrCtrl+T' },
  { id: 'new-session-alt', label: '新建会话（备选）', category: '会话', defaultKeys: 'CmdOrCtrl+Shift+N' },
  { id: 'new-project', label: '新建项目', category: '会话', defaultKeys: 'CmdOrCtrl+Shift+P' },
  { id: 'goto-session-1', label: '切换到会话 1', category: '会话', defaultKeys: 'CmdOrCtrl+1' },
  { id: 'goto-session-2', label: '切换到会话 2', category: '会话', defaultKeys: 'CmdOrCtrl+2' },
  { id: 'goto-session-3', label: '切换到会话 3', category: '会话', defaultKeys: 'CmdOrCtrl+3' },
  { id: 'goto-session-4', label: '切换到会话 4', category: '会话', defaultKeys: 'CmdOrCtrl+4' },
  { id: 'goto-session-5', label: '切换到会话 5', category: '会话', defaultKeys: 'CmdOrCtrl+5' },
  { id: 'goto-session-6', label: '切换到会话 6', category: '会话', defaultKeys: 'CmdOrCtrl+6' },
  { id: 'goto-session-7', label: '切换到会话 7', category: '会话', defaultKeys: 'CmdOrCtrl+7' },
  { id: 'goto-session-8', label: '切换到会话 8', category: '会话', defaultKeys: 'CmdOrCtrl+8' },
  { id: 'goto-session-9', label: '切换到会话 9', category: '会话', defaultKeys: 'CmdOrCtrl+9' },
  { id: 'next-session', label: '下一个会话', category: '会话', defaultKeys: 'CmdOrCtrl+Shift+]' },
  { id: 'prev-session', label: '上一个会话', category: '会话', defaultKeys: 'CmdOrCtrl+Shift+[' },
  { id: 'tab-back', label: '后退（标签历史）', category: '会话', defaultKeys: 'CmdOrCtrl+[' },
  { id: 'tab-forward', label: '前进（标签历史）', category: '会话', defaultKeys: 'CmdOrCtrl+]' },
  { id: 'toggle-sidebar', label: '切换侧边栏', category: '面板', defaultKeys: 'CmdOrCtrl+B' },
  { id: 'toggle-split', label: '切换分屏模式', category: '面板', defaultKeys: 'CmdOrCtrl+\\' },
  { id: 'project-terminal', label: '项目终端', category: '面板', defaultKeys: 'Ctrl+`' },
  { id: 'project-terminal-alt', label: '项目终端（备选）', category: '面板', defaultKeys: 'CmdOrCtrl+J' },
  { id: 'debug-panel', label: '调试面板', category: '面板', defaultKeys: 'CmdOrCtrl+Shift+D' },
  { id: 'git-panel', label: 'Git 面板', category: '面板', defaultKeys: 'CmdOrCtrl+Shift+G' },
  { id: 'quick-open', label: '快速打开文件', category: '搜索与帮助', defaultKeys: 'CmdOrCtrl+P' },
  { id: 'session-search', label: '搜索全部会话', category: '搜索与帮助', defaultKeys: 'CmdOrCtrl+Shift+F' },
  { id: 'find-in-terminal', label: '查找', category: '搜索与帮助', defaultKeys: 'CmdOrCtrl+F' },
  { id: 'goto-line', label: '转到行', category: '搜索与帮助', defaultKeys: 'CmdOrCtrl+L' },
  { id: 'help', label: '帮助', category: '搜索与帮助', defaultKeys: 'F1' },
  { id: 'close-session', label: '关闭会话', category: '会话', defaultKeys: 'CmdOrCtrl+W' },
  { id: 'toggle-inspector', label: '切换会话检查器', category: '面板', defaultKeys: 'CmdOrCtrl+Shift+I' },
  { id: 'zoom-in', label: '放大', category: '视图', defaultKeys: 'CmdOrCtrl+=' },
  { id: 'zoom-out', label: '缩小', category: '视图', defaultKeys: 'CmdOrCtrl+-' },
  { id: 'zoom-reset', label: '重置缩放', category: '视图', defaultKeys: 'CmdOrCtrl+0' },
  { id: 'browser-reload', label: '重新加载页面', category: '浏览器', defaultKeys: 'CmdOrCtrl+R' },
  { id: 'browser-hard-reload', label: '强制重新加载（忽略缓存）', category: '浏览器', defaultKeys: 'CmdOrCtrl+Shift+R' },
];

/** Convert accelerator string to platform-specific display string */
export function displayKeys(accelerator: string): string {
  let display = accelerator;
  if (isMac) {
    display = display.replace(/CmdOrCtrl/g, 'Cmd');
    display = display.replace(/Ctrl\+/g, 'Ctrl+');
  } else {
    display = display.replace(/CmdOrCtrl/g, 'Ctrl');
  }
  if (isMac) {
    display = display
      .replace(/Cmd/g, '\u2318')
      .replace(/Shift/g, '\u21E7')
      .replace(/Alt/g, '\u2325')
      .replace(/Ctrl/g, '\u2303');
    display = display.replace(/\+/g, '');
  }
  return display;
}

/** Parse an accelerator string into modifier flags and a key */
function parseAccelerator(accelerator: string): { ctrl: boolean; meta: boolean; shift: boolean; alt: boolean; key: string } {
  const parts = accelerator.split('+');
  let ctrl = false;
  let meta = false;
  let shift = false;
  let alt = false;
  let key = '';

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === 'cmdorctrl') {
      if (isMac) meta = true;
      else ctrl = true;
    } else if (lower === 'ctrl') {
      ctrl = true;
    } else if (lower === 'cmd') {
      meta = true;
    } else if (lower === 'shift') {
      shift = true;
    } else if (lower === 'alt') {
      alt = true;
    } else {
      key = part;
    }
  }

  return { ctrl, meta, shift, alt, key };
}

/** Check if a KeyboardEvent matches an accelerator string */
function matchesAccelerator(e: KeyboardEvent, accelerator: string): boolean {
  const parsed = parseAccelerator(accelerator);

  const eventCtrl = e.ctrlKey;
  const eventMeta = e.metaKey;
  const eventShift = e.shiftKey;
  const eventAlt = e.altKey;

  if (parsed.ctrl !== eventCtrl) return false;
  if (parsed.meta !== eventMeta) return false;
  if (parsed.shift !== eventShift) return false;
  if (parsed.alt !== eventAlt) return false;

  // Compare key - handle special cases
  const eventKey = e.key;
  const parsedKey = parsed.key;

  // Direct match
  if (eventKey === parsedKey) return true;
  // Case-insensitive for letters
  if (eventKey.length === 1 && parsedKey.length === 1 && eventKey.toLowerCase() === parsedKey.toLowerCase()) return true;
  // Number keys
  if (/^\d$/.test(parsedKey) && eventKey === parsedKey) return true;
  // F-keys
  if (parsedKey.startsWith('F') && eventKey === parsedKey) return true;

  return false;
}

/** Convert a KeyboardEvent to an accelerator string */
export function eventToAccelerator(e: KeyboardEvent): string | null {
  const key = e.key;

  // Ignore bare modifier keys
  if (['Control', 'Meta', 'Shift', 'Alt'].includes(key)) return null;

  const parts: string[] = [];
  if (e.ctrlKey && e.metaKey) {
    // Both ctrl and meta
    parts.push('Ctrl');
    parts.push('Cmd');
  } else if (e.metaKey) {
    parts.push(isMac ? 'CmdOrCtrl' : 'Cmd');
  } else if (e.ctrlKey) {
    parts.push(isMac ? 'Ctrl' : 'CmdOrCtrl');
  }
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');

  // Normalize key name
  let normalizedKey = key;
  if (key.length === 1) {
    normalizedKey = key.toUpperCase();
  }

  parts.push(normalizedKey);
  return parts.join('+');
}

export class ShortcutManager {
  private shortcuts: ShortcutDef[] = [];

  constructor() {
    this.shortcuts = SHORTCUT_DEFAULTS.map((d) => ({ ...d, handler: null }));
  }

  /** Register a handler for a shortcut id */
  registerHandler(id: string, handler: () => void): void {
    const shortcut = this.shortcuts.find((s) => s.id === id);
    if (shortcut) {
      shortcut.handler = handler;
    }
  }

  /** Get resolved keys (override or default) for a shortcut */
  getKeys(id: string): string {
    const overrides = appState.preferences.keybindings ?? {};
    const shortcut = this.shortcuts.find((s) => s.id === id);
    if (!shortcut) return '';
    return overrides[id] ?? shortcut.defaultKeys;
  }

  /** Get all shortcuts with resolved keys, grouped by category */
  getAll(): Map<string, Array<ShortcutDef & { resolvedKeys: string }>> {
    const overrides = appState.preferences.keybindings ?? {};
    const groups = new Map<string, Array<ShortcutDef & { resolvedKeys: string }>>();

    for (const shortcut of this.shortcuts) {
      const resolvedKeys = overrides[shortcut.id] ?? shortcut.defaultKeys;
      const entry = { ...shortcut, resolvedKeys };
      if (!groups.has(shortcut.category)) {
        groups.set(shortcut.category, []);
      }
      groups.get(shortcut.category)!.push(entry);
    }

    return groups;
  }

  /** Set a custom keybinding override */
  setOverride(id: string, keys: string): void {
    const current = { ...(appState.preferences.keybindings ?? {}) };
    current[id] = keys;
    appState.setPreference('keybindings', current);
  }

  /** Reset a keybinding to its default */
  resetOverride(id: string): void {
    const current = { ...(appState.preferences.keybindings ?? {}) };
    delete current[id];
    appState.setPreference('keybindings', current);
  }

  /** Check if a shortcut has a custom override */
  hasOverride(id: string): boolean {
    const overrides = appState.preferences.keybindings ?? {};
    return id in overrides;
  }

  /** Match a keyboard event to a shortcut and execute its handler */
  matchEvent(e: KeyboardEvent): boolean {
    const overrides = appState.preferences.keybindings ?? {};

    for (const shortcut of this.shortcuts) {
      const keys = overrides[shortcut.id] ?? shortcut.defaultKeys;
      if (matchesAccelerator(e, keys) && shortcut.handler) {
        e.preventDefault();
        shortcut.handler();
        return true;
      }
    }
    return false;
  }

  /** Check if a keyboard event matches any registered shortcut (without executing) */
  matchesAnyShortcut(e: KeyboardEvent): boolean {
    const overrides = appState.preferences.keybindings ?? {};
    for (const shortcut of this.shortcuts) {
      const keys = overrides[shortcut.id] ?? shortcut.defaultKeys;
      if (matchesAccelerator(e, keys)) return true;
    }
    return false;
  }
}

export const shortcutManager = new ShortcutManager();
