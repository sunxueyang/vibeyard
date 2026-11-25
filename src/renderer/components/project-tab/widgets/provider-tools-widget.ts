import { appState } from '../../../state.js';
import { openFileReaderChecked } from '../../../open-file-reader.js';
import { showMcpAddModal } from '../../mcp-add-modal.js';
import { createCustomSelect, type CustomSelectInstance } from '../../custom-select.js';
import { esc } from '../../../dom-utils.js';
import {
  getAvailableProviderMetas,
  getProviderAvailabilitySnapshot,
  loadProviderAvailability,
} from '../../../provider-availability.js';
import type { ProviderConfig, ProviderId, McpServer, Agent, Skill, Command } from '../../../types.js';
import type { WidgetFactory, WidgetHost, WidgetInstance } from './widget-host.js';

function scopeBadge(scope: 'user' | 'project'): string {
  const label = scope === 'user' ? '用户' : '项目';
  return `<span class="scope-badge ${scope}">${label}</span>`;
}

export const createProviderToolsWidget: WidgetFactory = (host: WidgetHost): WidgetInstance => {
  const projectId = host.projectId;
  const root = document.createElement('div');
  root.className = 'project-tab-provider-tools widget-provider-tools';

  const toolbar = document.createElement('div');
  toolbar.className = 'widget-provider-tools-toolbar';
  root.appendChild(toolbar);

  const body = document.createElement('div');
  body.className = 'project-tab-tools-body';
  body.innerHTML = '<div class="config-loading">加载中…</div>';
  root.appendChild(body);

  // Per-instance provider selection (don't share across widget instances).
  let selectedProviderId: ProviderId | null = null;
  let providerSelect: CustomSelectInstance | null = null;
  let lastAvailableKey: string | null = null;
  let unsubConfigChanged: (() => void) | null = null;
  let destroyed = false;

  const getActiveProviderId = (): ProviderId => {
    const available = getAvailableProviderMetas().map(p => p.id);
    if (selectedProviderId && available.includes(selectedProviderId)) return selectedProviderId;
    if (available.length > 0) return available[0];
    return 'claude';
  };

  const getProjectPath = (): string | null => {
    const p = appState.projects.find(pr => pr.id === projectId);
    return p?.path ?? null;
  };

  const mcpItem = (server: McpServer, projectPath: string): HTMLElement => {
    const el = document.createElement('div');
    el.className = 'config-item config-item-clickable';
    el.innerHTML = `<span class="config-item-name">${esc(server.name)}</span><span class="config-item-detail">${esc(server.status)}</span>${scopeBadge(server.scope)}`;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'config-item-remove-btn';
    removeBtn.textContent = '×';
    removeBtn.title = '移除服务器';
    removeBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`确定移除 MCP 服务器“${server.name}”吗？`)) return;
      await window.vibeyard.mcp.removeServer(server.name, server.filePath, server.scope, projectPath);
      void refresh();
    });
    el.appendChild(removeBtn);

    el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.config-item-remove-btn')) return;
      openConfigFile(server.filePath);
    });
    return el;
  };

  const agentItem = (agent: Agent): HTMLElement => {
    const el = document.createElement('div');
    el.className = 'config-item config-item-clickable';
    el.innerHTML = `<span class="config-item-name">${esc(agent.name)}</span><span class="config-item-detail">${esc(agent.model)}</span>${scopeBadge(agent.scope)}`;
    el.addEventListener('click', () => openConfigFile(agent.filePath));
    return el;
  };

  const skillItem = (skill: Skill): HTMLElement => {
    const el = document.createElement('div');
    el.className = 'config-item config-item-clickable';
    el.innerHTML = `<span class="config-item-name">${esc(skill.name)}</span><span class="config-item-detail">${esc(skill.description)}</span>${scopeBadge(skill.scope)}`;
    el.addEventListener('click', () => openConfigFile(skill.filePath));
    return el;
  };

  const commandItem = (cmd: Command): HTMLElement => {
    const el = document.createElement('div');
    el.className = 'config-item config-item-clickable';
    el.innerHTML = `<span class="config-item-name">/${esc(cmd.name)}</span><span class="config-item-detail">${esc(cmd.description)}</span>${scopeBadge(cmd.scope)}`;
    el.addEventListener('click', () => openConfigFile(cmd.filePath));
    return el;
  };

  const openConfigFile = (filePath: string) => {
    if (!filePath) return;
    void openFileReaderChecked(projectId, filePath);
  };

  const renderSection = (title: string, items: HTMLElement[], count: number, onAdd?: () => void): HTMLElement => {
    const section = document.createElement('div');
    section.className = 'config-section project-tab-tools-section';

    const sectionHeader = document.createElement('div');
    sectionHeader.className = 'config-section-header';
    sectionHeader.innerHTML = `${esc(title)}<span class="config-section-count">${count}</span>`;

    if (onAdd) {
      const addBtn = document.createElement('button');
      addBtn.className = 'config-section-add-btn';
      addBtn.textContent = '+';
      addBtn.title = `添加${title}`;
      addBtn.addEventListener('click', (e) => { e.stopPropagation(); onAdd(); });
      sectionHeader.appendChild(addBtn);
    }

    const sectionBody = document.createElement('div');
    sectionBody.className = 'config-section-body';

    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'config-empty';
      empty.textContent = '暂未配置';
      sectionBody.appendChild(empty);
    } else {
      items.forEach(el => sectionBody.appendChild(el));
    }

    section.appendChild(sectionHeader);
    section.appendChild(sectionBody);
    return section;
  };

  const destroyProviderSelect = () => {
    if (providerSelect) {
      providerSelect.element.remove();
      providerSelect.destroy();
      providerSelect = null;
    }
  };

  const watchActiveProvider = () => {
    const projectPath = getProjectPath();
    if (!projectPath) return;
    window.vibeyard.provider.watchProject(getActiveProviderId(), projectPath);
  };

  const buildToolbarSelect = () => {
    const available = getAvailableProviderMetas();
    const key = available.map(p => p.id).join(',');
    const wantSelect = available.length > 1;
    if (key === lastAvailableKey && wantSelect === !!providerSelect) return;
    lastAvailableKey = key;

    destroyProviderSelect();

    if (wantSelect) {
      providerSelect = createCustomSelect(
        `widget-provider-select-${host.widgetId}`,
        available.map(p => ({ value: p.id, label: p.displayName })),
        getActiveProviderId(),
        (value) => {
          selectedProviderId = value as ProviderId;
          watchActiveProvider();
          void refresh();
        },
      );
      toolbar.appendChild(providerSelect.element);
    }
  };

  const refresh = async () => {
    if (destroyed) return;

    if (!getProviderAvailabilitySnapshot()) {
      await loadProviderAvailability();
    }
    if (destroyed) return;

    buildToolbarSelect();

    const providerId = getActiveProviderId();
    const projectPath = getProjectPath();
    if (!projectPath) {
      body.innerHTML = '';
      return;
    }

    let config: ProviderConfig;
    try {
      config = await window.vibeyard.provider.getConfig(providerId, projectPath);
    } catch {
      body.innerHTML = '';
      return;
    }
    if (destroyed) return;

    body.innerHTML = '';

    body.appendChild(renderSection(
      'MCP 服务器',
      config.mcpServers.map(s => mcpItem(s, projectPath)),
      config.mcpServers.length,
      providerId === 'claude' ? () => showMcpAddModal(() => void refresh()) : undefined,
    ));

    body.appendChild(renderSection(
      'Agents',
      config.agents.map(agentItem),
      config.agents.length,
    ));

    body.appendChild(renderSection(
      'Skills',
      config.skills.map(skillItem),
      config.skills.length,
    ));

    if (providerId !== 'codex' && providerId !== 'copilot') {
      body.appendChild(renderSection(
        '命令',
        config.commands.map(commandItem),
        config.commands.length,
      ));
    }
  };

  watchActiveProvider();
  void refresh();

  unsubConfigChanged = window.vibeyard.provider.onConfigChanged(() => {
    void refresh();
  });

  return {
    element: root,
    destroy() {
      destroyed = true;
      destroyProviderSelect();
      unsubConfigChanged?.();
      unsubConfigChanged = null;
    },
    refresh() {
      void refresh();
    },
  };
};
