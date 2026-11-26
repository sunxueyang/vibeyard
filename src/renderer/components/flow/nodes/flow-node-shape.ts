import LogicFlow, { HtmlNode, HtmlNodeModel } from '@logicflow/core';
import { esc } from '../../../dom-utils.js';
import type { FlowNode, NodeRunStatus } from '../../../../shared/flow-types.js';

/**
 * 统一的工作流 HTML 节点：开始 / Skill / 结束通过 data.type 区分外观。
 * 节点 properties.nodeData 为 FlowNode 合并运行状态 status；nodeData 变化时
 * LogicFlow 重渲染 HTML。视觉沿用高保真卡片：圆形图标 + 状态标记 + 变量统计。
 */

export const FLOW_NODE_SHAPE = 'flow-node';
export const FLOW_NODE_WIDTH = 208;

/** 节点画布尺寸（HTML 内容高度）。 */
export function nodeHeight(type: FlowNode['type']): number {
  return type === 'skill' ? 168 : 82;
}

export type FlowNodeData = FlowNode & { status: NodeRunStatus };

/* ---------- 内联图标（currentColor 继承图标底色） ---------- */

const ICON_PLAY =
  '<svg viewBox="0 0 24 24"><path d="M8.5 5.3v13.4c0 .8.9 1.3 1.6.9l10.2-6.7c.6-.4.6-1.4 0-1.8L10.1 4.4c-.7-.4-1.6.1-1.6.9z" fill="currentColor"/></svg>';
const ICON_CODE =
  '<svg viewBox="0 0 24 24"><path d="M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0 4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z" fill="currentColor"/></svg>';
const ICON_STOP =
  '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor"/></svg>';

function typeIcon(type: FlowNode['type']): string {
  if (type === 'start') return ICON_PLAY;
  if (type === 'end') return ICON_STOP;
  return ICON_CODE;
}

const STATE_CHECK =
  '<svg viewBox="0 0 24 24"><path d="M9.55 18-4.2 12.65l1.9-1.9 7.85 7.85L22.1 6l1.9 1.9z" fill="currentColor"/></svg>';
const STATE_CROSS =
  '<svg viewBox="0 0 24 24"><path d="m12 13.4-5.9 5.9-1.4-1.4 5.9-5.9L4.7 6.1l1.4-1.4 5.9 5.9 5.9-5.9 1.4 1.4-5.9 5.9 5.9 5.9-1.4 1.4z" fill="currentColor"/></svg>';

function stateMark(status: NodeRunStatus): string {
  if (status === 'success') return `<span class="flow-node__state is-success">${STATE_CHECK}</span>`;
  if (status === 'failed') return `<span class="flow-node__state is-failed">${STATE_CROSS}</span>`;
  if (status === 'running') return '<span class="flow-node__state is-running"></span>';
  return '<span class="flow-node__state is-idle"></span>';
}

/* ---------- 文本处理 ---------- */

function clamp(text: string, max: number): string {
  const one = text.trim().split('\n')[0];
  return one.length > max ? one.slice(0, max) + '…' : one;
}

function renderNode(data: FlowNodeData): string {
  const { type, config } = data;

  let body = '';

  if (type === 'skill') {
    const skill = config.skill;
    const skillName = skill ? skill.toolName || skill.serverName : '';
    const executorLine = skill
      ? `${esc(skill.serverName)} / ${esc(skill.toolName)}`
      : 'Mock（本地模拟，兜底）';
    const desc = config.prompt.trim() ? clamp(config.prompt, 46) : '暂无提示词，可在右侧配置';
    const inCount = Object.keys(config.inputMapping).length;
    const outCount = config.outputVars.length;

    body = `
      <div class="flow-node__meta">
        <span class="flow-node__skill-name">${skillName ? esc(skillName) : '未绑定 Skill'}</span>
        <span class="flow-node__tag">${skill ? 'Skill' : 'Mock'}</span>
      </div>
      <div class="flow-node__model">${executorLine}</div>
      <div class="flow-node__desc">${esc(desc)}</div>
      <div class="flow-node__footer">
        <span>输入 <b>${inCount}</b> 个变量</span>
        <span class="flow-node__footer-dot"></span>
        <span>输出 <b>${outCount}</b> 个变量</span>
      </div>
    `;
  } else {
    const sub =
      type === 'start'
        ? clamp(config.prompt || '流程已启动，等待进入…', 30)
        : clamp(config.prompt || '流程已完成，返回结果并结束', 30);
    body = `<div class="flow-node__sub">${esc(sub)}</div>`;
  }

  return `
    <div class="flow-node flow-node--${type} is-${data.status}">
      <div class="flow-node__bar"></div>
      <div class="flow-node__head">
        <span class="flow-node__icon">${typeIcon(type)}</span>
        <span class="flow-node__title">${esc(data.name)}</span>
        ${stateMark(data.status)}
      </div>
      ${body}
    </div>
  `;
}

