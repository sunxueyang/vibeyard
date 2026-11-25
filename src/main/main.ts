import { app, BrowserWindow, dialog, powerMonitor, shell } from 'electron';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { registerIpcHandlers, resetHookWatcher, getCtlServer } from './ipc-handlers';
import { installCtlScript } from './ctl-script';
import { stripInheritedCtlEnv } from './ctl-tokens';
import { killAllPtys } from './pty-manager';
import { flushState, loadState } from './store';
import { flushContentCache } from './content-cache';
import { createAppMenu } from './menu';
import { restartAndResync } from './hook-status';
import { initProviders, getAllProviders } from './providers/registry';
import { validateBinaryExistsAsync } from './providers/resolve-binary';
import { initAutoUpdater } from './auto-updater';
import { stopGitWatcher } from './git-watcher';
import { stopAllFileWatchers } from './file-watcher';
import { checkPythonAvailable } from './prerequisites';
import { isMac } from './platform';
import { isCloseConfirmed, setCloseConfirmed } from './close-state';
import { isHttpUrl } from '../shared/url';

// Before anything spawns: never pass a parent Vibeyard tab's ctl identity on.
stripInheritedCtlEnv();

// Chromium's native window occlusion detection can misreport this window as
// hidden on this machine, which stops frame presentation and leaves a white
// window even though the renderer is healthy. Disable it before app ready so
// the page stays visible regardless of how the app is launched.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

let mainWindow: BrowserWindow | null = null;

function requestConfirmClose(): void {
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) {
    win.webContents.send('app:confirmClose');
  } else {
    setCloseConfirmed(true);
    app.quit();
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    title: 'Vibeyard',
    icon: path.join(__dirname, '..', '..', '..', 'build', 'icon.png'),
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload', 'preload', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // needed for node-pty IPC
      webviewTag: true, // needed for browser-tab sessions
    },
  });

  const indexPath = path.join(__dirname, '..', '..', 'renderer', 'index.html');
  mainWindow.loadFile(indexPath);

  // Open external links in default browser instead of inside the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // The app document is the ONLY navigation target we ever allow. A stray anchor
  // in rendered content (e.g. a relative `.md` link in the file reader) resolves
  // against this file:// document and would otherwise navigate the window away
  // from index.html, destroying every session, PTY and layout binding with it.
  // Compared on the decoded pathname so percent-encoding differences between
  // Electron's own loadFile URL and pathToFileURL never cause a false block.
  const appPathname = decodeURIComponent(pathToFileURL(indexPath).pathname);
  const isAppUrl = (url: string): boolean => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'file:' && decodeURIComponent(parsed.pathname) === appPathname;
    } catch {
      return false;
    }
  };

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return;
    event.preventDefault();
    if (isHttpUrl(url)) shell.openExternal(url);
  });

  // vibeyard-ctl requests are relayed to the page, so the server must know when
  // that page goes away. A load start may still be cancelled (the will-navigate
  // guard above blocks most navigations), so it only holds new requests. Once a
  // new document commits or the renderer dies, the old page can never answer,
  // so in-flight requests are failed at once instead of waiting out the
  // client's timeout. A load that stops without committing left the old page in
  // place, so held requests are released to it; a real reload re-runs
  // initCtlBridge, which sends ctl:rendererReady itself.
  let navigatedSinceLoadStart = false;
  mainWindow.webContents.on('did-start-loading', () => {
    navigatedSinceLoadStart = false;
    getCtlServer()?.onRendererGone();
  });
  mainWindow.webContents.on('did-navigate', () => {
    navigatedSinceLoadStart = true;
    getCtlServer()?.failPending();
    getCtlServer()?.onRendererGone();
  });
  mainWindow.webContents.on('render-process-gone', () => {
    getCtlServer()?.failPending();
    getCtlServer()?.onRendererGone();
  });
  mainWindow.webContents.on('did-stop-loading', () => {
    if (!navigatedSinceLoadStart) getCtlServer()?.onRendererReady();
  });

  mainWindow.on('close', (event) => {
    if (!isCloseConfirmed()) {
      event.preventDefault();
      requestConfirmClose();
      return;
    }
    flushState();
    flushContentCache();
  });

  mainWindow.on('closed', () => {
    getCtlServer()?.failPending();
    getCtlServer()?.onRendererGone();
    killAllPtys();
    resetHookWatcher();
    stopAllFileWatchers();
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  initProviders();

  // Show the window first. The heavy work that used to run here — blocking
  // `where`/`npm` subprocess probes for each provider and hook installation —
  // now happens in initializeBackground() after the window is visible, so the
  // app paints immediately instead of hanging with a "not responding" ghost.
  registerIpcHandlers();
  const state = loadState();
  createAppMenu(state.preferences?.debugMode ?? false);
  createWindow();

  void initializeBackground();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) {
        restartAndResync(win);
      }
    }
  });

  powerMonitor.on('resume', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
      restartAndResync(win);
    }
  });
});

/**
 * Non-blocking post-window initialization. Provider binary probes run in
 * parallel as awaited child processes (never on the main thread), and hook
 * installation is deferred until the renderer is ready to host any dialog.
 */
async function initializeBackground(): Promise<void> {
  // Validate every provider in parallel. Each check uses async subprocesses,
  // so a missing provider no longer freezes the main thread for its timeout.
  const checks = await Promise.all(
    getAllProviders().map(async (provider) => ({
      provider,
      ok: await validateBinaryExistsAsync(provider.meta.binaryName),
    })),
  );
  const available = checks.filter((c) => c.ok).map((c) => c.provider);
  for (const c of checks) {
    if (!c.ok) console.warn(`Provider "${c.provider.meta.displayName}" not available`);
  }

  if (available.length === 0) {
    const bullets = getAllProviders().map((p) => `  • ${p.meta.displayName}`).join('\n');
    dialog.showErrorBox(
      'Vibeyard — No CLI Provider Found',
      `Vibeyard needs at least one supported CLI provider installed to run.\n\n` +
        `Install one of the following, then restart Vibeyard:\n\n${bullets}`,
    );
    app.quit();
    return;
  }

  // Install hooks and status scripts for the available providers. guardedInstall
  // itself waits for the renderer only when a conflict modal is required.
  for (const provider of available) {
    try {
      await provider.installHooks(mainWindow);
      provider.installStatusScripts();
    } catch (err) {
      console.warn(`Failed to install hooks for ${provider.meta.displayName}`, err);
    }
  }

  // Warn if Python is missing on Windows (hooks depend on it).
  const pythonWarning = checkPythonAvailable();
  if (pythonWarning && mainWindow && !mainWindow.isDestroyed()) {
    console.warn(pythonWarning);
    dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Vibeyard — Python Not Found',
      message: pythonWarning,
    });
  }

  try { installCtlScript(); } catch (err) { console.warn('Failed to install vibeyard-ctl:', err); }

  initAutoUpdater();
}

app.on('before-quit', (event) => {
  if (!isCloseConfirmed()) {
    event.preventDefault();
    requestConfirmClose();
    return;
  }
  flushState();
  flushContentCache();
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) {
    win.webContents.send('app:quitting');
  }
  killAllPtys();
  getCtlServer()?.stop();
  stopGitWatcher();
  stopAllFileWatchers();
  // Cleanup all providers
  for (const provider of getAllProviders()) {
    provider.cleanup();
  }
});

app.on('window-all-closed', () => {
  if (!isMac) {
    app.quit();
  }
});
