import type { FlowNodeType } from '../../../../shared/flow-types.js';

/** 拖拽时携带节点类型的 MIME。 */
export const FLOW_NODE_MIME = 'application/x-flow-node-type';

const ICON_PLAY =
  '<svg viewBox="0 0 24 24"><path d="M8.5 5.3v13.4c0 .8.9 1.3 1.6.9l10.2-6.7c.6-.4.6-1.4 0-1.8L10.1 4.4c-.7-.4-1.6.1-1.6.9z" fill="currentColor"/></svg>';
const ICON_CODE =
  '<svg viewBox="0 0 24 24"><path d="M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0 4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z" fill="currentColor"/></svg>';
const ICON_STOP =
  '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor"/></svg>';

interface PaletteItem {
  type: FlowNodeType;
  label: string;
  sub: string;
  icon: string;
  cls: string;
}

const ITEMS: PaletteItem[] = [
  { type: 'start', label: '开始', sub: '工作流入口', icon: ICON_PLAY, cls: 'start' },
  { type: 'skill', label: 'Skill 节点', sub: '调用技能执行任务', icon: ICON_CODE, cls: 'skill' },
  { type: 'end', label: '结束', sub: '返回结果并结束', icon: ICON_STOP, cls: 'end' },
];

/** 左侧节点库：HTML5 拖拽，落点由 flow-view 处理。 */
export function createNodePalette(): HTMLElement {
  const wrap = document.createElement('div');
  for (const item of ITEMS) {
    const el = document.createElement('div');
    el.className = 'flow-palette-item';
    el.draggable = true;
    el.innerHTML =
      `<span class="flow-palette-icon flow-palette-icon--${item.cls}">${item.icon}</span>` +
      `<span class="flow-palette-text">` +
      `<span class="flow-palette-label">${item.label}</span>` +
      `<span class="flow-palette-sub">${item.sub}</span>` +
      `</span>`;
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData(FLOW_NODE_MIME, item.type);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
    });
    wrap.appendChild(el);
  }
  return wrap;
}
