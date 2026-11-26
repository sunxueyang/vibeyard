/**
 * 变量解析：把节点配置里的 {{nodeId.key}} 引用替换为上游节点的实际输出。
 * 运行上下文按节点 id 保存每个节点的输出对象。
 */

export type RunOutputs = Record<string, Record<string, unknown>>;

const TEMPLATE_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

/** 按点路径在节点输出中查找，找不到返回 undefined。 */
export function lookup(expr: string, outputs: RunOutputs): unknown {
  const parts = expr.split('.').map((p) => p.trim()).filter((p) => p.length > 0);
  if (parts.length < 2) return undefined;
  const nodeId = parts[0];
  const node = outputs[nodeId];
  if (!node) return undefined;

  let current: unknown = node;
  for (const key of parts.slice(1)) {
    if (current && typeof current === 'object' && key in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return current;
}

/** 解析字符串内的模板引用；无法解析的占位符原样保留。 */
export function resolveTemplate(input: string, outputs: RunOutputs): string {
  return input.replace(TEMPLATE_RE, (whole, expr: string) => {
    const value = lookup(expr, outputs);
    return value === undefined ? whole : String(value);
  });
}

/**
 * 深度解析任意值：
 * - 字符串整体为单个 {{...}} 时返回原始类型（数字/对象不被强制转字符串）；
 * - 否则按字符串模板解析；
 * - 数组/对象递归处理。
 */
export function resolveValue(value: unknown, outputs: RunOutputs): unknown {
  if (typeof value === 'string') {
    const exact = value.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
    if (exact) {
      const resolved = lookup(exact[1].trim(), outputs);
      return resolved === undefined ? value : resolved;
    }
    return resolveTemplate(value, outputs);
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveValue(item, outputs));
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      result[key] = resolveValue(item, outputs);
    }
    return result;
  }
  return value;
}
