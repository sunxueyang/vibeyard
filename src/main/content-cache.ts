import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

/**
 * Local on-disk content cache for the file-reader.
 *
 * The file-reader previously re-read every file from disk each time a tab was
 * opened, so re-opening a file (or recalling it after switching sessions) paid
 * the full read + decode cost again. This module stores a snapshot of each read
 * file under `~/.vibeyard/content-cache` and serves it instantly as long as the
 * file's size/mtime have not changed. A changed file is treated as a miss and
 * the stale entry is replaced.
 *
 * The cache is deliberately defensive: every public method swallows its own
 * errors and degrades to a cache miss, so a corrupt or half-written cache can
 * never block the real read path.
 */

const CACHE_DIR = path.join(os.homedir(), '.vibeyard', 'content-cache');
const BLOB_DIR = path.join(CACHE_DIR, 'blobs');
const MANIFEST_FILE = path.join(CACHE_DIR, 'manifest.json');

/** Cap the on-disk footprint so a long-running cache cannot grow unbounded. */
const MAX_TOTAL_BYTES = 60 * 1024 * 1024;
const MAX_ENTRIES = 200;

export interface CacheStat {
  size: number;
  mtimeMs: number;
}

interface CacheEntry {
  /** Absolute path of the source file (kept for diagnostics). */
  path: string;
  size: number;
  mtimeMs: number;
  kind: 'text' | 'image';
  /** Blob file name inside BLOB_DIR. */
  blob: string;
  /** MIME for image entries, used to rebuild the data URL. */
  mime?: string;
  cachedAt: number;
  lastAccess: number;
  hits: number;
}

type Manifest = Record<string, CacheEntry>;

let manifest: Manifest | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let totalBytes = 0;

/** Stable, filesystem-safe key for an absolute path. */
function keyFor(filePath: string): string {
  const normalized = process.platform === 'win32' ? filePath.toLowerCase() : filePath;
  return crypto.createHash('sha1').update(normalized).digest('hex');
}

function ensureLoaded(): void {
  if (manifest !== null) return;
  manifest = {};
  try {
    if (fs.existsSync(MANIFEST_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf-8')) as Manifest;
      if (parsed && typeof parsed === 'object') manifest = parsed;
    }
  } catch {
    manifest = {};
  }
  for (const entry of Object.values(manifest)) totalBytes += entry.size;
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flushManifest();
  }, 250);
}

function flushManifest(): void {
  if (manifest === null) return;
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const tmp = MANIFEST_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(manifest), 'utf-8');
    fs.renameSync(tmp, MANIFEST_FILE);
  } catch (err) {
    console.warn('[content-cache] failed to write manifest', err);
  }
}

/** True when the cached snapshot still matches the file on disk. */
function isFresh(entry: CacheEntry, stat: CacheStat): boolean {
  return entry.size === stat.size && Math.trunc(entry.mtimeMs) === Math.trunc(stat.mtimeMs);
}

function lookup(filePath: string, stat: CacheStat): CacheEntry | null {
  ensureLoaded();
  const entry = manifest![keyFor(filePath)];
  if (!entry) return null;
  if (!isFresh(entry, stat)) {
    deleteEntry(keyFor(filePath));
    return null;
  }
  entry.lastAccess = Date.now();
  entry.hits += 1;
  scheduleSave();
  return entry;
}

function deleteEntry(key: string): void {
  if (!manifest) return;
  const entry = manifest[key];
  if (!entry) return;
  totalBytes -= entry.size;
  try {
    fs.rmSync(path.join(BLOB_DIR, entry.blob), { force: true });
  } catch {
    // best-effort
  }
  delete manifest[key];
  scheduleSave();
}

/** Evict least-recently-accessed entries until the caps are satisfied. */
function enforceLimits(): void {
  if (!manifest) return;
  const entries = Object.entries(manifest).sort((a, b) => a[1].lastAccess - b[1].lastAccess);
  let i = 0;
  while ((totalBytes > MAX_TOTAL_BYTES || Object.keys(manifest).length > MAX_ENTRIES) && i < entries.length) {
    deleteEntry(entries[i][0]);
    i += 1;
  }
}

function store(
  filePath: string,
  stat: CacheStat,
  kind: 'text' | 'image',
  payload: Buffer,
  mime?: string,
): void {
  ensureLoaded();
  const key = keyFor(filePath);
  if (manifest![key]) deleteEntry(key);

  const blobName = `${key}${kind === 'image' ? path.extname(filePath) || '.bin' : '.txt'}`;
  try {
    fs.mkdirSync(BLOB_DIR, { recursive: true });
    const tmp = path.join(BLOB_DIR, blobName + '.tmp');
    fs.writeFileSync(tmp, payload);
    fs.renameSync(tmp, path.join(BLOB_DIR, blobName));
  } catch (err) {
    console.warn('[content-cache] failed to write blob', err);
    return;
  }

  const now = Date.now();
  manifest![key] = {
    path: filePath,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    kind,
    blob: blobName,
    mime,
    cachedAt: now,
    lastAccess: now,
    hits: 0,
  };
  totalBytes += stat.size;
  enforceLimits();
  scheduleSave();
}

export function getCachedText(filePath: string, stat: CacheStat): string | null {
  try {
    const entry = lookup(filePath, stat);
    if (!entry || entry.kind !== 'text') return null;
    return fs.readFileSync(path.join(BLOB_DIR, entry.blob), 'utf-8');
  } catch {
    return null;
  }
}

export function putCachedText(filePath: string, stat: CacheStat, content: string): void {
  try {
    store(filePath, stat, 'text', Buffer.from(content, 'utf-8'));
  } catch {
    // caching is best-effort
  }
}

export function getCachedImage(filePath: string, stat: CacheStat): { dataUrl: string } | null {
  try {
    const entry = lookup(filePath, stat);
    if (!entry || entry.kind !== 'image' || !entry.mime) return null;
    const buf = fs.readFileSync(path.join(BLOB_DIR, entry.blob));
    return { dataUrl: `data:${entry.mime};base64,${buf.toString('base64')}` };
  } catch {
    return null;
  }
}

export function putCachedImage(
  filePath: string,
  stat: CacheStat,
  buffer: Buffer,
  mime: string,
): void {
  try {
    store(filePath, stat, 'image', buffer, mime);
  } catch {
    // caching is best-effort
  }
}

export interface ContentCacheStats {
  entries: number;
  bytes: number;
}

export function getContentCacheStats(): ContentCacheStats {
  ensureLoaded();
  return { entries: Object.keys(manifest!).length, bytes: totalBytes };
}

export function clearContentCache(): void {
  ensureLoaded();
  try {
    fs.rmSync(BLOB_DIR, { recursive: true, force: true });
  } catch {
    // best-effort
  }
  manifest = {};
  totalBytes = 0;
  try {
    fs.rmSync(MANIFEST_FILE, { force: true });
  } catch {
    // best-effort
  }
}

/** Persist any pending manifest (call on app shutdown). */
export function flushContentCache(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  flushManifest();
}
