// Electron shell for the desktop build — loads the same hosted web app (Vercel +
// Supabase Cloud) inside a native window, so it behaves exactly like the browser version
// but with a desktop icon, its own window, and no address bar. This intentionally does
// NOT add offline/local-storage capability — that was scoped out as a separate, larger
// project; this step only gets a working installable desktop app talking to the same
// backend the web app already uses.
const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('node:path');

// Overridable so the packaged app can point at a different environment (e.g. staging)
// without a rebuild, and so `npm run electron:dev` can point at a local dev server.
const APP_URL = process.env.GEOSURVEY_APP_URL || 'https://app.marwaazpn.com';

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: 'Nootaayo Marwaaz',
    backgroundColor: '#0a0e1a',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadURL(APP_URL);

  // Anything the app opens in a "new tab" (target=_blank — used for signed document
  // links, QR verify pages, etc.) should open in the user's real browser, not spawn
  // another chromeless Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// A slim menu — reload and dev tools are the only things worth keeping for this shell;
// everything else (File/Edit/View defaults) is browser-app noise the user never needs.
function buildMenu() {
  const template = [
    {
      label: 'App',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
