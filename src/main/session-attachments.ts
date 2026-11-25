import * as fs from 'fs';
import type { ProviderId, AttachmentKind, AttachmentItem, SessionAttachments } from '../shared/types';
import { getProvider } from './providers/registry';

export type { AttachmentKind, AttachmentItem, SessionAttachments };

const READ_TOOLS = new Set(['Read']);
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

function bump(map: Map<string, AttachmentItem>, filePath: string, kind: AttachmentKind): void {
  const existing = map.get(filePath);
  if (existing) {
    existing.touches += 1;
  } else {
    map.set(filePath, { path: filePath, kind, touches: 1 });
  }
}

interface ToolUseBlock {
  type: string;
  name?: string;
  input?: { file_path?: unknown };
}

/**
 * Pure parser: walk a transcript's JSONL and collect the files the agent read
 * (resources) versus wrote/edited (artifacts). A file that was ever written is
 * classified as an artifact even if it was read first. Order within each list
 * follows first appearance in the transcript.
 */
export function parseAttachments(content: string): SessionAttachments {
  const resources = new Map<string, AttachmentItem>();
  const artifacts = new Map<string, AttachmentItem>();

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    let entry: { type?: string; message?: { content?: unknown } };
    try {
      entry = JSON.parse(line) as typeof entry;
    } catch {
      continue; // partial-write tolerance
    }
    if (entry.type !== 'assistant' || !entry.message?.content) continue;
    const blocks = entry.message.content;
    if (!Array.isArray(blocks)) continue;

    for (const block of blocks as ToolUseBlock[]) {
      if (block.type !== 'tool_use') continue;
      const filePath = block.input?.file_path;
      if (typeof filePath !== 'string' || !filePath) continue;

      if (block.name && WRITE_TOOLS.has(block.name)) {
        resources.delete(filePath);
        bump(artifacts, filePath, 'artifact');
      } else if (block.name && READ_TOOLS.has(block.name)) {
        if (!artifacts.has(filePath)) bump(resources, filePath, 'resource');
      }
    }
  }

  return { resources: [...resources.values()], artifacts: [...artifacts.values()] };
}

/**
 * Locate a session's transcript through its provider and return its parsed
 * attachments. Returns empty lists when the transcript cannot be found yet
 * (e.g. a brand-new session that has not written one).
 */
export async function getSessionAttachments(opts: {
  providerId: ProviderId;
  cliSessionId: string | null;
  projectPath: string;
  configDir?: string;
}): Promise<SessionAttachments> {
  const empty: SessionAttachments = { resources: [], artifacts: [] };
  if (!opts.cliSessionId) return empty;

  const provider = getProvider(opts.providerId);
  if (!provider.getTranscriptPath) return empty;
  const transcriptPath = provider.getTranscriptPath(
    opts.cliSessionId,
    opts.projectPath,
    opts.configDir,
  );
  if (!transcriptPath) return empty;

  try {
    const content = await fs.promises.readFile(transcriptPath, 'utf8');
    return parseAttachments(content);
  } catch {
    return empty;
  }
}
