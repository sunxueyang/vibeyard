import { appState } from '../state.js';
import { isCliSession } from '../session-utils.js';
import { t } from '../i18n.js';

/**
 * Right-side preview column wrapper.
 *
 * The diff viewer / file reader pane is placed inside this column in swarm
 * mode. This module owns:
 *   - a draggable resize handle on the left edge (boundary resize),
 *   - a hide button in the top-right corner (hides the pane but keeps the
 *     session/tab and its resource access intact — re-clicking the tab shows it),
 *   - the persisted column width.
 */

const STORAGE_KEY = 'vibeyard.previewColumn.width';
const DEFAULT_WIDTH = 480;
const MIN_WIDTH = 280;
/** The column can never consume more than this share of the main area. */
const MAX_WIDTH_RATIO = 0.85;

const EYE_OFF_ICON =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

let widthPx = loadWidth();
let hidden = false;
let columnEl: HTMLElement | null = null;

function loadWidth(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n >= MIN_WIDTH ? n : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

function persistWidth(): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(widthPx));
  } catch {
    /* storage unavailable — ignore */
  }
}

function mainContainer(): HTMLElement {
  return document.getElementById('terminal-container')!;
}

function maxWidth(): number {
  const el = mainContainer();
  const avail = el ? el.clientWidth : window.innerWidth;
  return Math.max(MIN_WIDTH, Math.floor(avail * MAX_WIDTH_RATIO));
}

function clampWidth(w: number): number {
  return Math.min(maxWidth(), Math.max(MIN_WIDTH, Math.round(w)));
}

/** Push the current width into the CSS variable the grid track reads. */
function applyWidth(): void {
  mainContainer().style.setProperty('--preview-width', widthPx + 'px');
}

export function getPreviewWidth(): number {
  return widthPx;
}

export function isPreviewHidden(): boolean {
  return hidden;
}

export function setPreviewHidden(value: boolean): void {
  hidden = value;
}

/** Build the persistent column (wrapper + resize handle + hide button) once. */
export function getPreviewColumn(): HTMLElement {
  if (columnEl) return columnEl;

  columnEl = document.createElement('div');
  columnEl.className = 'preview-column';

  const handle = document.createElement('div');
  handle.className = 'preview-resize-handle';
  handle.title = t('previewColumn.resizeHandle');
  columnEl.appendChild(handle);

  const hideBtn = document.createElement('button');
  hideBtn.className = 'preview-hide-btn';
  hideBtn.type = 'button';
  hideBtn.title = t('previewColumn.hideButton');
  hideBtn.innerHTML = EYE_OFF_ICON;
  columnEl.appendChild(hideBtn);

  wireResize(handle);
  wireHide(hideBtn);

  return columnEl;
}

function wireResize(handle: HTMLElement): void {
  let dragging = false;
  let startX = 0;
  let startWidth = 0;

  const teardown = () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('preview-resizing');
    persistWidth();
  };

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    startX = e.clientX;
    startWidth = widthPx;
    document.body.classList.add('preview-resizing');
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    // Release outside the window: mouseup never fires, detect via buttons.
    if (!e.buttons) {
      teardown();
      return;
    }
    // The handle is the column's LEFT edge: moving the mouse left widens it.
    widthPx = clampWidth(startWidth + (startX - e.clientX));
    applyWidth();
  });

  document.addEventListener('mouseup', teardown);
}

function wireHide(hideBtn: HTMLElement): void {
  hideBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    hidePreview();
  });
}

/**
 * Hide the preview column. The session/tab and its resource are kept; focus
 * moves to a terminal session so re-clicking the tab can reveal the pane.
 */
export function hidePreview(): void {
  hidden = true;
  const project = appState.activeProject;
  const terminal = project?.sessions.find((s) => isCliSession(s));
  if (terminal && project) {
    // setActiveSession emits 'session-changed' → renderLayout picks up the flag.
    appState.setActiveSession(project.id, terminal.id);
  }
}
