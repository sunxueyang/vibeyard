import { showAlertBanner, removeAlertBanner } from './alert-banner.js';
import { showStatusLineConflictModal } from './statusline-conflict-modal.js';
import type { SettingsWarningData } from '../../shared/types';

let initialized = false;

export function initSettingsGuard(): void {
  if (initialized) return;
  initialized = true;

  window.vibeyard.settings.onConflictDialog((data) => {
    showStatusLineConflictModal(data.foreignCommand).then((choice) => {
      window.vibeyard.settings.respondConflictDialog(choice);
    });
  });

  window.vibeyard.settings.onWarning((data: SettingsWarningData) => {
    const hasStatusLineIssue = data.statusLine !== 'vibeyard';
    const hasHooksIssue = data.hooks !== 'complete';

    if (!hasStatusLineIssue && !hasHooksIssue) return;

    let message: string;
    if (hasStatusLineIssue && hasHooksIssue) {
      message = 'Claude Code 中缺少 Vibeyard 设置，成本统计和会话活动可能无法正常工作。';
    } else if (hasStatusLineIssue) {
      message = data.statusLine === 'foreign'
        ? '其他工具覆盖了 Vibeyard 的 statusLine 设置，成本统计不可用。'
        : '成本统计不可用——Claude Code 中未配置 Vibeyard 的 statusLine 设置。';
    } else {
      message = 'Claude Code 设置中缺少部分会话追踪钩子，活动追踪可能无法正常工作。';
    }

    showAlertBanner({
      icon: '\u26A0',
      message,
      cta: {
        label: '修复设置',
        onClick: async (btn) => {
          btn.disabled = true;
          btn.textContent = '正在修复…';
          const result = await window.vibeyard.settings.reinstall();
          if (result.success) {
            removeAlertBanner();
          } else {
            btn.disabled = false;
            btn.textContent = '修复设置';
          }
        },
      },
    });
  });
}
