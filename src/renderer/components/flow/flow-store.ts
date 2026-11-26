import type { FlowDefinition, FlowRunRecord, FlowScope } from '../../../shared/flow-types.js';

/** 渲染端工作流存储封装：全部经 preload 走主进程 SQLite，不直接碰文件。 */

export async function listFlows(
  scope: FlowScope,
  projectId: string | null,
): Promise<FlowDefinition[]> {
  return window.vibeyard.flow.list(scope, projectId);
}

export async function getFlow(id: string): Promise<FlowDefinition | null> {
  return window.vibeyard.flow.get(id);
}

export async function saveFlow(flow: FlowDefinition): Promise<void> {
  await window.vibeyard.flow.save(flow);
}

export async function deleteFlow(id: string): Promise<void> {
  await window.vibeyard.flow.delete(id);
}

export async function listRuns(flowId: string): Promise<FlowRunRecord[]> {
  return window.vibeyard.flow.listRuns(flowId);
}

export async function saveRun(run: FlowRunRecord): Promise<void> {
  await window.vibeyard.flow.saveRun(run);
}
