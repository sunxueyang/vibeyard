import type {
  FlowNode,
  FlowMcpServer,
  SkillRef,
  NodeRunStatus,
} from '../../../../shared/flow-types.js';
import type { FlowNodeData } from '../nodes/flow-node-shape.js';

export interface ConfigPanelCallbacks {
  onUpdateNode: (node: FlowNode) => void;
  onUpdateMcpServers: (servers: FlowMcpServer[]) => void;
  onSave: () => void;
}

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

const BADGE: Record<NodeRunStatus, string> = {
  idle: '待运行',
  running: '运行中',
  success: '已成功',
  failed: '已失败',
};

function toFlowNode(data: FlowNodeData): FlowNode {
  const { status: _status, ...rest } = data;
  return rest;
}

export class NodeConfigPanel {
  private root: HTMLElement;
  private callbacks: ConfigPanelCallbacks;
  private current: FlowNodeData | null = null;
  private servers: FlowMcpServer[] = [];
  private toolSelect: HTMLSelectElement | null = null;
  private tools: string[] = [];

  constructor(callbacks: ConfigPanelCallbacks) {
    this.callbacks = callbacks;
    this.root = document.createElement('div');
    this.root.className = 'flow-section__body';
  }

  get element(): HTMLElement {
    return this.root;
  }

  setMcpServers(servers: FlowMcpServer[]): void {
    this.servers = servers;
  }

  private pushUpdate(): void {
    if (this.current) this.callbacks.onUpdateNode(toFlowNode(this.current));
  }

  private upsertServer(name: string, url: string): void {
    const others = this.servers.filter((s) => s.name !== name);
    this.servers = [...others, { name, url }];
    this.callbacks.onUpdateMcpServers(this.servers);
  }

  render(node: FlowNodeData | null): void {
    this.current = node;
    this.tools = [];
    this.toolSelect = null;
    this.root.innerHTML = '';

    if (!node) {
      const hint = document.createElement('div');
      hint.className = 'flow-hint';
      hint.textContent = '点击画布中的节点以查看和编辑配置。';
      this.root.appendChild(hint);
      return;
    }

    this.root.appendChild(this.buildHeader(node));
    this.root.appendChild(this.buildNameField());

    if (node.type === 'skill') {
      this.buildExecutorSection();
    }

    this.root.appendChild(this.buildSaveButton());
  }

  private buildHeader(node: FlowNodeData): HTMLElement {
    const head = document.createElement('div');
    head.className = 'flow-cfg-head';
    head.innerHTML =
      '<span class="flow-cfg-head__icon flow-cfg-head__icon--' + node.type + '">' + typeIcon(node.type) + '</span>' +
      '<span class="flow-cfg-head__title">' + node.name + '</span>' +
      '<span class="flow-cfg-badge flow-cfg-badge--' + node.status + '">' + BADGE[node.status] + '</span>';
    return head;
  }

  private buildSaveButton(): HTMLElement {
    const btn = document.createElement('button');
    btn.className = 'flow-btn flow-btn--save';
    btn.textContent = '保存';
    btn.addEventListener('click', () => this.callbacks.onSave());
    return btn;
  }

  private buildNameField(): HTMLElement {
    const field = document.createElement('div');
    field.className = 'flow-field';
    const label = document.createElement('label');
    label.className = 'flow-field__label';
    label.textContent = '节点名称';
    const input = document.createElement('input');
    input.className = 'flow-input';
    input.value = this.current?.name ?? '';
    input.addEventListener('input', () => {
      if (this.current) {
        this.current.name = input.value;
        this.pushUpdate();
      }
    });
    field.appendChild(label);
    field.appendChild(input);
    return field;
  }

  private buildExecutorSection(): void {
    const node = this.current;
    if (!node) return;

    const execField = document.createElement('div');
    execField.className = 'flow-field';
    const execLabel = document.createElement('label');
    execLabel.className = 'flow-field__label';
    execLabel.textContent = '执行器';
    const execSelect = document.createElement('select');
    execSelect.className = 'flow-select';
    execSelect.innerHTML =
      '<option value="mock">Mock（本地模拟，兜底）</option>' +
      '<option value="mcp">MCP（调用真实 Skill）</option>';
    execSelect.value = node.config.skill ? 'mcp' : 'mock';
    execSelect.addEventListener('change', () => {
      if (!this.current) return;
      if (execSelect.value === 'mock') {
        this.current.config.skill = null;
      } else {
        this.current.config.skill = this.current.config.skill ?? {
          source: 'mcp',
          serverName: '',
          toolName: '',
        };
      }
      this.pushUpdate();
      this.render(this.current);
    });
    execField.appendChild(execLabel);
    execField.appendChild(execSelect);
    this.root.appendChild(execField);

    if (node.config.skill) {
      this.buildMcpSection();
    }

    this.buildPromptField();
  }

