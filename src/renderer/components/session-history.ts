import { appState, ArchivedSession, ProjectRecord } from '../state.js';
import type { SessionRecord } from '../state.js';
import { loadProviderAvailability } from '../provider-availability.js';
import { buildResumeWithProviderItems } from './resume-with-provider-menu.js';
import { showConfirmDialog } from './modal.js';
import type { ProviderId } from '../../shared/types.js';

const MAX_VISIBLE = 50;
const PROVIDER_LABELS: Record<string, string> = {
  claude: 'Claude Code',
  codex: 'Codex CLI',
  copilot: 'GitHub Copilot',
  gemini: 'Gemini CLI',
};

interface ProjectFilterState {
  searchText: string;
  bookmarkOnly: boolean;
}

type RowKind = 'active' | 'archived';

/** A unified, sortable row for either a live session or an archived one. */
interface HistoryRow {
  id: string;
  name: string;
  kind: RowKind;
  /** ISO timestamp used for ordering and date grouping. */
  timestamp: string;
  providerId: string;
  cliSessionId: string | null;
  bookmarked: boolean;
  cost: ArchivedSession['cost'];
  source: SessionRecord | ArchivedSession;
}

const filterStateByProject = new Map<string, ProjectFilterState>();
const activePanels = new Map<string, Map<string, HTMLElement>>();
const DEFAULT_INSTANCE_KEY = 'sidebar';

let historyContextMenu: HTMLElement | null = null;

function hideHistoryContextMenu(): void {
  if (historyContextMenu) {
    historyContextMenu.remove();
    historyContextMenu = null;
  }
}

function showHistoryContextMenu(x: number, y: number, project: ProjectRecord, archived: ArchivedSession): void {
  hideHistoryContextMenu();

  const menu = document.createElement('div');
  menu.className = 'tab-context-menu';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  if (archived.cliSessionId) {
    const resumeItem = document.createElement('div');
    resumeItem.className = 'tab-context-menu-item';
    resumeItem.textContent = '恢复';
    resumeItem.addEventListener('click', (e) => {
      e.stopPropagation();
      hideHistoryContextMenu();
      void appState.resumeFromHistorySafe(project.id, archived.id);
    });
    menu.appendChild(resumeItem);
  }

  const resumeWithItems = buildResumeWithProviderItems(
    (archived.providerId || 'claude') as ProviderId,
    (targetId) => {
      hideHistoryContextMenu();
      appState.resumeWithProvider(project.id, { archivedSessionId: archived.id }, targetId);
    },
  );
  for (const el of resumeWithItems) menu.appendChild(el);

  if (menu.firstChild) {
    const separator = document.createElement('div');
    separator.className = 'tab-context-menu-separator';
    menu.appendChild(separator);
  }

  const removeItem = document.createElement('div');
  removeItem.className = 'tab-context-menu-item danger';
  removeItem.textContent = '从历史记录中移除';
  removeItem.addEventListener('click', (e) => {
    e.stopPropagation();
    hideHistoryContextMenu();
    appState.removeHistoryEntry(project.id, archived.id);
  });
  menu.appendChild(removeItem);

  document.body.appendChild(menu);
  historyContextMenu = menu;
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 4}px`;
  if (rect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - rect.height - 4}px`;
}

function getFilterState(projectId: string): ProjectFilterState {
  let state = filterStateByProject.get(projectId);
  if (!state) {
    state = { searchText: '', bookmarkOnly: false };
    filterStateByProject.set(projectId, state);
  }
  return state;
}

let listenersAttached = false;

export function initSessionHistory(): void {
  if (listenersAttached) return;
  listenersAttached = true;

  // Archived history changes plus live session lifecycle both rebuild the panel,
  // so the active sessions stay in sync without a manual refresh.
  appState.on('history-changed', rerenderAll);
  appState.on('session-added', rerenderAll);
  appState.on('session-removed', rerenderAll);
  appState.on('session-changed', rerenderAll);
  if (typeof document.addEventListener === 'function') {
    document.addEventListener('click', hideHistoryContextMenu);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideHistoryContextMenu(); });
  }
}

function rerenderAll(): void {
  for (const [projectId, panels] of activePanels) {
    const project = appState.projects.find(p => p.id === projectId);
    if (!project) continue;
    for (const [instanceKey, container] of panels) {
      renderSessionHistory(project, container, instanceKey);
    }
  }
}