/* ---------- 环检测：现有边中从 fromId 沿出边能否到达 toId ---------- */

interface EdgeLike {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
}

function canReach(edges: EdgeLike[], fromId: string, toId: string, ignoreEdgeId?: string): boolean {
  const visited = new Set<string>();
  const stack: string[] = [fromId];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (current === toId) {
      return true;
    }
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    for (const edge of edges) {
      if (ignoreEdgeId && edge.id === ignoreEdgeId) {
        continue;
      }
      if (edge.sourceNodeId === current) {
        stack.push(edge.targetNodeId);
      }
    }
  }
  return false;
}

/* ---------- LogicFlow 节点 View（HTML 卡片） ---------- */

class FlowNodeView extends HtmlNode {
  setHtml(rootEl: HTMLElement): void {
    const model = this.props.model as FlowNodeModel;
    const data = model.properties.nodeData as FlowNodeData;
    rootEl.innerHTML = renderNode(data);
  }
}

/* ---------- LogicFlow 节点 Model（尺寸 / 锚点 / 连接规则） ---------- */

class FlowNodeModel extends HtmlNodeModel {
  setAttributes(): void {
    this.width = FLOW_NODE_WIDTH;
    const data = this.properties.nodeData as FlowNodeData | undefined;
    this.height = data ? nodeHeight(data.type) : 82;
  }

  getNodeStyle() {
    const style = super.getNodeStyle();
    // 卡片视觉完全由内部 HTML 负责，背景 rect 透明，避免白底/边框
    style.fill = 'transparent';
    style.stroke = 'transparent';
    style.strokeWidth = 0;
    return style;
  }

  // 仅保留左（输入）、右（输出）两个锚点
  getDefaultAnchor() {
    const { x, y, width, id } = this;
    return [
      { x: x - width / 2, y, id: `${id}_in`, nodeId: id, direction: 'in' },
      { x: x + width / 2, y, id: `${id}_out`, nodeId: id, direction: 'out' },
    ];
  }

  initNodeData(data: LogicFlow.NodeConfig): void {
    super.initNodeData(data);

    /* ---- 作为连线起点（source）时的规则，按顺序给出准确提示 ---- */

    this.sourceRules.push({
      message: '不能连接到节点自身',
      validate: (source, target) => source.id !== target.id,
    });

    this.sourceRules.push({
      message: '请从节点右侧的输出端口发起连线',
      validate: (_source, _target, sourceAnchor) =>
        !!sourceAnchor.id && sourceAnchor.id.endsWith('_out'),
    });

    this.sourceRules.push({
      message: '这两个节点之间已存在连接，请勿重复连线',
      validate: (source, target) =>
        !this.graphModel.edges.some(
          (edge) => edge.sourceNodeId === source.id && edge.targetNodeId === target.id,
        ),
    });

    this.sourceRules.push({
      message: '该连线会形成循环，工作流必须是有向无环图（DAG）',
      validate: (source, target, _sa, _ta, edgeId) =>
        !canReach(this.graphModel.edges as EdgeLike[], target.id, source.id, edgeId),
    });

    /* ---- 作为连线终点（target）时的规则 ---- */

    this.targetRules.push({
      message: '请连接到节点左侧的输入端口',
      validate: (_source, _target, _sa, targetAnchor) =>
        !!targetAnchor.id && targetAnchor.id.endsWith('_in'),
    });
  }
}

/* ---------- 注册入口 ---------- */

export function registerFlowNode(lf: LogicFlow): void {
  lf.register({
    type: FLOW_NODE_SHAPE,
    view: FlowNodeView,
    model: FlowNodeModel,
  });
}
