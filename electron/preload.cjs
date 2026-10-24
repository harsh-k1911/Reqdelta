const { contextBridge, ipcRenderer } = require('electron');

// Only specific operations cross the bridge; Node, SQL, and IPC stay private.
contextBridge.exposeInMainWorld('reqdelta', {
  sendRequest: (request) => ipcRenderer.invoke('requests:send', request),
  listCollections: () => ipcRenderer.invoke('collections:list'),
  createCollection: (input) => ipcRenderer.invoke('collections:create', input),
  createSavedRequest: (input) => ipcRenderer.invoke('saved-requests:create', input),
  listSavedRequests: (input) => ipcRenderer.invoke('saved-requests:list', input),
  getSavedRequest: (input) => ipcRenderer.invoke('saved-requests:get', input),
  listHistory: (input) => ipcRenderer.invoke('history:list', input),
  getHistoryEntry: (input) => ipcRenderer.invoke('history:get', input),
});
