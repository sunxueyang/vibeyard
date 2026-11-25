// Share dialog — host-side UI for sharing a session via P2P.

import type { ShareMode } from '../../shared/sharing-types.js';
import { shareSession, acceptShareAnswer, endShare } from '../sharing/share-manager.js';
import { isSharing, isConnected } from '../sharing/peer-host.js';
import { validatePin } from '../sharing/share-crypto.js';
import { createPinInput } from '../dom-utils.js';
import { bindModalDismiss } from './modal-manager.js';

let activeOverlay: HTMLElement | null = null;
let activeDismiss: (() => void) | null = null;
let pendingShareSessionId: string | null = null;

export function showShareDialog(sessionId: string): void {
  closeShareDialog();

  const overlay = document.createElement('div');
  overlay.className = 'share-overlay';
  activeOverlay = overlay;

  const dialog = document.createElement('div');
  dialog.className = 'share-dialog';

  let selectedMode: ShareMode = 'readonly';

  // Title
  const title = document.createElement('h3');
  title.textContent = '共享会话';
  dialog.appendChild(title);

  // ── Phase 1: Permission + Disclaimers ──

  const phase1 = document.createElement('div');
  phase1.className = 'share-phase';

  const notice = document.createElement('div');
  notice.className = 'share-notice';
  notice.textContent = '你的完整终端滚动历史将共享给对方。';
  phase1.appendChild(notice);

  const rwWarning = document.createElement('div');
  rwWarning.className = 'share-notice hidden';
  rwWarning.textContent = '读写模式允许对方在你的终端中输入并执行命令。请仅与你信任的人共享。';
  phase1.appendChild(rwWarning);

  const modeSection = document.createElement('div');
  modeSection.className = 'share-section';

  const modeLabel = document.createElement('div');
  modeLabel.className = 'share-label';
  modeLabel.textContent = '访问级别';
  modeSection.appendChild(modeLabel);

  const modeGroup = document.createElement('div');
  modeGroup.className = 'share-radio-group';

  const readonlyRadio = createRadio('share-mode', 'readonly', '只读', true);
  const readwriteRadio = createRadio('share-mode', 'readwrite', '读写', false);
  modeGroup.appendChild(readonlyRadio);
  modeGroup.appendChild(readwriteRadio);
  modeSection.appendChild(modeGroup);

  modeGroup.addEventListener('change', (e) => {
    const value = (e.target as HTMLInputElement).value as ShareMode;
    selectedMode = value;
    rwWarning.classList.toggle('hidden', value !== 'readwrite');
  });

  phase1.appendChild(modeSection);
  dialog.appendChild(phase1);

  // ── Phase 2: PIN + Codes ──

  const phase2 = document.createElement('div');
  phase2.className = 'share-phase hidden';

  const pinSection = document.createElement('div');
  pinSection.className = 'share-section';

  const pinLabel = document.createElement('div');
  pinLabel.className = 'share-label';
  pinLabel.textContent = '选择一个 PIN 码（4–8 位）以共享给对方';

  const pinInput = createPinInput();
  pinSection.appendChild(pinLabel);
  pinSection.appendChild(pinInput);
  phase2.appendChild(pinSection);

  // Offer code (hidden until generated)
  const offerSection = document.createElement('div');
  offerSection.className = 'share-section hidden';

  const offerLabel = document.createElement('div');
  offerLabel.className = 'share-label';
  offerLabel.textContent = '将此连接码发送给对方';
  offerSection.appendChild(offerLabel);

  const offerTextarea = document.createElement('textarea');
  offerTextarea.className = 'share-code';
  offerTextarea.readOnly = true;
  offerTextarea.rows = 3;
  offerSection.appendChild(offerTextarea);

  const copyOfferBtn = document.createElement('button');
  copyOfferBtn.className = 'btn-secondary share-btn';
  copyOfferBtn.textContent = '复制连接码';
  copyOfferBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(offerTextarea.value);
    copyOfferBtn.textContent = '已复制！';
    setTimeout(() => { copyOfferBtn.textContent = '复制连接码'; }, 1500);
  });
  offerSection.appendChild(copyOfferBtn);
  phase2.appendChild(offerSection);

  // Answer code (hidden until offer generated)
  const answerSection = document.createElement('div');
  answerSection.className = 'share-section hidden';

  const answerLabel = document.createElement('div');
  answerLabel.className = 'share-label';
  answerLabel.textContent = '粘贴对方的响应码';
  answerSection.appendChild(answerLabel);

  const answerTextarea = document.createElement('textarea');
  answerTextarea.className = 'share-code';
  answerTextarea.rows = 3;
  answerTextarea.placeholder = '在此粘贴响应码…';
  answerSection.appendChild(answerTextarea);
  phase2.appendChild(answerSection);

  dialog.appendChild(phase2);

  // Status area
  const statusEl = document.createElement('div');
  statusEl.className = 'share-status';
  dialog.appendChild(statusEl);

  // ── Action buttons (always at bottom) ──

  const actions = document.createElement('div');
  actions.className = 'share-actions';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn-secondary share-btn';
  closeBtn.textContent = '取消';
  closeBtn.addEventListener('click', closeShareDialog);

  const backBtn = document.createElement('button');
  backBtn.className = 'btn-secondary share-btn hidden';
  backBtn.textContent = '上一步';

  const nextBtn = document.createElement('button');
  nextBtn.className = 'btn-primary share-btn';
  nextBtn.textContent = '下一步';

  const startBtn = document.createElement('button');
  startBtn.className = 'btn-primary share-btn hidden';
  startBtn.textContent = '开始共享';

  const connectBtn = document.createElement('button');
  connectBtn.className = 'btn-primary share-btn hidden';
  connectBtn.textContent = '连接';
  connectBtn.disabled = true;

  actions.appendChild(closeBtn);
  actions.appendChild(backBtn);
  actions.appendChild(nextBtn);
  actions.appendChild(startBtn);
  actions.appendChild(connectBtn);
  dialog.appendChild(actions);

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // ── Phase navigation ──

  nextBtn.addEventListener('click', () => {
    phase1.classList.add('hidden');
    phase2.classList.remove('hidden');
    nextBtn.classList.add('hidden');
    backBtn.classList.remove('hidden');
    startBtn.classList.remove('hidden');
    pinInput.focus();
  });

  backBtn.addEventListener('click', () => {
    phase2.classList.add('hidden');
    phase1.classList.remove('hidden');
    backBtn.classList.add('hidden');
    startBtn.classList.add('hidden');
    nextBtn.classList.remove('hidden');
    statusEl.textContent = '';
  });

  // Enable 连接 only when answer code is entered
  answerTextarea.addEventListener('input', () => {
    connectBtn.disabled = !answerTextarea.value.trim();
  });

  // 连接 handler (registered once, guarded by disabled state)
  connectBtn.addEventListener('click', async () => {
    const answer = answerTextarea.value.trim();
    if (!answer) return;
    try {
      await acceptShareAnswer(sessionId, answer);
      connectBtn.disabled = true;
      connectBtn.textContent = '正在连接…';
      answerTextarea.readOnly = true;
      statusEl.textContent = '正在建立连接…';
    } catch (err) {
      statusEl.textContent = err instanceof Error ? err.message : '无效的响应码';
    }
  });

  // ── Handle Escape + overlay background click (capture-phase ESC) ──

  activeDismiss = bindModalDismiss({ overlay, onClose: closeShareDialog });

  // ── Start sharing flow ──

  startBtn.addEventListener('click', async () => {
    const pin = pinInput.value.trim();
    const pinError = validatePin(pin);
    if (pinError) {
      statusEl.textContent = pinError;
      return;
    }

    startBtn.disabled = true;
    startBtn.textContent = '正在生成连接码…';
    statusEl.textContent = '正在生成连接码…';

    pendingShareSessionId = sessionId;

    try {
      const { offer, handle } = await shareSession(sessionId, selectedMode, pin);

      pinInput.readOnly = true;
      pinLabel.textContent = '将此 PIN 码告知对方';
      offerTextarea.value = offer;
      offerSection.classList.remove('hidden');
      answerSection.classList.remove('hidden');
      startBtn.classList.add('hidden');
      backBtn.classList.add('hidden');
      connectBtn.classList.remove('hidden');
      statusEl.textContent = '等待对方连接…';

      handle.onConnected(() => {
        closeShareDialog();
      });

      handle.onAuthFailed((reason: string) => {
        statusEl.textContent = `认证失败：${reason}`;
        connectBtn.disabled = false;
        connectBtn.textContent = '连接';
        answerTextarea.value = '';
        answerTextarea.readOnly = false;
      });
    } catch (err) {
      if (pendingShareSessionId && isSharing(pendingShareSessionId)) {
        endShare(pendingShareSessionId);
      }
      pendingShareSessionId = null;
      statusEl.textContent = `错误：${err instanceof Error ? err.message : '未知错误'}`;
      startBtn.disabled = false;
      startBtn.textContent = '开始共享';
    }
  });
}

export function closeShareDialog(): void {
  if (activeDismiss) {
    activeDismiss();
    activeDismiss = null;
  }
  if (activeOverlay) {
    activeOverlay.remove();
    activeOverlay = null;
  }
  if (pendingShareSessionId && isSharing(pendingShareSessionId) && !isConnected(pendingShareSessionId)) {
    endShare(pendingShareSessionId);
  }
  pendingShareSessionId = null;
}

function createRadio(name: string, value: string, labelText: string, checked: boolean): HTMLElement {
  const wrapper = document.createElement('label');
  wrapper.className = 'share-radio-label';
  const input = document.createElement('input');
  input.type = 'radio';
  input.name = name;
  input.value = value;
  input.checked = checked;
  const span = document.createElement('span');
  span.textContent = labelText;
  wrapper.appendChild(input);
  wrapper.appendChild(span);
  return wrapper;
}