  private buildMcpSection(): void {
    const skill = this.current?.config.skill;
    if (!skill) return;

    const known = this.servers.find((s) => s.name === skill.serverName);

    const nameField = document.createElement('div');
    nameField.className = 'flow-field';
    const nameLabel = document.createElement('label');
    nameLabel.className = 'flow-field__label';
    nameLabel.textContent = 'MCP Server 名称';
    const nameInput = document.createElement('input');
    nameInput.className = 'flow-input';
    nameInput.placeholder = '如 my-server';
    nameInput.value = skill.serverName;
    nameField.appendChild(nameLabel);
    nameField.appendChild(nameInput);

    const urlField = document.createElement('div');
    urlField.className = 'flow-field';
    const urlLabel = document.createElement('label');
    urlLabel.className = 'flow-field__label';
    urlLabel.textContent = 'MCP Server URL';
    const urlInput = document.createElement('input');
    urlInput.className = 'flow-input';
    urlInput.placeholder = '如 http://localhost:3000/mcp';
    urlInput.value = known?.url ?? '';
    urlField.appendChild(urlLabel);
    urlField.appendChild(urlInput);

    const connectBtn = document.createElement('button');
    connectBtn.className = 'flow-btn flow-btn--ghost';
    connectBtn.textContent = '连接并加载工具';
    connectBtn.addEventListener('click', async () => {
      const serverName = nameInput.value.trim();
      const url = urlInput.value.trim();
      if (!serverName || !url) return;
      connectBtn.disabled = true;
      connectBtn.textContent = '连接中…';

      const connId = 'flow-mcp:' + serverName;
      const conn = await window.vibeyard.mcp.connect(connId, url);
      if (!conn.success) {
        connectBtn.textContent = '连接失败，点击重试';
        connectBtn.disabled = false;
        return;
      }

      if (this.current) {
        this.current.config.skill = {
          ...(this.current.config.skill as SkillRef),
          serverName,
        };
        this.pushUpdate();
      }
      this.upsertServer(serverName, url);

      const toolsRes = await window.vibeyard.mcp.listTools(connId);
      this.tools = toolsRes.success
        ? (toolsRes.data as Array<{ name: string }>).map((t) => t.name)
        : [];
      this.fillToolSelect(skill.toolName);
      connectBtn.textContent = '已连接，可重新加载';
      connectBtn.disabled = false;
    });

    const toolField = document.createElement('div');
    toolField.className = 'flow-field';
    const toolLabel = document.createElement('label');
    toolLabel.className = 'flow-field__label';
    toolLabel.textContent = 'Tool（工具）';
    this.toolSelect = document.createElement('select');
    this.toolSelect.className = 'flow-select';
    this.fillToolSelect(skill.toolName);
    this.toolSelect.addEventListener('change', () => {
      if (!this.current?.config.skill) return;
      this.current.config.skill = {
        ...(this.current.config.skill as SkillRef),
        toolName: this.toolSelect?.value ?? '',
      };
      this.pushUpdate();
    });
    toolField.appendChild(toolLabel);
    toolField.appendChild(this.toolSelect);

    this.root.appendChild(nameField);
    this.root.appendChild(urlField);
    this.root.appendChild(connectBtn);
    this.root.appendChild(toolField);
  }

  private fillToolSelect(selected: string): void {
    if (!this.toolSelect) return;
    this.toolSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = this.tools.length ? '请选择工具' : '请先连接加载工具';
    this.toolSelect.appendChild(placeholder);
    for (const name of this.tools) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      this.toolSelect.appendChild(opt);
    }
    if (selected && this.tools.includes(selected)) {
      this.toolSelect.value = selected;
    }
  }

  private buildPromptField(): void {
    const field = document.createElement('div');
    field.className = 'flow-field';
    const label = document.createElement('label');
    label.className = 'flow-field__label';
    label.textContent = '提示词';
    const textarea = document.createElement('textarea');
    textarea.className = 'flow-textarea';
    textarea.value = this.current?.config.prompt ?? '';
    textarea.placeholder = '描述该节点要执行的任务，可使用变量 {{nodeId.key}}';
    textarea.addEventListener('input', () => {
      if (this.current) {
        this.current.config.prompt = textarea.value;
        this.pushUpdate();
      }
    });

    const hint = document.createElement('div');
    hint.className = 'flow-hint';
    hint.style.marginTop = '5px';
    hint.textContent = '可引用上游输出，格式 {{节点ID.字段名}}；单占位符保留原始类型。';

    field.appendChild(label);
    field.appendChild(textarea);
    field.appendChild(hint);
    this.root.appendChild(field);
  }
}
