import type { FlowNode } from '../../../../shared/flow-types.js';

/** 单个节点执行的输入（提示词与输入映射均已完成变量解析）。 */
export interface NodeExecutionInput {
  node: FlowNode;
  prompt: string;
  inputs: Record<string, unknown>;
  cwd: string;
}

/** 单个节点执行的结果。 */
export interface NodeExecutionResult {
  success: boolean;
  output: Record<string, unknown>;
  error?: string;
}

/** 节点执行器统一接口（Mock / MCP 各一份实现）。 */
export interface NodeExecutor {
  execute(input: NodeExecutionInput): Promise<NodeExecutionResult>;
}
