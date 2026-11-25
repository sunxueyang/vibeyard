import { appState } from '../state.js';
import { createModalShell } from './modal-shell.js';
import { pushModal } from './modal-manager.js';

const STAR_THRESHOLD = 10;
const REPO_URL = 'https://github.com/elirantutia/vibeyard';

let cleanupFn: (() => void) | null = null;

function showStarPromptDialog(): void {
  cleanupFn?.();
  cleanupFn = null;

  const { overlay, body, actions } = createModalShell({
    id: 'star-prompt-overlay',
    title: '喜欢 Vibeyard 吗？',
  });
  body.innerHTML = '';
  actions.innerHTML = '';

  const container = document.createElement('div');
  container.className = 'star-prompt-container';

  const icon = document.createElement('div');
  icon.className = 'star-prompt-icon';
  icon.textContent = '⭐';
  container.appendChild(icon);

  const message = document.createElement('div');
  message.className = 'star-prompt-message';
  message.textContent =
    '如果 Vibeyard 对你有帮助，欢迎在 GitHub 上给它点个 Star，帮助更多人发现这个项目！';
  container.appendChild(message);

  const innerActions = document.createElement('div');
  innerActions.className = 'star-prompt-actions';

  const starBtn = document.createElement('button');
  starBtn.className = 'btn-primary';
  starBtn.textContent = '在 GitHub 上点 Star';
  innerActions.appendChild(starBtn);

  const laterBtn = document.createElement('button');
  laterBtn.className = 'btn-secondary';
  laterBtn.textContent = '以后再说';
  innerActions.appendChild(laterBtn);

  container.appendChild(innerActions);

  const dontAsk = document.createElement('button');
  dontAsk.className = 'star-prompt-dont-ask';
  dontAsk.textContent = '不再询问';
  container.appendChild(dontAsk);

  body.appendChild(container);

  overlay.style.display = '';

  const close = () => {
    overlay.style.display = 'none';
    cleanupFn?.();
    cleanupFn = null;
  };

  const handleStar = () => {
    window.vibeyard.app.openExternal(REPO_URL);
    appState.dismissStarPrompt();
    close();
  };

  const handleDontAsk = () => {
    appState.dismissStarPrompt();
    close();
  };

  const unregisterEsc = pushModal({ onEscape: close });
  starBtn.addEventListener('click', handleStar);
  laterBtn.addEventListener('click', close);
  dontAsk.addEventListener('click', handleDontAsk);

  cleanupFn = () => {
    unregisterEsc();
    starBtn.removeEventListener('click', handleStar);
    laterBtn.removeEventListener('click', close);
    dontAsk.removeEventListener('click', handleDontAsk);
  };
}

export function checkStarPrompt(): void {
  if (appState.starPromptDismissed) return;
  if (appState.appLaunchCount < STAR_THRESHOLD) return;
  showStarPromptDialog();
}
