const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');

let mainWindow;
const GOT_THE_LOCK = app.requestSingleInstanceLock();

if (!GOT_THE_LOCK) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    // Protocol handler for Windows deep-linking (e.g. planwell://auth-callback#...)
    const url = commandLine.find(arg => arg.startsWith('planwell://'));
    if (url && mainWindow) {
      mainWindow.webContents.send('oauth-callback-url', url);
    }
  });
}

// Register custom protocol scheme planwell://
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('planwell', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('planwell');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 830,
    minWidth: 900,
    minHeight: 600,
    title: 'Plan Well - Goal & Habit Tracker',
    backgroundColor: '#02070d',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#02070d',
      symbolColor: '#00f6ff',
      height: 38
    },
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');

  // Handle external link clicks (like Google OAuth) securely in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC listener for opening external URLs (e.g., Google login in default Chrome/Edge)
ipcMain.on('open-external', (event, url) => {
  if (url && (url.startsWith('http:') || url.startsWith('https:'))) {
    shell.openExternal(url);
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('open-url', (event, url) => {
  event.preventDefault();
  if (mainWindow) {
    mainWindow.webContents.send('oauth-callback-url', url);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
