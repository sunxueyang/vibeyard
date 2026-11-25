// Join dialog — guest-side UI for joining a shared P2P session.

import { joinRemoteSession } from '../sharing/share-manager.js';
import { appState } from '../state.js';
import { DecryptionError, validatePin } from '../sharing/share-crypto.js';
import { createPinInput } from '../dom-utils.js';
import { bindModalDismiss } from './modal-manager.js';

let activeOverlay: HTMLElement | null = null;
let activeDismiss: (() => void) | null = null;

export function showJoinDialog(): void {
  closeJoinDialog();

  const project = appState.activeProject;
  if (!project) return;

  const overlay = document.createElement('div');
  overlay.className = 'share-overlay';
  activeOverlay = overlay;

  const dialog = document.createElement('div');
  dialog.className = 'share-dialog';

  // Title
  const title = document.createElement('h3');
  title.textContent = '加入远程会话';
  dialog.appendChild(title);

  // Offer input section (PIN + code paste together)
  const offerSection = document.createElement('div');
  offerSection.className = 'share-section';

  const pinLabel = document.createElement('div');
  pinLabel.className = 'share-label';
  pinLabel.textContent = '输入主机提供的 PIN 码';
  offerSection.appendChild(pinLabel);

  const pinInput = createPinInput();
  offerSection.appendChild(pinInput);

  const offerLabel = document.createElement('div');
  offerLabel.className = 'share-label share-label-spaced';
  offerLabel.textContent = '粘贴主机的连接码';
  offerSection.appendChild(offerLabel);

  const offerTextarea = document.createElement('textarea');
  offerTextarea.className = 'share-code';
  offerTextarea.rows = 3;
  offerTextarea.placeholder = '在此粘贴连接码…';
  offerSection.appendChild(offerTextarea);
  dialog.appendChild(offerSection);

  // Status area
  const statusEl = document.createElement('div');
  statusEl.className = 'share-status';
  dialog.appendChild(statusEl);

  // Answer section (hidden initially)
  const answerSection = document.createElement('div');
  answerSection.className = 'share-section hidden';

  const answerLabel = document.createElement('div');
  answerLabel.className = 'share-label';
  answerLabel.textContent = '将此响应码发回给主机';
  answerSection.appendChild(answerLabel);

  const answerTextarea = document.createElement('textarea');
  answerTextarea.className = 'share-code';
  answerTextarea.readOnly = true;
  answerTextarea.rows = 3;
  answerSection.appendChild(answerTextarea);

  const copyAnswerBtn = document.createElement('button');
  copyAnswerBtn.className = 'btn-secondary share-btn';
  copyAnswerBtn.textContent = '复制响应码';
  copyAnswerBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(answerTextarea.value);
    copyAnswerBtn.textContent = '已复制！';
    setTimeout(() => { copyAnswerBtn.textContent = '复制响应码'; }, 1500);
  });
  answerSection.appendChild(copyAnswerBtn);
  dialog.appendChild(answerSection);

  // Action buttons
  const actions = document.createElement('div');
  actions.className = 'share-actions';

  const joinBtn = document.createElement('button');
  joinBtn.className = 'btn-primary share-btn';
  joinBtn.textContent = '加入';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn-secondary share-btn';
  closeBtn.textContent = '取消';
  closeBtn.addEventListener('click', closeJoinDialog);

  actions.appendChild(closeBtn);
  actions.appendChild(joinBtn);
  dialog.appendChild(actions);

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // ESC + overlay background click close the dialog (capture-phase ESC so it
  // works over a focused terminal and never leaks to the PTY).
  activeDismiss = bindModalDismiss({ overlay, onClose: closeJoinDialog });

  // Join flow
  joinBtn.addEventListener('click', async () => {
    const pin = pinInput.value.trim();
    const pinError = validatePin(pin);
    if (pinError) {
      statusEl.textContent = pinError;
      return;
    }
    const offer = offerTextarea.value.trim();
    if (!offer) {
      statusEl.textContent = '请粘贴主机提供的连接码。';
      return;
    }

    joinBtn.disabled = true;
    joinBtn.textContent = '正在连接…';
    statusEl.textContent = '正在生成响应码…';
    offerTextarea.readOnly = true;
    pinInput.readOnly = true;

    try {
      const { answer } = await joinRemoteSession(project.id, offer, pin, closeJoinDialog);

      answerTextarea.value = answer;
      answerSection.classList.remove('hidden');
      statusEl.textContent = '请将响应码发送给主机。对方连接后，会话将显示出来。';

      closeBtn.textContent = '关闭';
    } catch (err) {
      if (err instanceof DecryptionError) {
        statusEl.textContent = '无法解密连接码。请检查 PIN 码后重试。';
      } else {
        statusEl.textContent = `错误：${err instanceof Error ? err.message : '无效的连接码'}`;
      }
      joinBtn.disabled = false;
      joinBtn.textContent = '加入';
      offerTextarea.readOnly = false;
      pinInput.readOnly = false;
    }
  });
}

export function closeJoinDialog(): void {
  if (activeDismiss) {
    activeDismiss();
    activeDismiss = null;
  }
  if (activeOverlay) {
    activeOverlay.remove();
    activeOverlay = null;
  }
}
