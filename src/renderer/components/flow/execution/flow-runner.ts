import type {
  FlowGraph,
  FlowNode,
  FlowRunContext,
  NodeRunStatus,
} from '../../../../shared/flow-types.js';
import { validateGraph, topoOrder, findNodesByType } from '../flow-graph.js';
import { resolveValue, type RunOutputs } from '../variable-resolver.js';
import { MockExecutor } from './mock-executor.js';
import { McpExecutor } from './mcp-executor.js';
import type { NodeExecutor, NodeExecutionInput } from './executor-types.js';
import type { LogLevel } from '../panels/run-log-panel.js';

export interface RunnerCallbacks {
  onNodeStatus: (nodeId: string, status: NodeRunStatus) => void;
  onLog: (level: LogLevel, text: string) => void;
}

export interface RunOptions {
  graph: FlowGraph;
  context: FlowRunContext;
  callbacks: RunnerCallbacks;
}

export interface RunOutcome {
  success: boolean;
  cancelled: boolean;
  result: Record<string, unknown>;
  error?: string;
}

export class FlowRunner {
  private cancelled = false;

  cancel(): void {
    this.cancelled = true;
  }

  async run(options: RunOptions): Promise<RunOutcome> {
    const { graph, context, callbacks } = options;
    this.cancelled = false;

    validateGraph(graph);
    const order = topoOrder(graph);
    const nodeMap = new Map<string, FlowNode>(graph.nodes.map((n) => [n.id, n]));
    const outputs: RunOutputs = {};

    const mock = new MockExecutor();
    const mcp = new McpExecutor(graph.mcpServers ?? []);

    callbacks.onLog('info', `工作流开始，共 ${order.length} 个节点，目录：${context.cwd}`);

    for (const id of order) {
      if (this.cancelled) {
        callbacks.onLog('error', '运行已被用户取消');
        return { success: false, cancelled: true, result: outputs, error: 'cancelled' };
      }

      const node = nodeMap.get(id)!;
      callbacks.onNodeStatus(id, 'running');
      callbacks.onLog('running', `开始执行节点「${node.name}」`);

      if (node.type === 'start') {
        outputs[id] = { ...context.inputs };
        callbacks.onNodeStatus(id, 'success');
        callbacks.onLog('success', `节点「${node.name}」完成`);
        continue;
      }

      if (node.type === 'end') {
        outputs[id] = { finishedAt: Date.now() };
        callbacks.onNodeStatus(id, 'success');
        callbacks.onLog('success', `节点「${node.name}」完成`);
        continue;
      }

      const prompt = resolveValue(node.config.prompt, outputs) as string;
      const inputs = resolveValue(node.config.inputMapping, outputs) as Record<string, unknown>;
      const executor: NodeExecutor = node.config.skill ? mcp : mock;

      const execInput: NodeExecutionInput = { node, prompt, inputs, cwd: context.cwd };
      const result = await executor.execute(execInput);

      if (this.cancelled) {
        callbacks.onNodeStatus(id, 'idle');
        callbacks.onLog('error', '运行已被用户取消');
        return { success: false, cancelled: true, result: outputs, error: 'cancelled' };
      }

      if (!result.success) {
        callbacks.onNodeStatus(id, 'failed');
        callbacks.onLog('error', `节点「${node.name}」失败：${result.error ?? '未知错误'}`);
        return { success: false, cancelled: false, result: outputs, error: result.error };
      }

      outputs[id] = result.output;
      callbacks.onNodeStatus(id, 'success');
      callbacks.onLog('success', `节点「${node.name}」完成`);
    }

    const endId = findNodesByType(graph, 'end')[0].id;
    callbacks.onLog('success', '工作流全部执行成功');
    return {
      success: true,
      cancelled: false,
      result: { outputs, end: outputs[endId] },
    };
  }
}
