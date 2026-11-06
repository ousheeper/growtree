'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('native', {
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: (s) => ipcRenderer.invoke('state:save', s),
  setPanel: (open) => ipcRenderer.invoke('win:panel', open),
  setAppScale: (w, h) => ipcRenderer.invoke('win:scale', w, h),
  setTop: (on) => ipcRenderer.invoke('win:top', on),
  setOverlay: (on) => ipcRenderer.invoke('win:overlay', on),
  setThrough: (on, silent) => ipcRenderer.invoke('win:through', on, !!silent),
  getSun: () => ipcRenderer.invoke('sun:get'),
  setSunTop: (on) => ipcRenderer.invoke('sun:top', on),
  onSun: (cb) => ipcRenderer.on('sun', (_e, payload) => cb(payload)),
  listPlugins: () => ipcRenderer.invoke('plugins:list'),
  openPluginsDir: () => ipcRenderer.invoke('plugins:open'),
  reloadPlugins: () => ipcRenderer.invoke('plugins:reload'),
  hide: () => ipcRenderer.send('win:hide'),
  quit: () => ipcRenderer.send('win:quit'),
  onCommand: (cb) => ipcRenderer.on('cmd', (_e, payload) => cb(payload))
});
