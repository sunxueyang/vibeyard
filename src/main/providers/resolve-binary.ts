import * as path from 'path';
import * as os from 'os';
import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import { getFullPath } from '../pty-manager';
import { isWin, whichCmd } from '../platform';
import { fileExists } from '../fs-utils';
import { findBinaryInNvm } from './nvm';

const execAsync = promisify(exec);

const COMMON_BIN_DIRS = isWin
  ? [
      path.join(os.homedir(), 'AppData', 'Roaming', 'npm'),
      path.join(os.homedir(), 'AppData', 'Local', 'Programs'),
      path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'claude'),
      path.join(os.homedir(), '.local', 'bin'),
      path.join(os.homedir(), 'scoop', 'shims'),
      path.join(os.homedir(), '.volta', 'bin'),
      path.join(process.env.ProgramData || 'C:\\ProgramData', 'chocolatey', 'bin'),
    ]
  : [
      '/usr/local/bin',
      '/opt/homebrew/bin',
      path.join(os.homedir(), '.local', 'bin'),
      path.join(os.homedir(), '.npm-global', 'bin'),
    ];

// On Windows, CLI tools installed via npm are .cmd shims
const WIN_EXTENSIONS = ['.cmd', '.exe', '.ps1', ''];

function findBinaryInDir(dir: string, binaryName: string): string | null {
  if (isWin) {
    for (const ext of WIN_EXTENSIONS) {
      const candidate = path.join(dir, binaryName + ext);
      if (fileExists(candidate)) return candidate;
    }
    return null;
  }
  const candidate = path.join(dir, binaryName);
  return fileExists(candidate) ? candidate : null;
}

function whichBinary(binaryName: string, envPath: string): string | null {
  try {
    const resolved = execSync(`${whichCmd} "${binaryName}"`, {
      env: { ...process.env, PATH: envPath },
      encoding: 'utf-8',
      timeout: 3000,
    }).trim();
    // 'where' on Windows may return multiple lines — take the first
    const firstLine = resolved.split(/\r?\n/)[0];
    return firstLine || null;
  } catch {
    return null;
  }
}

// Cached result of `npm prefix -g` (Windows only, avoids repeated subprocess spawns)
let cachedNpmPrefix: string | null | undefined;

function getNpmGlobalPrefix(fullPath: string): string | null {
  if (!isWin) return null;
  if (cachedNpmPrefix !== undefined) return cachedNpmPrefix;
  try {
    cachedNpmPrefix = execSync('npm prefix -g', {
      encoding: 'utf-8', timeout: 5000, windowsHide: true,
      env: { ...process.env, PATH: fullPath },
    }).trim() || null;
  } catch {
    cachedNpmPrefix = null;
  }
  return cachedNpmPrefix;
}

function findViaNpmPrefix(binaryName: string, fullPath: string): string | null {
  const prefix = getNpmGlobalPrefix(fullPath);
  return prefix ? findBinaryInDir(prefix, binaryName) : null;
}

export function resolveBinary(binaryName: string, cache: { path: string | null }): string {
  if (cache.path) return cache.path;

  const fullPath = getFullPath();

  for (const dir of COMMON_BIN_DIRS) {
    const found = findBinaryInDir(dir, binaryName);
    if (found) {
      cache.path = found;
      return found;
    }
  }

  const nvmFound = findBinaryInNvm(binaryName);
  if (nvmFound) {
    cache.path = nvmFound;
    return nvmFound;
  }

  const resolved = whichBinary(binaryName, fullPath);
  if (resolved) {
    cache.path = resolved;
    return resolved;
  }

  const npmFound = findViaNpmPrefix(binaryName, fullPath);
  if (npmFound) { cache.path = npmFound; return npmFound; }

  cache.path = binaryName;
  return binaryName;
}

export function validateBinaryExists(binaryName: string): boolean {
  for (const dir of COMMON_BIN_DIRS) {
    if (findBinaryInDir(dir, binaryName)) return true;
  }

  if (findBinaryInNvm(binaryName)) return true;

  const fullPath = getFullPath();
  if (whichBinary(binaryName, fullPath)) return true;

  if (findViaNpmPrefix(binaryName, fullPath)) return true;

  return false;
}

// --- Async variants: never block the main thread (used during startup). ---

async function whichBinaryAsync(binaryName: string, envPath: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`${whichCmd} "${binaryName}"`, {
      env: { ...process.env, PATH: envPath },
      timeout: 3000,
      windowsHide: true,
    });
    const firstLine = stdout.trim().split(/\r?\n/)[0];
    return firstLine || null;
  } catch {
    return null;
  }
}

async function getNpmGlobalPrefixAsync(fullPath: string): Promise<string | null> {
  if (!isWin) return null;
  // Reuse the sync result if another path already computed it.
  if (cachedNpmPrefix !== undefined) return cachedNpmPrefix;
  try {
    const { stdout } = await execAsync('npm prefix -g', {
      timeout: 5000,
      windowsHide: true,
      env: { ...process.env, PATH: fullPath },
    });
    cachedNpmPrefix = stdout.trim() || null;
  } catch {
    cachedNpmPrefix = null;
  }
  return cachedNpmPrefix;
}

/**
 * Resolve a binary without blocking the main process. Filesystem checks in the
 * common directories are already cheap; the only blocking work in the sync
 * version was the `where`/`which` and `npm prefix` subprocesses, which run as
 * awaited child processes here.
 */
export async function resolveBinaryAsync(
  binaryName: string,
  cache: { path: string | null },
): Promise<string> {
  if (cache.path) return cache.path;

  const fullPath = getFullPath();

  for (const dir of COMMON_BIN_DIRS) {
    const found = findBinaryInDir(dir, binaryName);
    if (found) {
      cache.path = found;
      return found;
    }
  }

  const nvmFound = findBinaryInNvm(binaryName);
  if (nvmFound) {
    cache.path = nvmFound;
    return nvmFound;
  }

  const resolved = await whichBinaryAsync(binaryName, fullPath);
  if (resolved) {
    cache.path = resolved;
    return resolved;
  }

  const prefix = await getNpmGlobalPrefixAsync(fullPath);
  if (prefix) {
    const npmFound = findBinaryInDir(prefix, binaryName);
    if (npmFound) {
      cache.path = npmFound;
      return npmFound;
    }
  }

  cache.path = binaryName;
  return binaryName;
}

/** Non-blocking prerequisite check for startup. */
export async function validateBinaryExistsAsync(binaryName: string): Promise<boolean> {
  for (const dir of COMMON_BIN_DIRS) {
    if (findBinaryInDir(dir, binaryName)) return true;
  }

  if (findBinaryInNvm(binaryName)) return true;

  const fullPath = getFullPath();
  if (await whichBinaryAsync(binaryName, fullPath)) return true;

  const prefix = await getNpmGlobalPrefixAsync(fullPath);
  if (prefix && findBinaryInDir(prefix, binaryName)) return true;

  return false;
}
