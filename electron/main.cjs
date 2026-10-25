const { app, BrowserWindow, ipcMain, protocol, net, session, dialog, safeStorage } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { executeRequest } = require('./request-service.cjs');
const { openDatabase } = require('./database.cjs');
const { listCollections, createCollection } = require('./collections-service.cjs');
const { createSecureStorage } = require('./secure-storage.cjs');
const { createSavedRequestsService } = require('./saved-requests-service.cjs');
const { createHistoryService } = require('./history-service.cjs');
const { createRequestRunner } = require('./request-runner.cjs');
const { createComparisonService } = require('./comparison-service.cjs');

const APP_URL = 'reqdelta://app/index.html';
const DEV_URL = !app.isPackaged && process.env.REQDELTA_DEV_URL;
let mainWindow;
let database;

function isTrustedSender(event) {
  return event.sender === mainWindow?.webContents
    && event.senderFrame === event.sender.mainFrame
    && event.senderFrame?.url === (DEV_URL || APP_URL);
}

const forbidden = () => ({ ok: false, error: { code: 'FORBIDDEN', message: 'Request sender was not accepted.' } });

// Register before Electron is ready so our local app has a normal, secure origin.
protocol.registerSchemesAsPrivileged([
  { scheme: 'reqdelta', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function registerAppProtocol() {
  const root = path.join(__dirname, '..', 'dist');
  protocol.handle('reqdelta', (request) => {
    const url = new URL(request.url);
    let filename;
    try {
      filename = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
    } catch {
      return new Response('Invalid path', { status: 400 });
    }
    const relative = path.relative(root, filename);
    if (url.host !== 'app' || request.method !== 'GET' || relative.startsWith('..') || path.isAbsolute(relative)) {
      return new Response('Forbidden', { status: 403 });
    }
    return net.fetch(pathToFileURL(filename).href);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'ReqDelta',
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 680,
    backgroundColor: '#f6f7f3',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 20, y: 21 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Responses are data, never pages to navigate to or execute.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadURL(DEV_URL || APP_URL);
}

app.setName('ReqDelta');
app.whenReady().then(() => {
  if (DEV_URL && DEV_URL !== 'http://127.0.0.1:5173/') {
    throw new Error('Unexpected development server URL.');
  }
  try {
    // Desktop checks launch with a separate profile, including its database.
    const profile = !app.isPackaged && app.commandLine.getSwitchValue('user-data-dir');
    if (profile) app.setPath('userData', path.resolve(profile));
    database = openDatabase(path.join(app.getPath('userData'), 'reqdelta.sqlite'));
  } catch (error) {
    dialog.showErrorBox('Could not open local workspace', `ReqDelta could not open its database.\n\n${error.message}`);
    app.quit();
    return;
  }
  registerAppProtocol();
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);

  // Each bridge function gets one specific channel, never arbitrary IPC access.
  const secureStorage = createSecureStorage(safeStorage);
  const history = createHistoryService(database, secureStorage);
  const runRequest = createRequestRunner(executeRequest, history);
  ipcMain.handle('requests:send', (event, request) => {
    if (!isTrustedSender(event)) return forbidden();
    return runRequest(request);
  });
  ipcMain.handle('collections:list', (event) => {
    if (!isTrustedSender(event)) return forbidden();
    return listCollections(database);
  });
  ipcMain.handle('collections:create', (event, input) => {
    if (!isTrustedSender(event)) return forbidden();
    return createCollection(database, input);
  });
  const savedRequests = createSavedRequestsService(database, secureStorage);
  ipcMain.handle('saved-requests:create', (event, input) => {
    if (!isTrustedSender(event)) return forbidden();
    return savedRequests.create(input);
  });
  ipcMain.handle('saved-requests:list', (event, input) => {
    if (!isTrustedSender(event)) return forbidden();
    return savedRequests.list(input);
  });
  ipcMain.handle('saved-requests:get', (event, input) => {
    if (!isTrustedSender(event)) return forbidden();
    return savedRequests.get(input);
  });
  ipcMain.handle('history:list', (event, input) => {
    if (!isTrustedSender(event)) return forbidden();
    return history.list(input);
  });
  ipcMain.handle('history:get', (event, input) => {
    if (!isTrustedSender(event)) return forbidden();
    return history.get(input);
  });
  const comparison = createComparisonService(history);
  ipcMain.handle('history:compare', (event, input) => {
    if (!isTrustedSender(event)) return forbidden();
    return comparison.compare(input);
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  database?.close();
});
