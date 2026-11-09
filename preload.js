'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('native', {
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: (s) => ipcRenderer.invoke('state:save', s),
  geom: () => ipcRenderer.invoke('win:geom'),
  setBounds: (b) => ipcRenderer.invoke('win:bounds', b),
  setGeom: (g) => ipcRenderer.send('geom:set', g),
  setTop: (on) => ipcRenderer.invoke('win:top', on),
  setOverlay: (on) => ipcRenderer.invoke('win:overlay', on),
  setThrough: (on, silent) => ipcRenderer.invoke('win:through', on, !!silent),

  // 存档槽
  listSaves: () => ipcRenderer.invoke('saves:list'),
  saveSlot: (n, data) => ipcRenderer.invoke('saves:save', n, data),
  loadSlot: (n) => ipcRenderer.invoke('saves:load', n),
  deleteSlot: (n) => ipcRenderer.invoke('saves:delete', n),
  exportSave: (data) => ipcRenderer.invoke('saves:export', data),
  importSave: () => ipcRenderer.invoke('saves:import'),
  openSavesDir: () => ipcRenderer.invoke('saves:open'),
  onBounds: (cb) => ipcRenderer.on('bounds', (_e, b) => cb(b)),
  onKeys: (cb) => ipcRenderer.on('keys', (_e, payload) => cb(payload)),
  listPlugins: () => ipcRenderer.invoke('plugins:list'),
  openPluginsDir: () => ipcRenderer.invoke('plugins:open'),
  reloadPlugins: () => ipcRenderer.invoke('plugins:reload'),
  hide: () => ipcRenderer.send('win:hide'),
  quit: () => ipcRenderer.send('win:quit'),
  onCommand: (cb) => ipcRenderer.on('cmd', (_e, payload) => cb(payload))
});
