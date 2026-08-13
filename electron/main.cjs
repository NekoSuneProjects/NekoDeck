const { app, BrowserWindow, shell } = require('electron');
const path = require('node:path');
const { createApp } = require('../server/app.cjs');

let server;

async function createWindow() {
  const dataDir = path.join(app.getPath('userData'), 'data');
  const { app: webApp } = createApp({ mode: 'desktop', dataDir });
  server = webApp.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#07120d',
    title: 'NekoDeck',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) shell.openExternal(url);
    return { action: 'deny' };
  });

  await win.loadURL(`http://127.0.0.1:${port}`);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (server) server.close();
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
