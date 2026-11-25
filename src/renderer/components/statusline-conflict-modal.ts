import { escapeHtml } from './dom-search-backend.js';
import { pushModal } from './modal-manager.js';

let cleanupFn: (() => void) | null = null;
let pendingResolve: ((choice: 'replace' | 'keep') => void) | null = null;

function getOverlay(): HTMLElement {
  let overlay = document.getElementById('statusline-conflict-overlay');
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'statusline-conflict-overlay';
  overlay.className = 'modal-overlay';
  overlay.style.display = 'none';
  overlay.innerHTML = `
    <div class="modal-box statusline-conflict-box">
      <div class="modal-title">设置冲突</div>
      <div class="modal-body statusline-conflict-body"></div>
      <div class="modal-actions">
        <button id="statusline-conflict-keep" class="btn-secondary">保留现有</button>
        <button id="statusline-conflict-replace" class="btn-primary">替换</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  return overlay;
}

export function showStatusLineConflictModal(foreignCommand: string): Promise<'replace' | 'keep'> {
  // Resolve any previous pending invocation before re-showing
  if (pendingResolve) {
    pendingResolve('keep');
    pendingResolve = null;
  }
  cleanupFn?.();
  cleanupFn = null;

  const overlay = getOverlay();
  const body = overlay.querySelector('.statusline-conflict-body')!;

  body.innerHTML = `
    <p class="statusline-conflict-text">
      Claude Code 已有一个由其他工具配置的 <strong>statusLine</strong> 设置。
    </p>
    <div class="statusline-conflict-command">
      <div class="statusline-conflict-command-label">当前 statusLine</div>
      <code>${escapeHtml(foreignCommand)}</code>
    </div>
    <p class="statusline-conflict-text statusline-conflict-warning">
      Vibeyard 需要自己的 statusLine 来进行成本跟踪与上下文窗口监控。
      如果保留现有设置，这些功能将不可用。
    </p>`;

  overlay.style.display = '';

  return new Promise((resolve) => {
    pendingResolve = resolve;
    const keepBtn = overlay.querySelector('#statusline-conflict-keep') as HTMLButtonElement;
    const replaceBtn = overlay.querySelector('#statusline-conflict-replace') as HTMLButtonElement;

    const close = (choice: 'replace' | 'keep') => {
      overlay.style.display = 'none';
      cleanupFn?.();
      cleanupFn = null;
      pendingResolve = null;
      resolve(choice);
    };

    const handleKeep = () => close('keep');
    const handleReplace = () => close('replace');

    const unregisterEsc = pushModal({ onEscape: handleKeep });
    keepBtn.addEventListener('click', handleKeep);
    replaceBtn.addEventListener('click', handleReplace);

    cleanupFn = () => {
      unregisterEsc();
      keepBtn.removeEventListener('click', handleKeep);
      replaceBtn.removeEventListener('click', handleReplace);
    };

    requestAnimationFrame(() => keepBtn.focus());
  });
}
