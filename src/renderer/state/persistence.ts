import type { BoardColumn, BoardData, PersistedState, Preferences, ProjectRecord, SessionRecord } from '../../shared/types.js';
import { restoreCost } from '../session-cost.js';
import { restoreContext } from '../session-context.js';
import { buildKanbanSession } from './session-factory.js';

export function createDefaultBoard(): BoardData {
  const columns: BoardColumn[] = [
    { id: crypto.randomUUID(), title: '待办', order: 0, behavior: 'inbox' },
    { id: crypto.randomUUID(), title: '就绪', order: 1, behavior: 'none' },
    { id: crypto.randomUUID(), title: '运行中', order: 2, behavior: 'active' },
    { id: crypto.randomUUID(), title: '完成', order: 3, behavior: 'terminal' },
  ];
  return { columns, tasks: [] };
}

/**
 * Legacy English default kanban column titles → Chinese. Exact, case-sensitive
 * match only, so columns the user renamed are left untouched. Applied once on
 * load; after the first run the titles are Chinese and no longer match.
 */
const LEGACY_COLUMN_TITLES: Record<string, string> = {
  Backlog: '待办',
  Ready: '就绪',
  Running: '运行中',
  Done: '完成',
};

/** Translate the built-in board columns created before the Chinese localization. */
function migrateLegacyBoardColumns(project: ProjectRecord): void {
  if (!project.board) return;
  for (const column of project.board.columns) {
    const translated = LEGACY_COLUMN_TITLES[column.title];
    if (translated) column.title = translated;
  }
}

/**
 * Apply forward-compat migrations and runtime priming to a freshly-loaded state.
 * Mutates `state` in place.
 */
export function hydrateLoadedState(state: PersistedState, defaultPreferences: Preferences): void {
  state.preferences = { ...defaultPreferences, ...state.preferences };
  for (const project of state.projects) {
    migrateLegacyBoardColumns(project);
    for (const session of project.sessions) {
      if (session.cost) restoreCost(session.id, session.cost);
      if (session.contextWindow) restoreContext(session.id, session.contextWindow);
    }
    if (project.sessionHistory) {
      const seenIds = new Set<string>();
      for (const entry of project.sessionHistory) {
        if (seenIds.has(entry.id)) entry.id = crypto.randomUUID();
        seenIds.add(entry.id);
      }
    }
  }
}

/**
 * Ensure every project has a board, clear stale runtime sessionIds on board tasks,
 * and migrate the legacy `layout.mode === 'board'` to a kanban tab session.
 */
export function ensureProjectDefaults(state: PersistedState): void {
  for (const project of state.projects) {
    if (!project.board) project.board = createDefaultBoard();
    for (const task of project.board.tasks) task.sessionId = undefined;

    const legacyMode = (project.layout as { mode: string }).mode;
    if (legacyMode === 'board') {
      project.layout.mode = 'tabs';
      const existingKanban = project.sessions.find((s) => s.type === 'kanban');
      const kanbanSession = existingKanban ?? buildKanbanSession({ projectName: project.name });
      if (!existingKanban) project.sessions.push(kanbanSession);
      project.activeSessionId = kanbanSession.id;
    }
  }
}

/**
 * Strip transient fields that should never be persisted (in-flight prompts).
 */
export function serializeForSave(state: PersistedState): PersistedState {
  return {
    ...state,
    projects: state.projects.map((p: ProjectRecord) => ({
      ...p,
      sessions: p.sessions.map(({ pendingInitialPrompt, pendingSystemPrompt, pendingCliName, ...rest }: SessionRecord) => rest as SessionRecord),
    })),
  };
}
