const { contextBridge, ipcRenderer } = require('electron');

// Only specific operations cross the bridge; Node, SQL, and IPC stay private.
contextBridge.exposeInMainWorld('reqdelta', {
  sendRequest: (request) => ipcRenderer.invoke('requests:send', request),
  listCollections: () => ipcRenderer.invoke('collections:list'),
  createCollection: (input) => ipcRenderer.invoke('collections:create', input),
});
