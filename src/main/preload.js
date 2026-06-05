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
    const listener = () => callback();
    ipcRenderer.on("quota:refresh", listener);
    return () => ipcRenderer.removeListener("quota:refresh", listener);
  },
  onThemeSet: (callback) => {
    const listener = (_event, themeId) => callback(themeId);
    ipcRenderer.on("theme:set", listener);
    return () => ipcRenderer.removeListener("theme:set", listener);
  },
  onAlwaysOnTopChanged: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("window:alwaysOnTopChanged", listener);
    return () => ipcRenderer.removeListener("window:alwaysOnTopChanged", listener);
  }
});
