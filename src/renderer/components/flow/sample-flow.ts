import type {
  FlowDefinition,
  FlowEdge,
  FlowNode,
  FlowNodeConfig,
  FlowScope,
} from '../../../shared/flow-types.js';

function emptyConfig(): FlowNodeConfig {
  return { skill: null, prompt: '', inputMapping: {}, outputVars: [] };
}

/** 创建一条纯线性 Mock 示例：开始 → 需求整理 → 生成方案 → 结束。 */
export function createSampleFlow(scope: FlowScope, projectId: string | null): FlowDefinition {
  const now = Date.now();

  const start: FlowNode = {
    id: 'n-start',
    type: 'start',
    name: '开始',
    position: { x: 80, y: 180 },
    config: emptyConfig(),
  };
  const step1: FlowNode = {
    id: 'n-step1',
    type: 'skill',
    name: '需求整理',
    position: { x: 360, y: 160 },
    config: { ...emptyConfig(), prompt: '请整理输入的需求要点，输出结构化清单' },
  };
  const step2: FlowNode = {
    id: 'n-step2',
    type: 'skill',
    name: '生成方案',
    position: { x: 640, y: 160 },
    config: {
      ...emptyConfig(),
      prompt: '基于上游整理结果 {{n-step1.text}} 生成可落地方案',
    },
  };
  const end: FlowNode = {
    id: 'n-end',
    type: 'end',
    name: '结束',
    position: { x: 920, y: 180 },
    config: emptyConfig(),
  };

  const edges: FlowEdge[] = [
    { id: 'e1', source: 'n-start', target: 'n-step1' },
    { id: 'e2', source: 'n-step1', target: 'n-step2' },
    { id: 'e3', source: 'n-step2', target: 'n-end' },
  ];

  return {
    id: crypto.randomUUID(),
    name: '示例：需求到方案',
    description: '纯线性 Mock 演示流程',
    scope,
    projectId,
    isTemplate: false,
    graph: { nodes: [start, step1, step2, end], edges },
    createdAt: now,
    updatedAt: now,
  };
}
