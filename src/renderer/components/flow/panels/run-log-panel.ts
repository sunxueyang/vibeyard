export type LogLevel = 'info' | 'running' | 'success' | 'error';

/** 运行日志容器。 */
export function createLogBody(): HTMLElement {
  const body = document.createElement('div');
  body.className = 'flow-log-body';
  return body;
}

/** 追加一行日志并自动滚动到底部。 */
export function appendLog(body: HTMLElement, level: LogLevel, text: string): void {
  const line = document.createElement('div');
  line.className = `flow-log-line flow-log-line--${level}`;
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });

  const timeEl = document.createElement('span');
  timeEl.className = 'flow-log-line__time';
  timeEl.textContent = time;

  const textEl = document.createElement('span');
  textEl.className = 'flow-log-line__text';
  textEl.textContent = text;

  line.appendChild(timeEl);
  line.appendChild(textEl);
  body.appendChild(line);
  body.scrollTop = body.scrollHeight;
}

export function clearLog(body: HTMLElement): void {
  body.innerHTML = '';
}
