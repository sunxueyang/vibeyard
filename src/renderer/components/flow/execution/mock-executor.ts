import type { NodeExecutionInput, NodeExecutionResult, NodeExecutor } from './executor-types.js';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 本地模拟执行器：不依赖任何外部服务，作为兜底与离线演示。 */
export class MockExecutor implements NodeExecutor {
  async execute(input: NodeExecutionInput): Promise<NodeExecutionResult> {
    await delay(400 + Math.random() * 400);
    return {
      success: true,
      output: {
        text: `【Mock】${input.node.name} 已执行：${input.prompt || '(无提示词)'}`,
        node: input.node.name,
        cwd: input.cwd,
        timestamp: Date.now(),
        echoedInputs: input.inputs,
      },
    };
  }
}