/** Build the unified row list: live CLI sessions first-class, then archived ones. */
function buildRows(project: ProjectRecord): HistoryRow[] {
  const rows: HistoryRow[] = [];

  for (const session of project.sessions ?? []) {
    // Only CLI conversations (no specialized type) are listed as live rows;
    // helper panes (file reader, kanban, browser tab, etc.) are transient.
    if (session.type) continue;
    rows.push({
      id: session.id,
      name: session.name,
      kind: 'active',
      timestamp: session.createdAt,
      providerId: session.providerId || 'claude',
      cliSessionId: session.cliSessionId,
      bookmarked: false,
      cost: session.cost ? toArchivedCost(session.cost) : null,
      source: session,
    });
  }

  for (const archived of appState.getSessionHistory(project.id) ?? []) {
    rows.push({
      id: archived.id,
      name: archived.name,
      kind: 'archived',
      timestamp: archived.closedAt,
      providerId: archived.providerId || 'claude',
      cliSessionId: archived.cliSessionId,
      bookmarked: !!archived.bookmarked,
      cost: archived.cost,
      source: archived,
    });
  }

  // Newest first.
  rows.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return rows;
}

function toArchivedCost(cost: NonNullable<SessionRecord['cost']>): ArchivedSession['cost'] {
  return {
    totalCostUsd: cost.totalCostUsd,
    totalInputTokens: cost.totalInputTokens,
    totalOutputTokens: cost.totalOutputTokens,
    totalDurationMs: cost.totalDurationMs,
  };
}

interface DayBucket {
  key: string;
  label: string;
}

