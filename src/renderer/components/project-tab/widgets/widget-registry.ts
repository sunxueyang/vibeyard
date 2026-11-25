import type { OverviewWidgetType } from '../../../../shared/types.js';
import type { WidgetFactory } from './widget-host.js';
import { createReadinessWidget } from './readiness-widget.js';
import { createProviderToolsWidget } from './provider-tools-widget.js';
import { createGithubPRsWidget, createGithubIssuesWidget } from './github-widgets.js';
import { createTeamWidget } from './team-widget.js';
import { createKanbanWidget } from './kanban-widget.js';
import { createSessionsWidget } from './sessions-widget.js';
import { createFavoriteSessionsWidget } from './favorite-sessions-widget.js';
import { createUsageStatsWidget } from './usage-stats-widget.js';
import { createTopFilesWidget } from './top-files-widget.js';
import { DEFAULT_SESSIONS_CONFIG } from './sessions-types.js';
import { DEFAULT_TOP_FILES_CONFIG } from './top-files-types.js';

export interface WidgetMeta {
  type: OverviewWidgetType;
  displayName: string;
  description: string;
  defaultSize: { w: number; h: number };
  defaultConfig: Record<string, unknown>;
  factory: WidgetFactory;
  /** When true the picker allows multiple instances on one Overview. */
  allowMultiple: boolean;
  /** When true, this widget exposes a settings dialog (gear button visible). */
  hasSettings: boolean;
}

const REGISTRY: Record<OverviewWidgetType, WidgetMeta> = {
  'readiness': {
    type: 'readiness',
    displayName: 'AI 就绪度',
    description: '项目就绪度评分、快速见效项与分类明细。',
    defaultSize: { w: 8, h: 8 },
    defaultConfig: {},
    factory: createReadinessWidget,
    allowMultiple: false,
    hasSettings: false,
  },
  'provider-tools': {
    type: 'provider-tools',
    displayName: '提供商工具',
    description: '各已安装 CLI 的 MCP 服务器、Agent、Skills 与斜杠命令。',
    defaultSize: { w: 4, h: 8 },
    defaultConfig: {},
    factory: createProviderToolsWidget,
    allowMultiple: false,
    hasSettings: false,
  },
  'github-prs': {
    type: 'github-prs',
    displayName: '最近 PR - GitHub',
    description: 'GitHub 仓库的最新 Pull Request，含已读/未读标记，使用本地 gh CLI。',
    defaultSize: { w: 6, h: 6 },
    defaultConfig: { state: 'open', max: 10, refreshSeconds: 300 },
    factory: createGithubPRsWidget,
    allowMultiple: true,
    hasSettings: true,
  },
  'github-issues': {
    type: 'github-issues',
    displayName: '最近 Issue - GitHub',
    description: 'GitHub 仓库的最新 Issue，含已读/未读标记，使用本地 gh CLI。',
    defaultSize: { w: 6, h: 6 },
    defaultConfig: { state: 'open', max: 10, refreshSeconds: 300 },
    factory: createGithubIssuesWidget,
    allowMultiple: true,
    hasSettings: true,
  },
  'team': {
    type: 'team',
    displayName: '团队',
    description: '你的 AI 角色团队，可聊天、编辑或管理其会话。',
    defaultSize: { w: 6, h: 8 },
    defaultConfig: {},
    factory: createTeamWidget,
    allowMultiple: false,
    hasSettings: false,
  },
  'kanban': {
    type: 'kanban',
    displayName: '看板',
    description: '按列分组的项目看板任务，点击即可编辑、运行或恢复。',
    defaultSize: { w: 6, h: 8 },
    defaultConfig: {},
    factory: createKanbanWidget,
    allowMultiple: false,
    hasSettings: false,
  },
  'sessions': {
    type: 'sessions',
    displayName: '会话',
    description: '本项目最近归档的会话，点击即可恢复。',
    defaultSize: { w: 6, h: 8 },
    defaultConfig: { ...DEFAULT_SESSIONS_CONFIG },
    factory: createSessionsWidget,
    allowMultiple: false,
    hasSettings: true,
  },
  'favorite-sessions': {
    type: 'favorite-sessions',
    displayName: '收藏会话',
    description: '已加书签的归档会话，便于快速恢复。',
    defaultSize: { w: 6, h: 6 },
    defaultConfig: {},
    factory: createFavoriteSessionsWidget,
    allowMultiple: false,
    hasSettings: false,
  },
  'usage-stats': {
    type: 'usage-stats',
    displayName: 'Claude Code 使用统计',
    description: '来自 Claude Code CLI 的会话、消息、模型 token 用量与活动历史。',
    defaultSize: { w: 6, h: 8 },
    defaultConfig: {},
    factory: createUsageStatsWidget,
    allowMultiple: false,
    hasSettings: false,
  },
  'top-files-by-tokens': {
    type: 'top-files-by-tokens',
    displayName: '热门文件（按 Tokens）',
    description: '按估算 token 数排序的最大项目文件，点击行即可打开。',
    defaultSize: { w: 4, h: 8 },
    defaultConfig: { ...DEFAULT_TOP_FILES_CONFIG },
    factory: createTopFilesWidget,
    allowMultiple: false,
    hasSettings: true,
  },
};

export function getWidgetMeta(type: OverviewWidgetType): WidgetMeta | undefined {
  return REGISTRY[type];
}

export function listWidgetTypes(): WidgetMeta[] {
  return Object.values(REGISTRY);
}
