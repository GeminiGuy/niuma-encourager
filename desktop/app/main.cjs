'use strict';

const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, protocol, screen, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const origin = 'niuma://desktop';
const mac = process.platform === 'darwin';
const uiRoot = path.join(__dirname, 'ui');
const assets = path.join(__dirname, 'assets');
const compactSize = { width: 338, height: 210 };
const regularMinimum = { width: 360, height: 380 };
const security = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; base-uri 'none'; form-action 'none'";
const preferences = { pinned: false, compact: false, bounds: null };
let window;
let tray;
let quitting = false;
let resizing = false;
let saveTimer;
let preferencesFile;

app.setName('牛马鼓励器');
protocol.registerSchemesAsPrivileged([
  { scheme: 'niuma', privileges: { standard: true, secure: true } }
]);

function readPreferences() {
  preferencesFile = path.join(app.getPath('userData'), 'window.json');
  try {
    const saved = JSON.parse(fs.readFileSync(preferencesFile, 'utf8'));
    preferences.pinned = saved.pinned === true;
    preferences.compact = saved.compact === true;
    if (saved.bounds && ['x', 'y', 'width', 'height'].every(key => Number.isInteger(saved.bounds[key]))) {
      preferences.bounds = saved.bounds;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('Unable to restore window preferences:', error.message);
  }
}

function savePreferences() {
  clearTimeout(saveTimer);
  if (!preferencesFile) return;
  const temp = preferencesFile + '.tmp';
  try {
    fs.writeFileSync(temp, JSON.stringify(preferences), { mode: 0o600 });
    fs.renameSync(temp, preferencesFile);
  } catch (error) {
    console.warn('Unable to save window preferences:', error.message);
  }
}

function clampBounds(bounds) {
  const display = bounds ? screen.getDisplayMatching(bounds) : screen.getPrimaryDisplay();
  const work = display.workArea;
  const width = Math.min(work.width, Math.max(regularMinimum.width, bounds ? bounds.width : 420));
  const height = Math.min(work.height, Math.max(regularMinimum.height, bounds ? bounds.height : 710));
  const x = bounds ? Math.max(work.x, Math.min(bounds.x, work.x + work.width - width)) : work.x + work.width - width - 28;
  const y = bounds ? Math.max(work.y, Math.min(bounds.y, work.y + work.height - height)) : work.y + 28;
  return { x: Math.max(work.x, x), y: Math.max(work.y, y), width, height };
}

function state() {
  return { pinned: preferences.pinned, compact: preferences.compact };
}

function notifyWindow() {
  if (window && !window.isDestroyed()) window.webContents.send('niuma:window-state', state());
  refreshTray();
}

function showWindow() {
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

function toggleWindow() {
  if (window.isVisible() && !window.isMinimized()) window.hide();
  else showWindow();
}

function togglePin() {
  preferences.pinned = !preferences.pinned;
  window.setAlwaysOnTop(preferences.pinned);
  notifyWindow();
  savePreferences();
}

function setCompact(compact) {
  if (compact === preferences.compact) return;
  const current = window.getBounds();
  resizing = true;
  preferences.compact = compact;
  if (compact) {
    preferences.bounds = current;
    window.setMinimumSize(compactSize.width, compactSize.height);
    window.setSize(compactSize.width, compactSize.height);
    window.setResizable(false);
  } else {
    window.setResizable(true);
    window.setMinimumSize(regularMinimum.width, regularMinimum.height);
    window.setBounds(clampBounds({ ...preferences.bounds, x: current.x, y: current.y }));
    preferences.bounds = window.getBounds();
  }
  resizing = false;
  notifyWindow();
  savePreferences();
}

function refreshTray() {
  if (!tray || !window) return;
  const visible = window.isVisible() && !window.isMinimized();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: visible ? '隐藏窗口' : '显示牛马鼓励器', click: toggleWindow },
    { label: '窗口置顶', type: 'checkbox', checked: preferences.pinned, click: togglePin },
    { label: '迷你模式', type: 'checkbox', checked: preferences.compact, click: () => setCompact(!preferences.compact) },
    { type: 'separator' },
    { label: '退出牛马鼓励器', click: () => app.quit() }
  ]));
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(assets, mac ? 'trayTemplate.png' : 'icon.png'));
  if (mac) icon.setTemplateImage(true);
  tray = new Tray(mac ? icon : icon.resize({ width: 20, height: 20 }));
  tray.setToolTip('牛马鼓励器');
  if (!mac) tray.on('click', toggleWindow);
  refreshTray();
}

function configureProtocol() {
  protocol.handle('niuma', async request => {
    const url = new URL(request.url);
    const name = url.pathname.slice(1);
    if (request.method !== 'GET' || url.host !== 'desktop' ||
        !/^[a-zA-Z0-9][a-zA-Z0-9.-]*\.(html|js|css|webp)$/.test(name)) {
      return new Response(null, { status: 404 });
    }
    try {
      const response = await net.fetch(pathToFileURL(path.join(uiRoot, name)).href);
      const headers = new Headers(response.headers);
      headers.set('Content-Security-Policy', security);
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      return new Response(null, { status: 404 });
    }
  });
}

function createWindow() {
  const compact = preferences.compact;
  preferences.compact = false;
  window = new BrowserWindow({
    ...clampBounds(preferences.bounds),
    minWidth: regularMinimum.width,
    minHeight: regularMinimum.height,
    show: false,
    frame: false,
    title: '牛马鼓励器',
    backgroundColor: '#f6f3ec',
    alwaysOnTop: preferences.pinned,
    icon: path.join(assets, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  const contents = window.webContents;
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', event => event.preventDefault());
  contents.session.setPermissionRequestHandler((_contents, _permission, respond) => respond(false));
  contents.session.setPermissionCheckHandler(() => false);
  ipcMain.handle('niuma:window', (event, action) => {
    if (event.sender !== contents || event.senderFrame !== contents.mainFrame ||
        event.senderFrame.url !== origin + '/index.html') return null;
    switch (action) {
      case 'pin': togglePin(); break;
      case 'compact': setCompact(!preferences.compact); break;
      case 'hide': window.hide(); break;
      case 'state': break;
      default: return null;
    }
    return state();
  });
  window.on('close', event => {
    if (quitting) return;
    event.preventDefault();
    window.hide();
  });
  for (const event of ['show', 'hide', 'minimize', 'restore']) window.on(event, refreshTray);
  function rememberBounds() {
    if (resizing || window.isMinimized() || window.isMaximized()) return;
    const current = window.getBounds();
    preferences.bounds = preferences.compact
      ? { ...preferences.bounds, x: current.x, y: current.y }
      : current;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(savePreferences, 250);
  }
  window.on('move', rememberBounds);
  window.on('resize', rememberBounds);
  if (compact) setCompact(true);
  window.once('ready-to-show', showWindow);
  window.loadURL(origin + '/index.html').catch(error => {
    console.error('Unable to load the app window:', error.message);
    window.show();
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (window) showWindow(); });
  app.on('activate', () => { if (window) showWindow(); });
  app.on('before-quit', () => { quitting = true; savePreferences(); });
  app.whenReady().then(() => {
    if (!mac) app.setAppUserModelId('cn.niuma.desktop');
    readPreferences();
    configureProtocol();
    createWindow();
    createTray();
    if (mac) {
      Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }]));
      app.dock.setIcon(nativeImage.createFromPath(path.join(assets, 'icon.png')));
    }
  });
}
