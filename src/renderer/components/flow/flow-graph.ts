import type { FlowGraph, FlowNode, FlowNodeType } from '../../../shared/flow-types.js';

/**
 * 图校验与拓扑工具。
 * MVP 为纯线性图：恰好一个开始、一个结束，无环、无孤立节点，Skill 节点必须配置 Skill。
 */

export class GraphValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraphValidationError';
  }
}

export function findNodesByType(graph: FlowGraph, type: FlowNodeType): FlowNode[] {
  return graph.nodes.filter((node) => node.type === type);
}

/** 构建邻接表与入度表。 */
function buildIndex(graph: FlowGraph): {
  adj: Map<string, string[]>;
  indegree: Map<string, number>;
} {
  const adj = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const node of graph.nodes) {
    adj.set(node.id, []);
    indegree.set(node.id, 0);
  }
  for (const edge of graph.edges) {
    adj.get(edge.source)?.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }
  return { adj, indegree };
}

export function validateGraph(graph: FlowGraph): void {
  if (graph.nodes.length === 0) {
    throw new GraphValidationError('工作流为空，请先添加节点');
  }

  const starts = findNodesByType(graph, 'start');
  const ends = findNodesByType(graph, 'end');
  if (starts.length !== 1) {
    throw new GraphValidationError('需要恰好一个开始节点');
  }
  if (ends.length !== 1) {
    throw new GraphValidationError('需要恰好一个结束节点');
  }

  // 节点 id 唯一
  const ids = new Set<string>();
  for (const node of graph.nodes) {
    if (ids.has(node.id)) {
      throw new GraphValidationError(`节点 id 重复：${node.id}`);
    }
    ids.add(node.id);
  }

  // 连线引用合法
  for (const edge of graph.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      throw new GraphValidationError('存在引用了不存在节点的连线');
    }
  }

  // Kahn 拓扑：同时检测环与不可达节点
  const { adj, indegree } = buildIndex(graph);
  const queue = graph.nodes
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .map((node) => node.id);
  let visited = 0;
  while (queue.length > 0) {
    const id = queue.shift()!;
    visited += 1;
    for (const next of adj.get(id) ?? []) {
      const d = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  if (visited !== graph.nodes.length) {
    throw new GraphValidationError('图中存在环或孤立节点，请检查连线');
  }
}

/** 返回线性执行顺序（节点 id 数组，从开始节点起）。 */
export function topoOrder(graph: FlowGraph): string[] {
  const { adj, indegree } = buildIndex(graph);
  const queue = graph.nodes
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .map((node) => node.id);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of adj.get(id) ?? []) {
      const d = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  return order;
}
