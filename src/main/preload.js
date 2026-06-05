const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("codexQuota", {
  getQuota: () => ipcRenderer.invoke("quota:get"),
  getDiagnostics: () => ipcRenderer.invoke("codex:diagnostics"),
  minimize: () => ipcRenderer.invoke("window:minimize"),
  close: () => ipcRenderer.invoke("window:close"),
  getAlwaysOnTop: () => ipcRenderer.invoke("window:alwaysOnTop:get"),
  setAlwaysOnTop: (value) => ipcRenderer.invoke("window:alwaysOnTop:set", value),
  openCodex: () => ipcRenderer.invoke("external:openCodex"),
  onRefresh: (callback) => {
    ipcRenderer.on("quota:refresh", callback);
  },
  onThemeSet: (callback) => {
    ipcRenderer.on("theme:set", (_event, themeId) => callback(themeId));
  },
  onAlwaysOnTopChanged: (callback) => {
    ipcRenderer.on("window:alwaysOnTopChanged", (_event, value) => callback(value));
  }
});
