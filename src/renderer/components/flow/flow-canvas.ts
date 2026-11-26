import LogicFlow from '@logicflow/core';
import { MiniMap } from '@logicflow/extension/es/components/mini-map/index.js';
import { showContextMenu, hideContextMenu } from '../board/board-context-menu.js';
import { t } from '../../i18n.js';
import {
  FLOW_NODE_SHAPE,
  FLOW_NODE_WIDTH,
  nodeHeight,
  registerFlowNode,
  type FlowNodeData,
} from './nodes/flow-node-shape.js';
import type {
  FlowGraph,
  FlowNode,
  FlowEdge,
  NodeRunStatus,
} from '../../../shared/flow-types.js';

/* 工作流专用紫色（取自集成效果图）。 */
const EDGE_PURPLE = '#9a74f0';
const PORT_DARK = '#131319';

/** MiniMap 插件实例对外暴露的最小接口（core 类型只声明了 render/destroy）。 */
interface MiniMapLike {
  show(): void;
  hide(): void;
}

export interface FlowCanvasOptions {
  container: HTMLElement;
  onSelectNode?: (nodeId: string | null) => void;
  onChange?: () => void;
}

export class FlowCanvas {
  private lf: LogicFlow;
  private options: FlowCanvasOptions;
  private toastEl: HTMLElement | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private selectedEdgeId: string | null = null;
  private readonly boundKeyDown: (e: KeyboardEvent) => void;

  constructor(options: FlowCanvasOptions) {
    this.options = options;

    this.lf = new LogicFlow({
      container: options.container,
      // 背景交给外层 .flow-canvas-wrap 的 CSS，LogicFlow 自身不绘制背景
      background: false,
      grid: {
        size: 20,
        visible: true,
        type: 'dot',
        config: { color: '#24252e', thickness: 1 },
      },
      edgeType: 'bezier',
      snapline: true,
      // 不启用内置键盘快捷键，避免与宿主应用快捷键冲突；删除快捷键由本类自行实现
      keyboard: { enabled: false },
      // 选中边后可拖拽起点/终点调整点，把连线改接到其他节点（复用 source/target 规则）
      adjustEdgeStartAndEnd: true,
      // 实例级注册小地图，不污染 LogicFlow 全局静态插件
      plugins: [MiniMap],
      pluginsOptions: {
        miniMap: {
          width: 168,
          height: 120,
          showEdge: true,
          isShowHeader: false,
          isShowCloseIcon: false,
          rightPosition: 16,
          bottomPosition: 16,
        },
      },
      style: {
        baseEdge: { stroke: EDGE_PURPLE, strokeWidth: 2 },
        bezier: { stroke: EDGE_PURPLE, strokeWidth: 2, fill: 'none' },
        anchor: {
          stroke: EDGE_PURPLE,
          fill: PORT_DARK,
          r: 4.5,
          hover: {
            r: 8,
            fill: EDGE_PURPLE,
            fillOpacity: 0.22,
            stroke: 'transparent',
          },
        },
        arrow: { offset: 8, verticalLength: 4 },
        // 选中边后两端的拖拽调整点，沿用端口的深色填充+紫色描边（r=7 保证缩小后仍好抓）
        edgeAdjust: {
          r: 7,
          fill: PORT_DARK,
          stroke: EDGE_PURPLE,
          strokeWidth: 2,
        },
        outline: { stroke: 'transparent', strokeWidth: 0 },
        // 连线悬停框默认是蓝色虚线，改为半透明紫色以统一主题
        edgeOutline: { stroke: 'transparent', hover: { stroke: 'rgba(154, 116, 240, 0.6)' } },
      },
    });

    registerFlowNode(this.lf);

    /* ---- 选择 ---- */
    this.lf.on('node:click', ({ data }) => {
      this.selectedEdgeId = null;
      this.options.onSelectNode?.(data.id);
    });
    this.lf.on('blank:click', () => {
      this.selectedEdgeId = null;
      this.options.onSelectNode?.(null);
    });
    this.lf.on('edge:click', ({ data }: { data: { id: string } }) => {
      this.selectedEdgeId = data.id;
      this.options.onSelectNode?.(null);
    });

    /* ---- 右键连线：菜单删除（同时移除 source→target 对应关系） ---- */
    // 按下端口即选中所在节点。端口只在节点“悬停或选中”时渲染；从右侧端口向外拖时鼠标第一步就
    // 离开节点（取消悬停），而 LogicFlow 到拖拽开始回调里才选中节点，端口会被卸载重建，
    // 导致松手时无人响应、连线静默丢失（LogicFlow 2.2.5 时序问题，这里提前选中规避）。
    this.lf.on('anchor:mousedown', ({ nodeModel }: { nodeModel: { id: string; isSelected: boolean } }) => {
      if (nodeModel && !nodeModel.isSelected) {
        this.lf.graphModel.selectNodeById(nodeModel.id);
      }
    });
    this.lf.on('edge:contextmenu', ({ data, e }: { data: { id: string }; e: MouseEvent }) => {
      const edgeId = data.id;
      // LogicFlow 右键时会选中该边，这里同步本地选中态，Delete 键行为保持一致
      this.selectedEdgeId = edgeId;
      this.options.onSelectNode?.(null);
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, [
        {
          label: t('contextMenu.flow.deleteEdge'),
          danger: true,
          action: () => this.deleteEdge(edgeId),
        },
      ]);
    });
    // 右键菜单打开后在空白处右键，关闭菜单（右键不触发 click，通用菜单自身关不掉）
    this.lf.on('blank:contextmenu', () => {
      this.selectedEdgeId = null;
      this.options.onSelectNode?.(null);
      hideContextMenu();
    });

