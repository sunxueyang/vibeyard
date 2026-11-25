import { describe, expect, it } from 'vitest';
import { parseAttachments } from './session-attachments';

function assistantLine(blocks: unknown): string {
  return JSON.stringify({ type: 'assistant', message: { content: blocks } });
}

function toolUse(name: string, file_path: string): unknown {
  return { type: 'tool_use', name, input: { file_path } };
}

describe('parseAttachments', () => {
  it('classifies Read files as resources and Write/Edit files as artifacts', () => {
    const content = [
      assistantLine([toolUse('Read', 'D:/work/a.ts')]),
      assistantLine([toolUse('Write', 'D:/work/out.ts')]),
      assistantLine([toolUse('Edit', 'D:/work/edit.ts')]),
    ].join('\n');

    const result = parseAttachments(content);
    expect(result.resources.map((r) => r.path)).toEqual(['D:/work/a.ts']);
    expect(result.artifacts.map((r) => r.path)).toEqual(['D:/work/out.ts', 'D:/work/edit.ts']);
  });

  it('treats a file as an artifact when it is read first and written later', () => {
    const content = [
      assistantLine([toolUse('Read', 'D:/work/f.ts')]),
      assistantLine([toolUse('Write', 'D:/work/f.ts')]),
    ].join('\n');

    const result = parseAttachments(content);
    expect(result.resources).toHaveLength(0);
    expect(result.artifacts.map((r) => r.path)).toEqual(['D:/work/f.ts']);
  });

  it('treats a file as an artifact even when the write happens before the read', () => {
    const content = [
      assistantLine([toolUse('Write', 'D:/work/f.ts')]),
      assistantLine([toolUse('Read', 'D:/work/f.ts')]),
    ].join('\n');

    const result = parseAttachments(content);
    expect(result.resources).toHaveLength(0);
    expect(result.artifacts.map((r) => r.path)).toEqual(['D:/work/f.ts']);
  });

  it('dedupes repeated reads and counts touches', () => {
    const content = [
      assistantLine([toolUse('Read', 'D:/work/a.ts')]),
      assistantLine([toolUse('Read', 'D:/work/a.ts')]),
      assistantLine([toolUse('Read', 'D:/work/b.ts')]),
    ].join('\n');

    const result = parseAttachments(content);
    expect(result.resources.map((r) => r.path)).toEqual(['D:/work/a.ts', 'D:/work/b.ts']);
    expect(result.resources[0].touches).toBe(2);
    expect(result.resources[1].touches).toBe(1);
  });

  it('ignores malformed lines and non-tool_use blocks', () => {
    const content = [
      '{not json',
      assistantLine([{ type: 'text', text: 'hi' }]),
      assistantLine([toolUse('Bash', 'D:/work/script.sh')]),
      '',
    ].join('\n');

    const result = parseAttachments(content);
    expect(result.resources).toHaveLength(0);
    expect(result.artifacts).toHaveLength(0);
  });
});