function dayBucket(iso: string): DayBucket {
  const d = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86400000);

  let label: string;
  if (dayDiff === 0) label = '今天';
  else if (dayDiff === 1) label = '昨天';
  else if (dayDiff > 1 && dayDiff < 7) label = `${dayDiff} 天前`;
  else label = d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });

  return { key: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`, label };
}

export function renderSessionHistory(
  project: ProjectRecord,
  container: HTMLElement,
  instanceKey: string = DEFAULT_INSTANCE_KEY,
): void {
  let panels = activePanels.get(project.id);
  if (!panels) {
    panels = new Map();
    activePanels.set(project.id, panels);
  }
  panels.set(instanceKey, container);

  const allRows = buildRows(project);
  const filter = getFilterState(project.id);

  container.innerHTML = '';

  if (allRows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = '暂无会话历史';
    container.appendChild(empty);
    return;
  }

  const searchInput = document.createElement('input');
  searchInput.className = 'history-search';
  searchInput.type = 'text';
  searchInput.placeholder = '筛选历史…';
  searchInput.value = filter.searchText;
  searchInput.addEventListener('input', () => {
    filter.searchText = searchInput.value;
    renderList(project, container, allRows, filter);
  });
  container.appendChild(searchInput);

  const bookmarkFilter = document.createElement('button');
  const applyFilterState = () => {
    bookmarkFilter.className = `history-bookmark-filter${filter.bookmarkOnly ? ' active' : ''}`;
    bookmarkFilter.textContent = filter.bookmarkOnly ? '★ 已收藏' : '☆ 收藏';
  };
  applyFilterState();
  bookmarkFilter.addEventListener('click', () => {
    filter.bookmarkOnly = !filter.bookmarkOnly;
    applyFilterState();
    renderList(project, container, allRows, filter);
  });

  const clearBtn = document.createElement('button');
  clearBtn.className = 'history-clear-btn';
  clearBtn.textContent = '清空历史';
  clearBtn.addEventListener('click', () => {
    showConfirmDialog(
      '清空会话历史',
      `清空 "${project.name}" 的所有未收藏会话？已收藏的会话将保留。此操作无法撤销。`,
      {
        confirmLabel: '清空',
        onConfirm: () => appState.clearSessionHistory(project.id),
      },
    );
  });

  const actions = document.createElement('div');
  actions.className = 'history-actions';
  actions.appendChild(bookmarkFilter);
  actions.appendChild(clearBtn);
  container.appendChild(actions);

  const listEl = document.createElement('div');
  listEl.className = 'history-list';
  container.appendChild(listEl);

  renderList(project, container, allRows, filter);
}

export function closeSessionHistory(projectId: string, instanceKey?: string): void {
  const panels = activePanels.get(projectId);
  if (!panels) return;
  if (instanceKey === undefined) {
    for (const container of panels.values()) container.innerHTML = '';
    activePanels.delete(projectId);
    return;
  }
  const container = panels.get(instanceKey);
  if (container) container.innerHTML = '';
  panels.delete(instanceKey);
  if (panels.size === 0) activePanels.delete(projectId);
}

export function clearProjectState(projectId: string): void {
  filterStateByProject.delete(projectId);
  activePanels.delete(projectId);
}

function applyFilter(rows: HistoryRow[], filter: ProjectFilterState): HistoryRow[] {
  const needle = filter.searchText.toLowerCase();
  return rows
    .filter((r) => r.name.toLowerCase().includes(needle))
    .filter((r) => !filter.bookmarkOnly || r.bookmarked);
}

function renderList(
  project: ProjectRecord,
  container: HTMLElement,
  allRows: HistoryRow[],
  filter: ProjectFilterState,
): void {
  const listEl = container.querySelector('.history-list') as HTMLElement | null;
  if (!listEl) return;

  const filtered = applyFilter(allRows, filter);
  listEl.innerHTML = '';

  // Group the filtered rows by calendar day, preserving the newest-first order.
  const groups = new Map<string, { bucket: DayBucket; rows: HistoryRow[] }>();
  for (const row of filtered) {
    const bucket = dayBucket(row.timestamp);
    if (!groups.has(bucket.key)) groups.set(bucket.key, { bucket, rows: [] });
    groups.get(bucket.key)!.rows.push(row);
  }

  let rendered = 0;
  let reachedCap = false;
  for (const { bucket, rows } of groups.values()) {
    const header = document.createElement('div');
    header.className = 'history-group-header';
    header.textContent = bucket.label;
    listEl.appendChild(header);

    for (const row of rows) {
      if (rendered >= MAX_VISIBLE) { reachedCap = true; continue; }
      listEl.appendChild(buildItem(project, row));
      rendered += 1;
    }
  }

  if (reachedCap) {
    const more = document.createElement('div');
    more.className = 'history-item-details';
    more.style.padding = '4px 12px';
    more.textContent = `仅显示前 ${MAX_VISIBLE} 项…`;
    listEl.appendChild(more);
  }
}

function buildItem(project: ProjectRecord, row: HistoryRow): HTMLElement {
  const item = document.createElement('div');
  item.className = `history-item history-item-${row.kind}`;

  if (row.kind === 'active') {
    // A live row focuses its running session.
    item.style.cursor = 'pointer';
    item.addEventListener('click', () => {
      appState.setActiveSession(project.id, row.id);
    });
  } else if (row.cliSessionId) {
    item.style.cursor = 'pointer';
    item.addEventListener('click', () => {
      void appState.resumeFromHistorySafe(project.id, row.id);
    });
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      loadProviderAvailability().catch(() => {});
      showHistoryContextMenu(e.clientX, e.clientY, project, row.source as ArchivedSession);
    });
  }

  const info = document.createElement('div');
  info.className = 'history-item-info';

  const name = document.createElement('div');
  name.className = 'history-item-name';
  name.textContent = row.name;
  name.title = row.cliSessionId ? `${row.name}\n会话 ID：${row.cliSessionId}` : row.name;
  info.appendChild(name);

  const details = document.createElement('div');
  details.className = 'history-item-details';
  const parts: string[] = [];
  parts.push(formatTime(row.timestamp));
  if (row.cost) parts.push(`$${row.cost.totalCostUsd.toFixed(2)}`);
  parts.push(getProviderLabel(row.providerId));
  if (row.kind === 'active') parts.push('进行中');
  details.textContent = parts.join(' · ');
  info.appendChild(details);

  item.appendChild(info);

  if (row.kind === 'archived') {
    const actions = document.createElement('div');
    actions.className = 'history-item-actions';

    const bookmarkBtn = document.createElement('button');
    bookmarkBtn.className = `history-bookmark-btn${row.bookmarked ? ' bookmarked' : ''}`;
    bookmarkBtn.innerHTML = row.bookmarked ? '&#9733;' : '&#9734;';
    bookmarkBtn.title = row.bookmarked ? '取消收藏' : '收藏会话';
    bookmarkBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      appState.toggleBookmark(project.id, row.id);
    });
    actions.appendChild(bookmarkBtn);
    item.appendChild(actions);
  }

  return item;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getProviderLabel(providerId: string): string {
  return PROVIDER_LABELS[providerId] ?? providerId;
}
