// 工作流（DAG 画布）相关类型，主进程 / preload / 渲染端共享。

/** 作用域：user=通用（跨项目），project=绑定具体项目。 */
export type FlowScope = 'user' | 'project';

/** MVP 节点类型：开始 / Skill / 结束（纯线性）。 */
export type FlowNodeType = 'start' | 'skill' | 'end';

/** 节点在一次运行中的状态。 */
export type NodeRunStatus = 'idle' | 'running' | 'success' | 'failed';

/** 一次工作流运行的整体状态。 */
export type FlowRunStatus = 'running' | 'success' | 'failed';

/** Skill 引用：MVP 仅支持 MCP 来源，用稳定逻辑名（server 名 + tool 名），不写绝对路径。 */
export interface SkillRef {
  source: 'mcp';
  serverName: string;
  toolName: string;
}

/** 节点输出变量定义。 */
export interface OutputVar {
  key: string;
  name: string;
}

/** 节点配置：Skill、提示词、输入映射、输出变量。 */
export interface FlowNodeConfig {
  skill: SkillRef | null;
  prompt: string;
  inputMapping: Record<string, string>;
  outputVars: OutputVar[];
}

/** 画布节点。 */
export interface FlowNode {
  id: string;
  type: FlowNodeType;
  name: string;
  position: { x: number; y: number };
  config: FlowNodeConfig;
}

/** 画布连线（MVP 纯线性）。 */
export interface FlowEdge {
  id: string;
  source: string;
  target: string;
}

/** 工作流引用的 MCP server（逻辑名 + 连接 URL），随图持久化，运行时按需连接。 */
export interface FlowMcpServer {
  name: string;
  url: string;
}

/** 完整图数据。 */
export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
  mcpServers?: FlowMcpServer[];
}

/** 工作流定义（静态，不绑定运行环境）。 */
export interface FlowDefinition {
  id: string;
  name: string;
  description: string;
  scope: FlowScope;
  /** scope=project 时必填，否则为 null。 */
  projectId: string | null;
  isTemplate: boolean;
  graph: FlowGraph;
  createdAt: number;
  updatedAt: number;
}

/** 运行上下文快照：运行时才绑定的工作目录与输入。 */
export interface FlowRunContext {
  cwd: string;
  inputs: Record<string, unknown>;
}

/** 工作流运行记录。 */
export interface FlowRunRecord {
  id: string;
  flowId: string;
  scope: FlowScope;
  projectId: string | null;
  context: FlowRunContext | null;
  status: FlowRunStatus;
  /** 各节点输出与最终结果。 */
  result: Record<string, unknown> | null;
  error: string | null;
  startedAt: number;
  finishedAt: number | null;
}
