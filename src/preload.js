const { contextBridge, ipcRenderer } = require('electron');
const invoke = (name, value) => ipcRenderer.invoke(`mini:${name}`, value);
contextBridge.exposeInMainWorld('mini', {
  state: () => invoke('state'),
  setup: value => invoke('setup', value),
  login: () => invoke('login'),
  hide: () => invoke('hide'),
  settings: () => invoke('settings'),
  resize: value => invoke('resize', value),
  resizeDrag: value => invoke('resize-drag', value),
  appearance: value => invoke('appearance', value),
  send: text => invoke('send', text),
  mode: name => invoke('mode', name),
  attach: () => invoke('attach'),
  stop: () => invoke('stop'),
  newChat: () => invoke('new-chat'),
  reload: () => invoke('reload'),
  spotlight: () => invoke('spotlight'),
  external: url => invoke('external', url),
  copy: text => invoke('copy', text),
  onState: callback => {
    const listener = (_, state) => callback(state);
    ipcRenderer.on('mini:state', listener);
    return () => ipcRenderer.removeListener('mini:state', listener);
  }
});
