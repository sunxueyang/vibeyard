export function initUpdateBanner(): void {
  const mainArea = document.getElementById('main-area');
  if (!mainArea) return;

  const banner = document.createElement('div');
  banner.id = 'update-banner';
  banner.className = 'hidden';
  mainArea.prepend(banner);

  const messageSpan = document.createElement('span');
  messageSpan.className = 'update-banner-message';
  banner.appendChild(messageSpan);

  const actionBtn = document.createElement('button');
  actionBtn.className = 'update-banner-btn hidden';
  banner.appendChild(actionBtn);

  function show(msg: string, btn?: { label: string; action: () => void }, autoHideMs?: number): void {
    messageSpan.textContent = msg;
    banner.classList.remove('hidden');

    if (btn) {
      actionBtn.textContent = btn.label;
      actionBtn.onclick = btn.action;
      actionBtn.classList.remove('hidden');
    } else {
      actionBtn.classList.add('hidden');
    }

    if (autoHideMs) {
      setTimeout(() => banner.classList.add('hidden'), autoHideMs);
    }
  }

  let latestVersion = '';

  window.vibeyard.update.onAvailable((info) => {
    latestVersion = info.version;
    show(`正在下载更新 v${info.version}…`);
  });

  window.vibeyard.update.onDownloadProgress((info) => {
    const label = latestVersion ? `v${latestVersion}` : '更新';
    show(`正在下载 ${label}… ${info.percent}%`);
  });

  window.vibeyard.update.onDownloaded((info) => {
    show(`更新 v${info.version} 已就绪。`, {
      label: '重启',
      action: () => window.vibeyard.update.install(),
    });
  });

  window.vibeyard.update.onError(() => {
    // Silently ignore update failures
  });
}
