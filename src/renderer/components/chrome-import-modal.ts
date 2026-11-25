import { createModalShell, createModalButton } from './modal-shell.js';
import { bindModalDismiss } from './modal-manager.js';
import { createCustomSelect } from './custom-select.js';
import type { ChromeProfile, ChromeImportProgress, ChromeImportResult } from '../../shared/types.js';

let cleanupFn: (() => void) | null = null;

export async function showChromeImportModal(onClosed?: () => void): Promise<void> {
  cleanupFn?.();
  cleanupFn = null;

  const { overlay, body, actions, titleEl } = createModalShell({
    id: 'chrome-import-overlay',
    title: '从 Chrome 导入 Cookie',
  });
  body.innerHTML = '';
  actions.innerHTML = '';
  titleEl.textContent = '从 Chrome 导入 Cookie';

  const intro = document.createElement('div');
  intro.className = 'chrome-import-intro';
  intro.textContent =
    '从已安装的 Chrome 配置文件导入所有 Cookie，这样内置浏览器启动时即已登录你常用的网站。';
  body.appendChild(intro);

  const profileLabel = document.createElement('div');
  profileLabel.className = 'chrome-import-label';
  profileLabel.textContent = 'Chrome 配置文件';
  body.appendChild(profileLabel);

  const profileSlot = document.createElement('div');
  profileSlot.className = 'chrome-import-profile-slot';
  body.appendChild(profileSlot);

  const note = document.createElement('div');
  note.className = 'chrome-import-note';
  body.appendChild(note);

  const progressBox = document.createElement('div');
  progressBox.className = 'chrome-import-progress';
  progressBox.style.display = 'none';
  body.appendChild(progressBox);

  const statusLine = document.createElement('div');
  statusLine.className = 'chrome-import-status';
  progressBox.appendChild(statusLine);

  const cookiesBar = document.createElement('div');
  cookiesBar.className = 'chrome-import-bar';
  cookiesBar.innerHTML = '<span class="chrome-import-bar-label">Cookie</span><span class="chrome-import-bar-counts">0 / 0</span><div class="chrome-import-bar-track"><div class="chrome-import-bar-fill"></div></div>';
  cookiesBar.style.display = 'none';
  progressBox.appendChild(cookiesBar);

  const cancelBtn = createModalButton('取消', false);
  const importBtn = createModalButton('导入', true);
  actions.appendChild(cancelBtn);
  actions.appendChild(importBtn);

  // Load profiles
  let profiles: ChromeProfile[] = [];
  try {
    profiles = await window.vibeyard.chromeImport.listProfiles();
  } catch (err) {
    note.textContent = `读取 Chrome 配置文件失败：${(err as Error).message}`;
  }

  if (profiles.length === 0) {
    note.textContent = '未找到 Chrome 安装。请安装 Google Chrome 并登录某个配置文件，然后重试。';
    importBtn.disabled = true;
  } else {
    const select = createCustomSelect(
      'chrome-import-profile-select',
      profiles.map((p) => ({ value: p.id, label: p.displayName })),
      profiles[0]!.id,
    );
    profileSlot.appendChild(select.element);

    note.innerHTML =
      '在 macOS 上，系统可能会请求读取 <strong>Chrome Safe Storage</strong> 的权限——出现提示时请点击<em>允许</em>。' +
      '在 Windows 上，使用 Chrome 127+ 应用绑定加密（App-Bound Encryption）的 Cookie 无法导入，将被跳过。';

    importBtn.addEventListener('click', async () => {
      importBtn.disabled = true;
      cancelBtn.disabled = true;

      progressBox.style.display = 'block';
      cookiesBar.style.display = 'flex';
      statusLine.textContent = '正在启动…';

      const unsub = window.vibeyard.chromeImport.onProgress((p: ChromeImportProgress) => {
        if (p.stage === 'starting') statusLine.textContent = '正在读取 Chrome 数据…';
        else if (p.stage === 'copy') statusLine.textContent = '正在复制数据库文件…';
        else if (p.stage === 'cookies') {
          const total = p.total ?? 0;
          const done = p.done ?? 0;
          updateBar(cookiesBar, done, total);
          statusLine.textContent = `正在导入 Cookie… ${done}/${total}`;
        } else if (p.stage === 'done') {
          statusLine.textContent = '完成。';
        } else if (p.stage === 'error') {
          statusLine.textContent = `错误：${p.message || '未知错误'}`;
        }
      });

      let result: ChromeImportResult;
      try {
        result = await window.vibeyard.chromeImport.run({
          profileId: select.getValue(),
        });
      } catch (err) {
        unsub();
        statusLine.textContent = `失败：${(err as Error).message}`;
        cancelBtn.disabled = false;
        cancelBtn.textContent = '关闭';
        return;
      }
      unsub();

      // Replace progress with summary
      progressBox.innerHTML = '';
      const summary = document.createElement('div');
      summary.className = 'chrome-import-summary';
      const lines: string[] = [`已导入 ${result.cookieCount} 个 Cookie`];
      if (result.skippedV11 > 0) lines.push(`已跳过 ${result.skippedV11} 项（Chrome v11 应用绑定加密）`);
      if (result.errors.length > 0) lines.push(`${result.errors.length} 个错误`);
      summary.textContent = lines.join(' · ');
      progressBox.appendChild(summary);

      importBtn.style.display = 'none';
      cancelBtn.disabled = false;
      cancelBtn.textContent = '完成';
    });
  }

  function close() {
    overlay.style.display = 'none';
    cleanupFn?.();
    cleanupFn = null;
    onClosed?.();
  }

  cancelBtn.addEventListener('click', close);
  const teardownDismiss = bindModalDismiss({ overlay, onClose: close });

  cleanupFn = () => {
    teardownDismiss();
  };

  overlay.style.display = 'flex';
}

function updateBar(bar: HTMLElement, done: number, total: number): void {
  const counts = bar.querySelector('.chrome-import-bar-counts');
  if (counts) counts.textContent = `${done} / ${total}`;
  const fill = bar.querySelector<HTMLElement>('.chrome-import-bar-fill');
  if (fill) fill.style.width = total > 0 ? `${Math.min(100, (done / total) * 100)}%` : '0%';
}
