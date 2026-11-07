'use strict';
/**
 * 太阳窗口的极简 preload：只暴露「改大小」和「读当前大小」。
 * 滚轮缩放挂在 preload 里，避免给 sun.html 开 inline script 的 CSP。
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sunApi', {
  resize: (px) => ipcRenderer.invoke('sun:size', px),
  size: () => ipcRenderer.invoke('sun:size:get')
});

window.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const step = e.deltaY > 0 ? -8 : 8;
    ipcRenderer.invoke('sun:size', Math.round(window.innerWidth + step));
  },
  { passive: false }
);
