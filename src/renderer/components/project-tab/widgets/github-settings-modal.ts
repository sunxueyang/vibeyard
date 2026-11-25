import { createModalShell, createModalButton } from '../../modal-shell.js';
import { bindModalDismiss } from '../../modal-manager.js';
import { createCustomSelect } from '../../custom-select.js';
import type { OverviewWidget } from '../../../../shared/types.js';
import { GITHUB_MAX_PER_PAGE } from '../../../../shared/constants.js';
import type { GithubConfig } from './github-types.js';

const STATE_OPTIONS = [
  { value: 'open', label: '打开' },
  { value: 'closed', label: '关闭' },
  { value: 'all', label: '全部' },
];

const REFRESH_OPTIONS = [
  { value: '60', label: '1 分钟' },
  { value: '300', label: '5 分钟' },
  { value: '900', label: '15 分钟' },
  { value: '1800', label: '30 分钟' },
];

export function showGithubSettings(
  widget: OverviewWidget,
  onSave: (patch: Partial<GithubConfig>) => void,
): void {
  const isPRs = widget.type === 'github-prs';
  const title = isPRs ? '最近 PR 设置' : '最近 Issue 设置';
  const shell = createModalShell({ id: 'github-settings-modal', title });
  shell.body.innerHTML = '';
  shell.actions.innerHTML = '';

  const cfg = (widget.config ?? {}) as Partial<GithubConfig>;
  const current: GithubConfig = {
    repo: cfg.repo ?? '',
    state: cfg.state ?? 'open',
    max: typeof cfg.max === 'number' ? cfg.max : 10,
    refreshSeconds: typeof cfg.refreshSeconds === 'number' ? cfg.refreshSeconds : 300,
  };

  const form = document.createElement('div');
  form.className = 'widget-settings-form';

  // Repo override
  const repoField = document.createElement('div');
  repoField.className = 'widget-settings-field';
  const repoLabel = document.createElement('label');
  repoLabel.textContent = '仓库（owner/name）';
  repoLabel.htmlFor = 'github-settings-repo';
  repoField.appendChild(repoLabel);

  const repoInput = document.createElement('input');
  repoInput.type = 'text';
  repoInput.id = 'github-settings-repo';
  repoInput.placeholder = '从 git 远程自动检测';
  repoInput.value = current.repo ?? '';
  repoField.appendChild(repoInput);

  const repoHelp = document.createElement('div');
  repoHelp.className = 'widget-settings-help';
  repoHelp.textContent = '留空则使用项目的 git origin。';
  repoField.appendChild(repoHelp);

  form.appendChild(repoField);

  // State
  const stateField = document.createElement('div');
  stateField.className = 'widget-settings-field';
  const stateLabel = document.createElement('label');
  stateLabel.textContent = '状态';
  stateField.appendChild(stateLabel);
  const stateSelect = createCustomSelect(
    `github-settings-state-${widget.id}`,
    STATE_OPTIONS,
    current.state,
  );
  stateField.appendChild(stateSelect.element);
  form.appendChild(stateField);

  // Max
  const maxField = document.createElement('div');
  maxField.className = 'widget-settings-field';
  const maxLabel = document.createElement('label');
  maxLabel.textContent = `最多${isPRs ? 'PR' : 'Issue'}数量`;
  maxLabel.htmlFor = 'github-settings-max';
  maxField.appendChild(maxLabel);
  const maxInput = document.createElement('input');
  maxInput.type = 'number';
  maxInput.id = 'github-settings-max';
  maxInput.min = '1';
  maxInput.max = String(GITHUB_MAX_PER_PAGE);
  maxInput.value = String(current.max);
  maxField.appendChild(maxInput);
  form.appendChild(maxField);

  // Refresh interval
  const refreshField = document.createElement('div');
  refreshField.className = 'widget-settings-field';
  const refreshLabel = document.createElement('label');
  refreshLabel.textContent = '自动刷新';
  refreshField.appendChild(refreshLabel);
  const refreshSelect = createCustomSelect(
    `github-settings-refresh-${widget.id}`,
    REFRESH_OPTIONS,
    String(current.refreshSeconds),
  );
  refreshField.appendChild(refreshSelect.element);
  form.appendChild(refreshField);

  shell.body.appendChild(form);

  const cancel = createModalButton('取消', false);
  cancel.addEventListener('click', close);
  shell.actions.appendChild(cancel);

  const save = createModalButton('保存', true);
  save.addEventListener('click', () => {
    const repoRaw = repoInput.value.trim();
    const maxRaw = parseInt(maxInput.value, 10);
    const refreshRaw = parseInt(refreshSelect.getValue(), 10);
    const stateRaw = stateSelect.getValue() as GithubConfig['state'];

    const patch: Partial<GithubConfig> = {
      repo: repoRaw || undefined,
      state: stateRaw,
      max: Math.max(1, Math.min(GITHUB_MAX_PER_PAGE, isNaN(maxRaw) ? 10 : maxRaw)),
      refreshSeconds: isNaN(refreshRaw) ? 300 : refreshRaw,
    };
    onSave(patch);
    close();
  });
  shell.actions.appendChild(save);

  shell.overlay.style.display = 'flex';
  const teardownDismiss = bindModalDismiss({ overlay: shell.overlay, onClose: close });

  function close(): void {
    shell.overlay.style.display = 'none';
    teardownDismiss();
    stateSelect.destroy();
    refreshSelect.destroy();
  }
}
