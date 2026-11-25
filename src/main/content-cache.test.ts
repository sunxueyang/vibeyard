import { vi, beforeAll, afterAll, beforeEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';

// Point the cache's homedir at a unique real temp directory while keeping the
// rest of the `os` module (and the real fs) intact.
vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  const tempRoot = path.join(actual.tmpdir(), `vib-cache-test-${process.pid}-${Date.now()}`);
  return { ...actual, homedir: () => tempRoot };
});

import {
  getCachedText, putCachedText, getCachedImage, putCachedImage,
  getContentCacheStats, clearContentCache, flushContentCache,
} from './content-cache';

let sourceFile: string;

beforeAll(() => {
  sourceFile = path.join(fs.mkdtempSync(path.join(require('os').tmpdir(), 'vib-src-')), 'sample.txt');
});

afterAll(() => {
  clearContentCache();
});

beforeEach(() => {
  clearContentCache();
});

function writeSource(content: string): { size: number; mtimeMs: number } {
  fs.writeFileSync(sourceFile, content, 'utf-8');
  const s = fs.statSync(sourceFile);
  return { size: s.size, mtimeMs: s.mtimeMs };
}

describe('text cache', () => {
  it('returns null on a cold miss', () => {
    const stat = writeSource('hello');
    expect(getCachedText(sourceFile, stat)).toBeNull();
  });

  it('stores and serves the same content on a hit', () => {
    const stat = writeSource('line one\nline two');
    putCachedText(sourceFile, stat, 'line one\nline two');
    expect(getCachedText(sourceFile, stat)).toBe('line one\nline two');
  });

  it('treats a changed mtime as a miss (stale snapshot)', () => {
    const stat1 = writeSource('version 1');
    putCachedText(sourceFile, stat1, 'version 1');
    // Simulate an edit: same path, new content, later mtime.
    const later = new Date(stat1.mtimeMs + 5000);
    fs.writeFileSync(sourceFile, 'version 2');
    fs.utimesSync(sourceFile, later, later);
    const stat2 = fs.statSync(sourceFile);
    expect(getCachedText(sourceFile, stat2)).toBeNull();
  });
});

describe('image cache', () => {
  it('round-trips an image data URL', () => {
    const imgPath = path.join(path.dirname(sourceFile), 'pic.png');
    // 1x1 PNG bytes
    const bytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
      'base64',
    );
    fs.writeFileSync(imgPath, bytes);
    const stat = fs.statSync(imgPath);
    putCachedImage(imgPath, stat, bytes, 'image/png');
    const got = getCachedImage(imgPath, stat);
    expect(got).not.toBeNull();
    expect(got!.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });
});

describe('stats and clear', () => {
  it('tracks entry count and bytes', () => {
    const stat = writeSource('abcdef');
    putCachedText(sourceFile, stat, 'abcdef');
    flushContentCache();
    const stats = getContentCacheStats();
    expect(stats.entries).toBe(1);
    expect(stats.bytes).toBe(stat.size);
  });

  it('clear removes all entries', () => {
    const stat = writeSource('to be cleared');
    putCachedText(sourceFile, stat, 'to be cleared');
    clearContentCache();
    expect(getContentCacheStats().entries).toBe(0);
    expect(getCachedText(sourceFile, stat)).toBeNull();
  });
});
