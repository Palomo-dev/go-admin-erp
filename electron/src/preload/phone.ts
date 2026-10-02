import { contextBridge, ipcRenderer } from 'electron';
import type { PhoneCommand, PhoneSnapshot } from '../shared/phoneProtocol';

contextBridge.exposeInMainWorld('goAdminPhone', {
  state: () => ipcRenderer.invoke('phone:state'),
  command: (command: PhoneCommand) => ipcRenderer.invoke('phone:command', command),
  close: () => ipcRenderer.invoke('phone:close'),
  minimize: () => ipcRenderer.invoke('phone:minimize'),
  pin: (value: boolean) => ipcRenderer.invoke('phone:pin', value),
  openMain: () => ipcRenderer.invoke('phone:open-main'),
  missedAction: (action: { id: string; scope: string; action: 'callback' | 'create_lead' }) => ipcRenderer.invoke('phone:missed-action', action),
  onState: (handler: (snapshot: PhoneSnapshot | null) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: PhoneSnapshot | null) => handler(state);
    ipcRenderer.on('phone:state', listener);
    return () => ipcRenderer.removeListener('phone:state', listener);
  },
});
