import { FlowCanvas } from './flow-canvas.js';
import { NodeConfigPanel } from './panels/node-config-panel.js';
import { createNodePalette, FLOW_NODE_MIME } from './panels/node-palette.js';
import {
  createLogBody,
  appendLog,
  type LogLevel,
} from './panels/run-log-panel.js';
import { FlowRunner } from './execution/flow-runner.js';
import { createSampleFlow } from './sample-flow.js';
import {
  listFlows,
  saveFlow,
  saveRun,
} from './flow-store.js';
import { appState } from '../../state.js';
import type {
  FlowDefinition,
  FlowMcpServer,
  FlowNode,
  FlowNodeConfig,
  FlowNodeType,
  FlowRunContext,
  FlowRunRecord,
  FlowScope,
} from '../../../shared/flow-types.js';

function emptyConfig(): FlowNodeConfig {
  return { skill: null, prompt: '', inputMapping: {}, outputVars: [] };
}

function defaultName(type: FlowNodeType): string {
  if (type === 'start') return '开始';
  if (type === 'end') return '结束';
  return 'Skill 节点';
}

export class FlowView {
  private root: HTMLElement;
  private canvas!: FlowCanvas;
  private configPanel: NodeConfigPanel;
  private logBody: HTMLElement;
  private runner = new FlowRunner();
  private flowListEl!: HTMLElement;
  private titleEl!: HTMLElement;
  private runBtn!: HTMLButtonElement;
  private scopeTabs!: HTMLElement[];
  private zoomPctEl!: HTMLElement;

  private current: FlowDefinition | null = null;
  private selectedNodeId: string | null = null;
  private listScope: FlowScope = 'user';
  private running = false;

  constructor() {
    this.configPanel = new NodeConfigPanel({
      onUpdateNode: (node) => this.handleNodeUpdate(node),
      onUpdateMcpServers: (servers) => this.handleMcpServers(servers),
      onSave: () => void this.handleSave(),
    });
    this.logBody = createLogBody();
    this.root = this.buildDom();
    this.initCanvas();
    this.bindTopbar();
    this.bindDrop();
    this.bindScopeTabs();
    this.bindZoomBar();
  }

  get element(): HTMLElement {
    return this.root;
  }

  private currentProjectId(): string | null {
    return appState.activeProject?.id ?? null;
  }

  private projectPath(projectId: string | null): string | undefined {
    if (!projectId) return undefined;
    return appState.projects.find((p) => p.id === projectId)?.path;
  }

  private buildDom(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'flow-view';
    el.className = 'hidden';
    el.innerHTML = `
      <div class="flow-topbar">
        <div class="flow-topbar__group">
          <button class="flow-icon-btn" data-act="back">← 返回</button>
          <span class="flow-topbar__title" data-el="title">工作流</span>
        </div>
        <div class="flow-topbar__spacer"></div>
        <div class="flow-topbar__group">
          <button class="flow-icon-btn" data-act="new">新建</button>
          <button class="flow-icon-btn" data-act="save">保存</button>
          <button class="flow-icon-btn" data-act="undo">撤销</button>
          <button class="flow-icon-btn" data-act="redo">重做</button>
          <button class="flow-icon-btn" data-act="fit">适应</button>
          <button class="flow-run-btn" data-act="run">▶ 运行</button>
        </div>
      </div>
      <div class="flow-body">
        <div class="flow-left">
          <div class="flow-section">
            <div class="flow-section__title">节点库</div>
            <div class="flow-section__body" data-el="palette"></div>
          </div>
          <div class="flow-section flow-section--grow">
            <div class="flow-section__title">工作流</div>
            <div class="flow-scope-tabs">
              <button class="flow-scope-tab" data-scope="user">通用</button>
              <button class="flow-scope-tab" data-scope="project">项目</button>
            </div>
            <div class="flow-section__body" data-el="flowlist"></div>
          </div>
        </div>
        <div class="flow-center">
          <div class="flow-canvas-wrap" data-el="canvas"></div>
          <div class="flow-zoom-bar" data-el="zoombar">
            <button class="flow-zoom-btn" data-z="out">−</button>
            <span class="flow-zoom-pct" data-el="zoompct">100%</span>
            <button class="flow-zoom-btn" data-z="in">+</button>
            <button class="flow-zoom-btn" data-z="fit" title="适应画布">⊡</button>
          </div>
        </div>
        <div class="flow-right">
          <div class="flow-section">
            <div class="flow-section__title">节点配置</div>
            <div data-el="config"></div>
          </div>
          <div class="flow-section flow-section--log">
            <div class="flow-section__title">运行日志</div>
            <div data-el="log"></div>
          </div>
        </div>
      </div>
    `;

    el.querySelector('[data-el="palette"]')!.appendChild(createNodePalette());
    el.querySelector('[data-el="config"]')!.appendChild(this.configPanel.element);
    el.querySelector('[data-el="log"]')!.appendChild(this.logBody);

    this.titleEl = el.querySelector('[data-el="title"]')!;
    this.flowListEl = el.querySelector('[data-el="flowlist"]')!;
    this.runBtn = el.querySelector('[data-act="run"]')!;
    this.scopeTabs = Array.from(el.querySelectorAll('.flow-scope-tab'));
    this.zoomPctEl = el.querySelector('[data-el="zoompct"]')!;
    return el;
  }

