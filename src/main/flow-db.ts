import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type {
  FlowDefinition,
  FlowRunRecord,
  FlowRunContext,
  FlowScope,
  FlowGraph,
} from '../shared/flow-types';

/**
 * 工作流独立 SQLite 存储。
 * 文件：~/.vibeyard/flows.db，与 state.json 解耦。
 * 防御性策略：打开时做 integrity_check，异常则隔离损坏文件并重建空库；
 * 运行中任意操作失败会尝试自愈一次，确保存储层永不阻塞主流程。
 */

const STATE_DIR = path.join(os.homedir(), '.vibeyard');
const DB_FILE = path.join(STATE_DIR, 'flows.db');

interface FlowRow {
  id: string;
  name: string;
  description: string;
  scope: string;
  project_id: string | null;
  graph_json: string;
  is_template: number;
  created_at: number;
  updated_at: number;
}

interface RunRow {
  id: string;
  flow_id: string;
  scope: string;
  project_id: string | null;
  context_json: string | null;
  status: string;
  result_json: string | null;
  error: string | null;
  started_at: number;
  finished_at: number | null;
}

let dbInstance: Database.Database | null = null;

function createSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS flows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      scope TEXT NOT NULL,
      project_id TEXT,
      graph_json TEXT NOT NULL,
      is_template INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_flows_scope ON flows(scope, project_id);

    CREATE TABLE IF NOT EXISTS flow_runs (
      id TEXT PRIMARY KEY,
      flow_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      project_id TEXT,
      context_json TEXT,
      status TEXT NOT NULL,
      result_json TEXT,
      error TEXT,
      started_at INTEGER NOT NULL,
      finished_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_runs_flow ON flow_runs(flow_id);
  `);
}

/** 隔离损坏文件（含 WAL/SHM），返回重建后的空库。 */
function quarantineAndRebuild(reason: unknown): Database.Database {
  console.error('[flow-db] 数据库异常，隔离损坏文件并重建空库:', reason);
  const stamp = Date.now();
  try {
    const backup = `${DB_FILE}.corrupt-${stamp}`;
    if (fs.existsSync(DB_FILE)) fs.renameSync(DB_FILE, backup);
    for (const suffix of ['-wal', '-shm']) {
      const sidecar = DB_FILE + suffix;
      if (fs.existsSync(sidecar)) {
        try {
          fs.renameSync(sidecar, backup + suffix);
        } catch {
          // 忽略 sidecar 清理失败
        }
      }
    }
  } catch (err) {
    console.error('[flow-db] 隔离损坏文件失败，直接删除重建:', err);
    for (const target of [DB_FILE, DB_FILE + '-wal', DB_FILE + '-shm']) {
      try {
        if (fs.existsSync(target)) fs.unlinkSync(target);
      } catch {
        // 忽略
      }
    }
  }

  const fresh = new Database(DB_FILE);
  createSchema(fresh);
  return fresh;
}

function openDatabase(): Database.Database {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }

  let db: Database.Database | undefined;
  try {
    db = new Database(DB_FILE);
    db.pragma('journal_mode = WAL');
    // 完整性检查：损坏（含非 ok 结果）直接走重建。
    const integrity = db.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') {
      throw new Error(`integrity_check=${String(integrity)}`);
    }
    createSchema(db);
    return db;
  } catch (err) {
    if (db) {
      try {
        db.close();
      } catch {
        // 忽略关闭异常
      }
    }
    const rebuilt = quarantineAndRebuild(err);
    rebuilt.pragma('journal_mode = WAL');
    return rebuilt;
  }
}

function getDb(): Database.Database {
  if (!dbInstance) dbInstance = openDatabase();
  return dbInstance;
}

/** 运行时自愈：首次操作失败则重置连接并重试一次。 */
function withDb<T>(fn: (db: Database.Database) => T): T {
  try {
    return fn(getDb());
  } catch (err) {
    try {
      dbInstance?.close();
    } catch {
      // 忽略
    }
    dbInstance = null;
    return fn(getDb());
  }
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function rowToFlow(row: FlowRow): FlowDefinition | null {
  const graph = parseJson<FlowGraph | null>(row.graph_json, null);
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    return null;
  }
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    scope: row.scope as FlowScope,
    projectId: row.project_id,
    isTemplate: row.is_template === 1,
    graph,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToRun(row: RunRow): FlowRunRecord {
  return {
    id: row.id,
    flowId: row.flow_id,
    scope: row.scope as FlowScope,
    projectId: row.project_id,
    context: parseJson<FlowRunContext | null>(row.context_json, null),
    status: row.status as FlowRunRecord['status'],
    result: parseJson<Record<string, unknown> | null>(row.result_json, null),
    error: row.error,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

// ---------- 工作流定义 CRUD ----------

export function listFlows(scope: FlowScope, projectId: string | null): FlowDefinition[] {
  return withDb((db) => {
    const rows = db
      .prepare('SELECT * FROM flows WHERE scope = ? AND project_id IS ? ORDER BY updated_at DESC')
      .all(scope, projectId) as FlowRow[];
    return rows
      .map(rowToFlow)
      .filter((item): item is FlowDefinition => item !== null);
  });
}

export function getFlow(id: string): FlowDefinition | null {
  return withDb((db) => {
    const row = db.prepare('SELECT * FROM flows WHERE id = ?').get(id) as FlowRow | undefined;
    return row ? rowToFlow(row) : null;
  });
}

export function upsertFlow(flow: FlowDefinition): void {
  withDb((db) => {
    db.prepare(`
      INSERT INTO flows (
        id, name, description, scope, project_id, graph_json,
        is_template, created_at, updated_at
      ) VALUES (
        @id, @name, @description, @scope, @projectId, @graphJson,
        @isTemplate, @createdAt, @updatedAt
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        scope = excluded.scope,
        project_id = excluded.project_id,
        graph_json = excluded.graph_json,
        is_template = excluded.is_template,
        updated_at = excluded.updated_at
    `).run({
      id: flow.id,
      name: flow.name,
      description: flow.description,
      scope: flow.scope,
      projectId: flow.projectId,
      graphJson: JSON.stringify(flow.graph),
      isTemplate: flow.isTemplate ? 1 : 0,
      createdAt: flow.createdAt,
      updatedAt: flow.updatedAt,
    });
  });
}

export function deleteFlow(id: string): void {
  withDb((db) => {
    db.prepare('DELETE FROM flows WHERE id = ?').run(id);
    db.prepare('DELETE FROM flow_runs WHERE flow_id = ?').run(id);
  });
}

// ---------- 运行记录 ----------

/** 插入或更新运行记录（按 id 冲突时更新）。 */
export function upsertRun(run: FlowRunRecord): void {
  withDb((db) => {
    db.prepare(`
      INSERT INTO flow_runs (
        id, flow_id, scope, project_id, context_json, status,
        result_json, error, started_at, finished_at
      ) VALUES (
        @id, @flowId, @scope, @projectId, @contextJson, @status,
        @resultJson, @error, @startedAt, @finishedAt
      )
      ON CONFLICT(id) DO UPDATE SET
        context_json = excluded.context_json,
        status = excluded.status,
        result_json = excluded.result_json,
        error = excluded.error,
        finished_at = excluded.finished_at
    `).run({
      id: run.id,
      flowId: run.flowId,
      scope: run.scope,
      projectId: run.projectId,
      contextJson: run.context ? JSON.stringify(run.context) : null,
      status: run.status,
      resultJson: run.result ? JSON.stringify(run.result) : null,
      error: run.error,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
    });
  });
}

export function listRuns(flowId: string): FlowRunRecord[] {
  return withDb((db) => {
    const rows = db
      .prepare('SELECT * FROM flow_runs WHERE flow_id = ? ORDER BY started_at DESC')
      .all(flowId) as RunRow[];
    return rows.map(rowToRun);
  });
}

/** 关闭数据库（应用退出时调用，可选）。 */
export function closeFlowDb(): void {
  try {
    dbInstance?.close();
  } catch {
    // 忽略
  }
  dbInstance = null;
}
