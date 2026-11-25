import type { ProviderId, AttachmentItem, SessionAttachments } from '../../shared/types';
import { appState } from '../state.js';

const PAPERCLIP_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>';

interface OverlayHandle {
  destroy(): void;
}

interface AttachOptions {
  root: HTMLElement;
  projectId: string;
  projectPath: string;
  providerId: ProviderId;
  getCliSessionId: () => string | null;
  configDir?: string;
}

function basename(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

function relativeDisplay(projectPath: string, p: string): string {
  const norm = (s: string) => s.replace(/\\/g, '/').replace(/\/+$/, '');
  const base = norm(projectPath);
  const target = norm(p);
  if (target.toLowerCase().startsWith(base.toLowerCase() + '/')) {
    return target.slice(base.length + 1);
  }
  return p;
}

function isImage(p: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|ico|svg)$/i.test(p);
}

export function attachAttachmentOverlay(opts: AttachOptions): OverlayHandle {
  const { root } = opts;

  const toggle = document.createElement('button');
  toggle.className = 'attachment-overlay-toggle';
  toggle.title = '会话资源与产物';
  toggle.innerHTML = PAPERCLIP_SVG;

  const panel = document.createElement('div');
  panel.className = 'attachment-overlay-panel';
  panel.style.display = 'none';

  root.appendChild(panel);
  root.appendChild(toggle);

  let open = false;

  const hide = (): void => {
    open = false;
    panel.style.display = 'none';
    panel.classList.remove('open');
    toggle.classList.remove('active');
  };

  const onDocClick = (e: MouseEvent): void => {
    if (!open) return;
    if (!root.contains(e.target as Node)) hide();
  };
  document.addEventListener('mousedown', onDocClick);

  const renderRow = (item: AttachmentItem): HTMLElement => {
    const row = document.createElement('div');
    row.className = 'attachment-row';
    row.title = item.path;

    const icon = document.createElement('span');
    icon.className = `attachment-row-icon${isImage(item.path) ? ' image' : ''}`;
    icon.textContent = isImage(item.path) ? '🖼' : '📄';

    const text = document.createElement('div');
    text.className = 'attachment-row-text';

    const name = document.createElement('div');
    name.className = 'attachment-row-name';
    name.textContent = basename(item.path);

    const sub = document.createElement('div');
    sub.className = 'attachment-row-sub';
    sub.textContent = relativeDisplay(opts.projectPath, item.path);

    text.appendChild(name);
    text.appendChild(sub);
    row.appendChild(icon);
    row.appendChild(text);

    // Open with the app's own file-reader plugin (handles text/code and images).
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      appState.addFileReaderSession(opts.projectId, item.path);
    });

    return row;
  };

  function renderSection(title: string, items: AttachmentItem[]): void {
    const header = document.createElement('div');
    header.className = 'attachment-section-header';
    header.textContent = `${title} (${items.length})`;
    panel.appendChild(header);
    if (items.length === 0) {
      const none = document.createElement('div');
      none.className = 'attachment-empty';
      none.textContent = '暂无';
      panel.appendChild(none);
      return;
    }
    for (const item of items) panel.appendChild(renderRow(item));
  };

  const load = async (): Promise<void> => {
    panel.innerHTML = '';
    const loading = document.createElement('div');
    loading.className = 'attachment-empty';
    loading.textContent = '加载中…';
    panel.appendChild(loading);

    let data: SessionAttachments;
    try {
      data = await window.vibeyard.session.attachments({
        providerId: opts.providerId,
        cliSessionId: opts.getCliSessionId(),
        projectPath: opts.projectPath,
        configDir: opts.configDir,
      });
    } catch {
      panel.innerHTML = '';
      const failed = document.createElement('div');
      failed.className = 'attachment-empty';
      failed.textContent = '无法加载会话文件';
      panel.appendChild(failed);
      return;
    }

    panel.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'attachment-panel-head';
    const headTitle = document.createElement('span');
    headTitle.textContent = '会话文件';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'attachment-panel-close';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); hide(); });
    head.appendChild(headTitle);
    head.appendChild(closeBtn);
    panel.appendChild(head);

    // Artifacts (what the agent produced) first, then resources (what it read).
    renderSection('产物', data.artifacts);
    renderSection('资源', data.resources);
  };

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    open = !open;
    if (open) {
      panel.style.display = 'flex';
      panel.classList.add('open');
      toggle.classList.add('active');
      void load();
    } else {
      hide();
    }
  });

  return {
    destroy() {
      hide();
      document.removeEventListener('mousedown', onDocClick);
      toggle.remove();
      panel.remove();
    },
  };
}