  private initCanvas(): void {
    const container = this.root.querySelector('[data-el="canvas"]') as HTMLElement;
    this.canvas = new FlowCanvas({
      container,
      onSelectNode: (id) => this.handleSelect(id),
    });
  }

  private bindTopbar(): void {
    const act = (name: string) =>
      this.root.querySelector(`[data-act="${name}"]`) as HTMLButtonElement;

    act('back').addEventListener('click', () => this.close());
    act('new').addEventListener('click', () => this.handleNew());
    act('save').addEventListener('click', () => void this.handleSave());
    act('undo').addEventListener('click', () => this.canvas.undo());
    act('redo').addEventListener('click', () => this.canvas.redo());
    act('fit').addEventListener('click', () => this.canvas.zoomToFit());
    this.runBtn.addEventListener('click', () => {
      if (this.running) this.runner.cancel();
      else void this.handleRun();
    });
  }

  private bindScopeTabs(): void {
    for (const tab of this.scopeTabs) {
      tab.addEventListener('click', () => {
        this.listScope = (tab as HTMLElement).dataset.scope as FlowScope;
        this.updateScopeTabActive();
        void this.refreshFlowList();
      });
    }
    this.updateScopeTabActive();
  }

  private updateScopeTabActive(): void {
    for (const tab of this.scopeTabs) {
      tab.classList.toggle('active', (tab as HTMLElement).dataset.scope === this.listScope);
    }
  }

