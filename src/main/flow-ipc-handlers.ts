import { ipcMain } from 'electron';
import * as flowDb from './flow-db';
import type { FlowDefinition, FlowRunRecord, FlowScope } from '../shared/flow-types';

/** 注册工作流相关 IPC，存储层已自带防御性自愈，不向上抛阻塞性错误。 */
export function registerFlowHandlers(): void {
  ipcMain.handle(
    'flow:list',
    (_event, scope: FlowScope, projectId: string | null) =>
      flowDb.listFlows(scope, projectId),
  );

  ipcMain.handle('flow:get', (_event, id: string) => flowDb.getFlow(id));

  ipcMain.handle('flow:save', (_event, flow: FlowDefinition) => {
    flowDb.upsertFlow(flow);
    return { success: true };
  });

  ipcMain.handle('flow:delete', (_event, id: string) => {
    flowDb.deleteFlow(id);
    return { success: true };
  });

  ipcMain.handle('flow:listRuns', (_event, flowId: string) =>
    flowDb.listRuns(flowId));

  ipcMain.handle('flow:saveRun', (_event, run: FlowRunRecord) => {
    flowDb.upsertRun(run);
    return { success: true };
  });
}