    /* ---- 数据变更（onChange 当前上层未传入，保留机制） ---- */
    this.lf.on('node:add', () => this.options.onChange?.());
    this.lf.on('node:delete', () => this.options.onChange?.());
    this.lf.on('edge:add', () => this.options.onChange?.());
    this.lf.on('edge:delete', () => {
      this.selectedEdgeId = null;
      this.options.onChange?.();
    });
    this.lf.on('node:drop', () => this.options.onChange?.());

    /* ---- 连接被拒：明确提示，不再静默 ---- */
    this.lf.on('connection:not-allowed', ({ msg }) => {
      this.showReject(msg);
    });

    /* ---- 删除选中边/节点：Delete / Backspace（输入框聚焦时不拦截） ---- */
    this.boundKeyDown = this.handleKeyDown.bind(this);
    document.addEventListener('keydown', this.boundKeyDown);
  }

  /* ----------------------------------------------------------------
   * 节点增删改
   * ---------------------------------------------------------------- */

  addFlowNode(node: FlowNode, status: NodeRunStatus = 'idle'): void {
    const height = nodeHeight(node.type);
    const data: FlowNodeData = { ...node, status };
    // FlowNode.position 是左上角，LogicFlow 的 x/y 是中心，需要转换
    this.lf.addNode({
      id: node.id,
      type: FLOW_NODE_SHAPE,
      x: node.position.x + FLOW_NODE_WIDTH / 2,
      y: node.position.y + height / 2,
      properties: { nodeData: data },
    });
  }

  removeNode(nodeId: string): void {
    this.lf.deleteNode(nodeId);
  }

  getNodeData(nodeId: string): FlowNodeData | undefined {
    const model = this.lf.getNodeModelById(nodeId);
    return model?.properties.nodeData as FlowNodeData | undefined;
  }

  /** 更新节点业务数据（保留当前运行状态）。 */
  updateFlowNode(node: FlowNode): void {
    const model = this.lf.getNodeModelById(node.id);
    if (!model) return;
    const current = model.properties.nodeData as FlowNodeData | undefined;
    const status = current?.status ?? 'idle';
    this.lf.setProperties(node.id, { nodeData: { ...node, status } });
  }

  setNodeStatus(nodeId: string, status: NodeRunStatus): void {
    const model = this.lf.getNodeModelById(nodeId);
    if (!model) return;
    const current = model.properties.nodeData as FlowNodeData | undefined;
    if (current) {
      this.lf.setProperties(nodeId, { nodeData: { ...current, status } });
    }
  }

  resetAllStatus(): void {
    const raw = this.lf.getGraphRawData();
    for (const node of raw.nodes) {
      const data = node.properties?.nodeData as FlowNodeData | undefined;
      if (data && data.status !== 'idle') {
        this.lf.setProperties(node.id, { nodeData: { ...data, status: 'idle' } });
      }
    }
  }

  /* ----------------------------------------------------------------
   * 加载 / 导出
   * ---------------------------------------------------------------- */

  loadFlow(graph: FlowGraph, statuses?: Record<string, NodeRunStatus>): void {
    this.lf.clearData();
    for (const node of graph.nodes) {
      this.addFlowNode(node, statuses?.[node.id] ?? 'idle');
    }
    // addEdge 不触发连接规则，可安全重建已保存的合法图；显式绑定锚点以精确锚定端口
    for (const edge of graph.edges) {
      this.lf.addEdge({
        id: edge.id,
        type: 'bezier',
        sourceNodeId: edge.source,
        targetNodeId: edge.target,
        sourceAnchorId: `${edge.source}_out`,
        targetAnchorId: `${edge.target}_in`,
      });
    }
    this.showMiniMap();
  }

  /** 显示右下角小地图（首次会初始化其内部 LogicFlow 实例）。 */
  private showMiniMap(): void {
    const miniMap = this.lf.extension.miniMap as MiniMapLike | undefined;
    miniMap?.show();
  }

  toFlowGraph(): FlowGraph {
    const raw = this.lf.getGraphRawData();

    const nodes: FlowNode[] = raw.nodes.map((node) => {
      const data = node.properties.nodeData as FlowNodeData;
      const { status: _omit, ...flowNode } = data;
      const width = (node.properties.width as number) ?? FLOW_NODE_WIDTH;
      const height = nodeHeight(data.type);
      return {
        ...flowNode,
        // 中心坐标转回左上角
        position: { x: node.x - width / 2, y: node.y - height / 2 },
      };
    });

    const edges: FlowEdge[] = raw.edges.map((edge) => ({
      id: edge.id,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
    }));

    return { nodes, edges };
  }

  /* ----------------------------------------------------------------
   * 尺寸 / 缩放 / 坐标
   * ---------------------------------------------------------------- */

  /**
   * 画布从隐藏切换到显示后调用。LogicFlow 内层容器为 100% 宽高会自动跟随，
   * 这里再主动 resize 一次，确保坐标与视口同步。
   */
  resizeToParent(): void {
    this.lf.resize();
  }

  zoomToFit(): void {
    this.lf.fitView(40, 40);
  }

  zoomIn(): void {
    this.lf.zoom(true);
  }

  zoomOut(): void {
    this.lf.zoom(false);
  }

  /** 当前缩放比例（1 = 100%）。 */
  get scale(): number {
    return this.lf.getTransform().SCALE_X;
  }

  /** 浏览器客户端坐标转画布本地坐标（用于拖拽落点，左上角语义）。 */
  clientToLocal(clientX: number, clientY: number): { x: number; y: number } {
    return this.lf.getPointByClient(clientX, clientY).canvasOverlayPosition;
  }

  /* ----------------------------------------------------------------
   * 历史 / 销毁
   * ---------------------------------------------------------------- */

  undo(): void {
    this.lf.undo();
  }

  redo(): void {
    this.lf.redo();
  }

  dispose(): void {
    document.removeEventListener('keydown', this.boundKeyDown);
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
    this.lf.destroy();
  }

  /* ----------------------------------------------------------------
   * 连接拒绝的轻量 Toast 提示
   * ---------------------------------------------------------------- */

  private showReject(msg?: string): void {
    const text = msg || '当前连接不被允许';
    if (!this.toastEl) {
      this.toastEl = document.createElement('div');
      this.toastEl.className = 'flow-toast';
      this.options.container.appendChild(this.toastEl);
    }
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');

    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
    this.toastTimer = setTimeout(() => {
      this.toastEl?.classList.remove('show');
    }, 2600);
  }

    /* ----------------------------------------------------------------
   * 删除连线（右键菜单入口；Delete 键走 handleKeyDown）
   * ---------------------------------------------------------------- */

  private deleteEdge(edgeId: string): void {
    if (this.selectedEdgeId === edgeId) {
      this.selectedEdgeId = null;
    }
    // deleteEdge 会从图中移除该边，toFlowGraph 导出时不再包含这条 source→target 关系
    this.lf.deleteEdge(edgeId);
  }

  /* ----------------------------------------------------------------
   * Delete / Backspace 删除选中边或节点
   * ---------------------------------------------------------------- */

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.key !== 'Delete' && e.key !== 'Backspace') {
      return;
    }
    // 正在输入文字时不拦截，避免 Backspace 误删连线或影响文本编辑
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName;
    if (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      target?.isContentEditable
    ) {
      return;
    }

    // 优先删除当前选中的边
    if (this.selectedEdgeId) {
      e.preventDefault();
      const id = this.selectedEdgeId;
      this.selectedEdgeId = null;
      this.lf.deleteEdge(id);
      return;
    }

    // 否则删除选中的节点（LogicFlow 会连带删除其相连边）
    const selected = this.lf.getSelectElements(true);
    const nodes = selected.nodes || [];
    if (nodes.length > 0) {
      e.preventDefault();
      for (const node of nodes) {
        this.lf.deleteNode(node.id);
      }
    }
  }
}