  private bindZoomBar(): void {
    const bar = this.root.querySelector('[data-el="zoombar"]') as HTMLElement;
    bar.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-z]') as HTMLElement | null;
      if (!btn) return;
      const z = btn.dataset.z;
      if (z === 'in') this.canvas.zoomIn();
      else if (z === 'out') this.canvas.zoomOut();
      else if (z === 'fit') this.canvas.zoomToFit();
      this.updateZoomPct();
    });
  }

  private updateZoomPct(): void {
    const pct = Math.round(this.canvas.scale * 100);
    this.zoomPctEl.textContent = `${pct}%`;
  }

  private bindDrop(): void {
    const wrap = this.root.querySelector('.flow-canvas-wrap') as HTMLElement;
    wrap.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });
    wrap.addEventListener('drop', (e) => {
      e.preventDefault();
      const type = e.dataTransfer?.getData(FLOW_NODE_MIME) as FlowNodeType | '';
      if (!type) return;
      const local = this.canvas.clientToLocal(e.clientX, e.clientY);
      const node: FlowNode = {
        id: crypto.randomUUID(),
        type,
        name: defaultName(type),
        position: { x: local.x, y: local.y },
        config: emptyConfig(),
      };
      this.canvas.addFlowNode(node);
      this.handleSelect(node.id);
    });
  }

  private handleSelect(id: string | null): void {
    this.selectedNodeId = id;
    const data = id ? this.canvas.getNodeData(id) ?? null : null;
    this.configPanel.render(data);
  }

  private handleNodeUpdate(node: FlowNode): void {
    this.canvas.updateFlowNode(node);
  }

  private handleMcpServers(servers: FlowMcpServer[]): void {
    if (this.current) this.current.graph.mcpServers = servers;
    this.configPanel.setMcpServers(servers);
  }

  private loadFlow(flow: FlowDefinition): void {
    this.current = flow;
    this.titleEl.textContent = flow.name;
    this.configPanel.setMcpServers(flow.graph.mcpServers ?? []);
    this.canvas.loadFlow(flow.graph);
    this.handleSelect(null);
    this.canvas.zoomToFit();
    this.updateZoomPct();
  }

  private handleNew(): void {
    const now = Date.now();
    const projectId = this.listScope === 'project' ? this.currentProjectId() : null;
    const start: FlowNode = {
      id: crypto.randomUUID(),
      type: 'start',
      name: '开始',
      position: { x: 120, y: 200 },
      config: emptyConfig(),
    };
    const end: FlowNode = {
      id: crypto.randomUUID(),
      type: 'end',
      name: '结束',
      position: { x: 480, y: 200 },
      config: emptyConfig(),
    };
    const flow: FlowDefinition = {
      id: crypto.randomUUID(),
      name: '未命名工作流',
      description: '',
      scope: this.listScope,
      projectId,
      isTemplate: false,
      graph: { nodes: [start, end], edges: [] },
      createdAt: now,
      updatedAt: now,
    };
    this.loadFlow(flow);
  }

  private async handleSave(): Promise<void> {
    if (!this.current) return;
    const graph = this.canvas.toFlowGraph();
    graph.mcpServers = this.current.graph.mcpServers;
    this.current.graph = graph;
    this.current.updatedAt = Date.now();
    await saveFlow(this.current);
    appendLog(this.logBody, 'info', `工作流「${this.current.name}」已保存`);
    await this.refreshFlowList();
  }

  private async refreshFlowList(): Promise<void> {
    const projectId = this.listScope === 'project' ? this.currentProjectId() : null;
    const flows = await listFlows(this.listScope, projectId);
    this.flowListEl.innerHTML = '';

    if (flows.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'flow-empty';
      empty.textContent =
        this.listScope === 'user'
          ? '暂无通用工作流，可点「新建」或使用内置示例'
          : '当前项目暂无工作流';
      this.flowListEl.appendChild(empty);
      return;
    }

    for (const flow of flows) {
      const item = document.createElement('button');
      item.className = 'flow-list-item' + (this.current?.id === flow.id ? ' active' : '');
      const nameEl = document.createElement('div');
      nameEl.className = 'flow-list-item__name';
      nameEl.textContent = flow.name;
      const metaEl = document.createElement('div');
      metaEl.className = 'flow-list-item__meta';
      metaEl.textContent = new Date(flow.updatedAt).toLocaleDateString('zh-CN');
      item.appendChild(nameEl);
      item.appendChild(metaEl);
      item.addEventListener('click', () => this.loadFlow(flow));
      this.flowListEl.appendChild(item);
    }
  }

  /** 通用工作流运行时选择目标项目 / 目录。 */
  private pickTargetDirectory(): Promise<string | null> {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'flow-pick-modal';
      modal.innerHTML = `
        <div class="flow-pick-dialog">
          <div class="flow-pick-title">选择目标项目 / 目录</div>
          <div class="flow-pick-list"></div>
          <div class="flow-pick-actions">
            <button class="flow-icon-btn" data-act="browse">浏览其他目录…</button>
            <button class="flow-icon-btn" data-act="cancel">取消</button>
          </div>
        </div>
      `;
      const list = modal.querySelector('.flow-pick-list') as HTMLElement;
      if (appState.projects.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'flow-empty';
        empty.textContent = '暂无已创建项目，可点浏览选择目录';
        list.appendChild(empty);
      }
      for (const p of appState.projects) {
        const item = document.createElement('button');
        item.className = 'flow-list-item';
        const nameEl = document.createElement('div');
        nameEl.className = 'flow-list-item__name';
        nameEl.textContent = p.name;
        const metaEl = document.createElement('div');
        metaEl.className = 'flow-list-item__meta';
        metaEl.textContent = p.path;
        item.appendChild(nameEl);
        item.appendChild(metaEl);
        item.addEventListener('click', () => {
          modal.remove();
          resolve(p.path);
        });
        list.appendChild(item);
      }

      (modal.querySelector('[data-act="cancel"]') as HTMLElement).addEventListener(
        'click',
        () => {
          modal.remove();
          resolve(null);
        },
      );
      (modal.querySelector('[data-act="browse"]') as HTMLElement).addEventListener(
        'click',
        async () => {
          const dir = await window.vibeyard.fs.browseDirectory();
          modal.remove();
          resolve(dir);
        },
      );

      this.root.appendChild(modal);
    });
  }

  private async handleRun(): Promise<void> {
    if (!this.current || this.running) return;
    const graph = this.canvas.toFlowGraph();
    graph.mcpServers = this.current.graph.mcpServers;
    this.current.graph = graph;

    let cwd: string | undefined;
    if (this.current.scope === 'project') {
      cwd = this.projectPath(this.current.projectId) ?? appState.activeProject?.path;
    } else {
      const picked = await this.pickTargetDirectory();
      if (!picked) return;
      cwd = picked;
    }
    if (!cwd) {
      appendLog(this.logBody, 'error', '无法确定运行目录，已取消');
      return;
    }

    const context: FlowRunContext = { cwd, inputs: {} };
    const record: FlowRunRecord = {
      id: crypto.randomUUID(),
      flowId: this.current.id,
      scope: this.current.scope,
      projectId: this.current.projectId,
      context,
      status: 'running',
      result: null,
      error: null,
      startedAt: Date.now(),
      finishedAt: null,
    };

    this.running = true;
    this.runBtn.textContent = '■ 停止';
    this.canvas.resetAllStatus();

    const outcome = await this.runner.run({
      graph: this.current.graph,
      context,
      callbacks: {
        onNodeStatus: (nodeId, status) => this.canvas.setNodeStatus(nodeId, status),
        onLog: (level: LogLevel, text) => appendLog(this.logBody, level, text),
      },
    });

    record.status = outcome.success ? 'success' : 'failed';
    record.result = outcome.result;
    record.error = outcome.error ?? null;
    record.finishedAt = Date.now();
    await saveRun(record);

    this.running = false;
    this.runBtn.textContent = '▶ 运行';
  }

  async open(): Promise<void> {
    this.root.classList.remove('hidden');
    // 显示后先纠正画布容器尺寸（初始化时为隐藏的 0 尺寸），再加载数据，节点才能正常渲染。
    this.canvas.resizeToParent();
    const projectId = this.listScope === 'project' ? this.currentProjectId() : null;
    const flows = await listFlows(this.listScope, projectId);
    await this.refreshFlowList();
    if (!this.current) {
      if (flows.length > 0) {
        // 重开应用：优先恢复最近编辑的工作流（listFlows 已按 updatedAt 倒序）
        this.loadFlow(flows[0]);
      } else {
        // 数据库为空时才创建内置示例；user 作用域不绑定项目，projectId 必须为 null
        const sampleProjectId = this.listScope === 'project' ? this.currentProjectId() : null;
        const sample = createSampleFlow(this.listScope, sampleProjectId);
        this.loadFlow(sample);
      }
    }
  }

  close(): void {
    this.root.classList.add('hidden');
  }
}

let singleton: FlowView | null = null;

/** 创建并挂载工作流视图（渲染端启动时调用一次）。 */
export function initFlowView(): FlowView {
  if (!singleton) {
    singleton = new FlowView();
    document.body.appendChild(singleton.element);
  }
  return singleton;
}

export function getFlowView(): FlowView | null {
  return singleton;
}
