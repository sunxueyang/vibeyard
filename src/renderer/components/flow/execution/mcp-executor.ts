import type { FlowMcpServer } from '../../../../shared/flow-types.js';
import type { NodeExecutionInput, NodeExecutionResult, NodeExecutor } from './executor-types.js';

interface McpPayload {
  content?: Array<{ type?: string; text?: string }>;
  isError?: boolean;
}

function extractMcpOutput(data: unknown): NodeExecutionResult {
  const payload = data as McpPayload;
  const texts: string[] = [];
  if (Array.isArray(payload.content)) {
    for (const item of payload.content) {
      if (item.type === 'text' && typeof item.text === 'string') {
        texts.push(item.text);
      }
    }
  }
  const joined = texts.join('\n');
  return {
    success: !payload.isError,
    output: { text: joined, raw: data },
    error: payload.isError ? joined : undefined,
  };
}

/** MCP 执行器：按需连接 server 并调用绑定的 tool。 */
export class McpExecutor implements NodeExecutor {
  constructor(private servers: FlowMcpServer[]) {}

  async execute(input: NodeExecutionInput): Promise<NodeExecutionResult> {
    const skill = input.node.config.skill;
    if (!skill) {
      return { success: false, output: {}, error: '节点未配置 MCP Skill' };
    }

    const server = this.servers.find((s) => s.name === skill.serverName);
    if (!server) {
      return {
        success: false,
        output: {},
        error: `找不到 MCP server「${skill.serverName}」的 URL，请先在配置中连接`,
      };
    }

    const connId = `flow-mcp:${skill.serverName}`;
    const args = { prompt: input.prompt, ...input.inputs };

    let res = await window.vibeyard.mcp.callTool(connId, skill.toolName, args);
    if (!res.success && /not connected/i.test(res.error ?? '')) {
      const conn = await window.vibeyard.mcp.connect(connId, server.url);
      if (!conn.success) {
        return { success: false, output: {}, error: `MCP 连接失败：${conn.error}` };
      }
      res = await window.vibeyard.mcp.callTool(connId, skill.toolName, args);
    }

    if (!res.success) {
      return { success: false, output: {}, error: res.error };
    }
    return extractMcpOutput(res.data);
  }
}
