/**
 * Centralized platform detection and derived constants.
 *
 * Import `isWin`/`isMac`/`isLinux` from here instead of inlining
 * `process.platform === 'win32'` or redefining isWin locally. Keep
 * platform-conditional logic discoverable and prevents drift across modules.
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export const isWin = process.platform === 'win32';
export const isMac = process.platform === 'darwin';
export const isLinux = process.platform === 'linux';

/** PATH environment variable separator. */
export const pathSep = isWin ? ';' : ':';

/** Command used to resolve a binary on PATH. */
export const whichCmd = isWin ? 'where' : 'which';

/**
 * Locale vars that force a UTF-8 charset on spawned children. `LC_CTYPE=UTF-8`
 * is what Terminal.app sets when it can't map the region; `C.UTF-8` is always
 * present on glibc >= 2.27. Empty on Windows, which is not locale-env driven.
 */
export const utf8LocaleEnv: Record<string, string> =
  isWin ? {} : isMac ? { LC_CTYPE: 'UTF-8' } : { LANG: 'C.UTF-8' };

/**
 * Probe a candidate interpreter and return it only if `--version` exits 0.
 * `cmd` may be a bare name (resolved via PATH) or an absolute executable path.
 */
function probeCandidate(cmd: string, args: string[]): boolean {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf-8', timeout: 3000, stdio: 'pipe' });
    return r.status === 0;
  } catch {
    return false;
  }
}

/**
 * Locate a usable Python interpreter on Windows.
 *
 * The app's hook scripts and the startup prerequisite check both need Python.
 * A bare `python` on PATH is the common case, but Windows installs sometimes
 * register only the `py` launcher, or expose Python under a per-user directory
 * that is missing from a stripped-down process PATH (e.g. an app launched
 * through a remote/tool host). We therefore fall back through:
 *   1. `python` on PATH
 *   2. `py -3` (Python launcher)
 *   3. well-known per-user and system install locations
 *
 * Returns the resolved command string, or null when nothing runs.
 */
function resolveWinPython(): string | null {
  if (probeCandidate('python', ['--version'])) return 'python';
  if (probeCandidate('py', ['-3', '--version'])) return 'py -3';

  const home = os.homedir();
  const absoluteCandidates = [
    path.join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python313', 'python.exe'),
    path.join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python312', 'python.exe'),
    path.join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python311', 'python.exe'),
    path.join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python310', 'python.exe'),
    'C:\\Program Files\\Python313\\python.exe',
    'C:\\Program Files\\Python312\\python.exe',
    'C:\\Program Files\\Python311\\python.exe',
    'C:\\Python313\\python.exe',
    'C:\\Python312\\python.exe',
    'C:\\Python311\\python.exe',
  ];

  for (const exe of absoluteCandidates) {
    if (fs.existsSync(exe) && probeCandidate(exe, ['--version'])) return exe;
  }

  return null;
}

const resolvedWinPython = isWin ? resolveWinPython() : null;

/**
 * Python interpreter used by hook scripts. On Windows this is the first
 * candidate that actually runs; falls back to the bare `python` name when no
 * interpreter could be probed (preserving the original behavior/message).
 */
export const pythonBin: string = isWin
  ? (resolvedWinPython ?? 'python')
  : '/usr/bin/python3';

/**
 * Whether a runnable Python interpreter was located. Non-Windows platforms
 * are assumed available (the POSIX default is `/usr/bin/python3`).
 */
export const pythonAvailable: boolean = !isWin || resolvedWinPython !== null;
