import type { StatsCache } from '../../../types.js';
import { esc } from '../../../dom-utils.js';
import { formatTokens } from '../../../session-cost.js';
import type { WidgetFactory } from './widget-host.js';

const NO_DATA_MESSAGE = '未找到使用数据，统计由 Claude Code CLI 生成。';

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function prettyModelName(raw: string): string {
  const stripped = raw.replace(/^claude-/, '').replace(/-\d{8,}$/, '');
  const parts = stripped.split('-');
  const family = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  const version = parts.slice(1).join('.');
  return version ? `${family} ${version}` : family;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function shortDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short' });
}

function renderStats(container: HTMLElement, stats: StatsCache): void {
  const summary = document.createElement('div');
  summary.className = 'usage-summary';

  const cards: { value: string; label: string }[] = [
    { value: formatNumber(stats.totalSessions), label: '会话总数' },
    { value: formatNumber(stats.totalMessages), label: '消息总数' },
    { value: formatDate(stats.firstSessionDate), label: '开始使用时间' },
    { value: stats.lastComputedDate, label: '最近更新时间' },
  ];

  for (const card of cards) {
    const el = document.createElement('div');
    el.className = 'usage-stat-card';
    el.innerHTML = `<div class="usage-stat-value">${esc(card.value)}</div><div class="usage-stat-label">${esc(card.label)}</div>`;
    summary.appendChild(el);
  }
  container.appendChild(summary);

  const recent = stats.dailyActivity.slice(-7);
  if (recent.length > 0) {
    const sectionTitle = document.createElement('div');
    sectionTitle.className = 'usage-section-title';
    sectionTitle.textContent = '最近 7 天';
    container.appendChild(sectionTitle);

    const maxMsg = Math.max(...recent.map(d => d.messageCount), 1);

    const chart = document.createElement('div');
    chart.className = 'usage-activity-chart';
    for (const day of recent) {
      const bar = document.createElement('div');
      bar.className = 'usage-activity-bar';
      const pct = (day.messageCount / maxMsg) * 100;
      bar.style.height = `${Math.max(pct, 3)}%`;
      bar.title = `${day.date}：${formatNumber(day.messageCount)} 条消息、${formatNumber(day.sessionCount)} 个会话`;
      chart.appendChild(bar);
    }
    container.appendChild(chart);

    const labels = document.createElement('div');
    labels.className = 'usage-activity-labels';
    for (const day of recent) {
      const span = document.createElement('span');
      span.textContent = shortDay(day.date);
      labels.appendChild(span);
    }
    container.appendChild(labels);
  }

  const modelEntries = Object.entries(stats.modelUsage);
  if (modelEntries.length > 0) {
    const sectionTitle = document.createElement('div');
    sectionTitle.className = 'usage-section-title';
    sectionTitle.textContent = '模型使用情况';
    container.appendChild(sectionTitle);

    for (const [model, usage] of modelEntries) {
      const row = document.createElement('div');
      row.className = 'usage-model-row';

      const totalTokens = usage.inputTokens + usage.outputTokens;
      const cacheTokens = usage.cacheReadInputTokens + usage.cacheCreationInputTokens;

      const name = document.createElement('span');
      name.className = 'usage-model-name';
      name.textContent = prettyModelName(model);

      const tokens = document.createElement('span');
      tokens.className = 'usage-model-tokens';
      tokens.textContent = `${formatTokens(totalTokens)} tokens · ${formatTokens(cacheTokens)} 缓存`;

      row.appendChild(name);
      row.appendChild(tokens);
      container.appendChild(row);
    }
  }

  const hourEntries = Object.entries(stats.hourCounts);
  if (hourEntries.length > 0) {
    const sectionTitle = document.createElement('div');
    sectionTitle.className = 'usage-section-title';
    sectionTitle.textContent = '各时段活动';
    container.appendChild(sectionTitle);

    const maxCount = Math.max(...Object.values(stats.hourCounts), 1);

    const heatmap = document.createElement('div');
    heatmap.className = 'usage-hour-heatmap';
    for (let h = 0; h < 24; h++) {
      const cell = document.createElement('div');
      cell.className = 'usage-hour-cell';
      const count = stats.hourCounts[String(h)] || 0;
      const intensity = count / maxCount;
      cell.style.opacity = String(Math.max(0.08, intensity));
      cell.title = `${h}:00 — ${formatNumber(count)} 个会话`;
      heatmap.appendChild(cell);
    }
    container.appendChild(heatmap);

    const hourLabels = document.createElement('div');
    hourLabels.className = 'usage-hour-labels';
    hourLabels.innerHTML = '<span>12a</span><span>6a</span><span>12p</span><span>6p</span><span>12a</span>';
    container.appendChild(hourLabels);
  }
}

function renderEmpty(container: HTMLElement, message: string): void {
  const empty = document.createElement('div');
  empty.className = 'widget-empty';
  empty.textContent = message;
  container.appendChild(empty);
}

export const createUsageStatsWidget: WidgetFactory = () => {
  const root = document.createElement('div');
  root.className = 'widget-usage-stats';

  let destroyed = false;

  async function render(): Promise<void> {
    root.innerHTML = '';
    renderEmpty(root, '加载中…');

    let stats: StatsCache | null = null;
    try {
      stats = await window.vibeyard.stats.getCache();
    } catch {
      stats = null;
    }
    if (destroyed) return;

    root.innerHTML = '';
    if (stats) {
      renderStats(root, stats);
    } else {
      renderEmpty(root, NO_DATA_MESSAGE);
    }
  }

  render();

  return {
    element: root,
    destroy() {
      destroyed = true;
    },
    refresh() {
      render();
    },
  };
};
