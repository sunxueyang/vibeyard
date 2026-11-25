import { onLargeFileAlert, type LargeFileAlert } from '../tools/large-file-detector.js';
import { dismissInsight } from '../session-insights.js';
import { appState } from '../state.js';
import { showAlertBanner, removeAlertBanner } from './alert-banner.js';
import { setPendingPrompt } from './terminal-pane.js';
import { basename } from '../../shared/platform.js';

export function initLargeFileAlert(): void {
  onLargeFileAlert((alert) => {
    if (appState.activeSession?.id !== alert.sessionId) return;
    requestAnimationFrame(() => showLargeFileBanner(alert));
  });
}

function handleSplitAction(alert: LargeFileAlert): void {
  const project = appState.activeProject;
  if (!project) return;

  const filename = basename(alert.filePath);
  const prompt = `The file ${alert.filePath} is too large and exceeds the AI context read limit. Please analyze it and split it into smaller, focused modules. Preserve all existing functionality.`;

  const session = appState.addPlanSession(project.id, `拆分 ${filename}`);
  if (!session) return;

  removeAlertBanner();

  setPendingPrompt(session.id, prompt);
}

function showLargeFileBanner(alert: LargeFileAlert): void {
  const insightId = `large-file-read:${alert.filePath}`;
  const filename = basename(alert.filePath);

  showAlertBanner({
    className: 'insight-alert-info',
    icon: '\u26A0',
    message: `“${filename}”过大，AI 无法一次性读取。建议将其拆分为更小、职责单一的模块。`,
    cta: {
      label: '在新会话中拆分',
      onClick: () => handleSplitAction(alert),
    },
    onDismiss: () => dismissInsight(alert.projectId, insightId),
  });
}
