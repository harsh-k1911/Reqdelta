const { contextBridge, ipcRenderer } = require('electron');

// The renderer can send a request, but cannot access Node or choose IPC channels.
contextBridge.exposeInMainWorld('reqdelta', {
  sendRequest: (request) => ipcRenderer.invoke('requests:send', request),
});
