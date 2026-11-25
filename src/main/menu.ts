import { app, Menu, BrowserWindow } from 'electron';
import { isMac, isWin } from './platform';

export function createAppMenu(debugMode = false): void {

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        { role: 'quit' as const },
      ],
    }] : []),
    {
      label: '文件',
      submenu: [
        {
          label: '新建项目',
          accelerator: 'CmdOrCtrl+Shift+P',
          registerAccelerator: false,
          click: () => sendToRenderer('menu:new-project'),
        },
        {
          label: '新建会话',
          accelerator: 'CmdOrCtrl+Shift+N',
          registerAccelerator: false,
          click: () => sendToRenderer('menu:new-session'),
        },
        { type: 'separator' },
        isMac ? {
          label: '关闭会话',
          accelerator: 'CmdOrCtrl+W',
          registerAccelerator: false,
          click: () => sendToRenderer('menu:close-session'),
        } : { role: 'quit' as const },
        ...(isMac ? [{
          label: '关闭窗口',
          accelerator: 'CmdOrCtrl+Shift+W',
          click: () => { BrowserWindow.getFocusedWindow()?.close(); },
        }] : []),
      ],
    },
    {
      label: '编辑',
      // On Windows, role-based items register Ctrl+C/V/X/Z/A as global
      // accelerators which steal keystrokes from xterm.js terminals.
      // Use custom items without accelerators — Chromium still handles
      // these shortcuts natively in regular DOM inputs/textareas.
      submenu: isWin ? [
        { label: '撤销', click: () => focusedContents()?.undo() },
        { label: '重做', click: () => focusedContents()?.redo() },
        { type: 'separator' as const },
        { label: '剪切', click: () => focusedContents()?.cut() },
        { label: '复制', click: () => focusedContents()?.copy() },
        { label: '粘贴', click: () => focusedContents()?.paste() },
        { label: '删除', click: () => focusedContents()?.delete() },
        { label: '全选', click: () => focusedContents()?.selectAll() },
      ] : [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'pasteAndMatchStyle' as const },
        { role: 'delete' as const },
        { role: 'selectAll' as const },
      ],
    },
    {
      label: '视图',
      submenu: [
        {
          label: '切换分屏模式',
          accelerator: 'CmdOrCtrl+\\',
          registerAccelerator: false,
          click: () => sendToRenderer('menu:toggle-split'),
        },
        { type: 'separator' },
        {
          label: '切换会话检查器',
          accelerator: 'CmdOrCtrl+Shift+I',
          registerAccelerator: false,
          click: () => sendToRenderer('menu:toggle-inspector'),
        },
        ...(debugMode ? [
          {
            label: '切换调试面板',
            accelerator: 'CmdOrCtrl+Shift+D',
            registerAccelerator: false,
            click: () => sendToRenderer('menu:toggle-debug'),
          },
          { type: 'separator' as const },
          { role: 'toggleDevTools' as const },
          {
            label: '重新加载主窗口',
            accelerator: 'CmdOrCtrl+Alt+R',
            registerAccelerator: false,
            click: () => BrowserWindow.getFocusedWindow()?.reload(),
          },
        ] : []),
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function focusedContents(): Electron.WebContents | undefined {
  return BrowserWindow.getFocusedWindow()?.webContents;
}

function sendToRenderer(channel: string, ...args: unknown[]): void {
  const win = BrowserWindow.getFocusedWindow();
  if (win) {
    win.webContents.send(channel, ...args);
  }
}
