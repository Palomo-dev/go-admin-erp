import { ipcMain, Notification, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { getWebContents, getMainWindow, getLoadUrl, isInternalUrl } from './windows/mainWindow';
import { getPhoneWindow, openPhoneWindow, closePhoneWindow } from './windows/phoneWindow';
import { parsePhoneCommand, parsePhoneControl, parsePhoneSnapshot, parsePhoneMissedNotice, PHONE_PATH, type PhoneSnapshot, type PhoneReply, type PhoneMissedNotice } from '../shared/phoneProtocol';
import { phoneLabels } from './phoneLabels';

type Event = IpcMainEvent | IpcMainInvokeEvent;
let snapshot: PhoneSnapshot | null = null;
let missed: PhoneMissedNotice | null = null;
const missedIds = new Set<string>();
const pending = new Map<string, { scope: string; finish: (reply: PhoneReply) => void; timer: ReturnType<typeof setTimeout> }>();
const settled = new Map<string, { body: string; reply: PhoneReply }>();
export function getPhoneSnapshot() { return snapshot && missed ? { ...snapshot, missed } : snapshot; }
function isOwner(event: Event): boolean {
  const wc = getWebContents();
  if (!wc || event.sender !== wc || event.senderFrame !== wc.mainFrame) return false;
  try { const pathname = new URL(wc.getURL()).pathname; return isInternalUrl(wc.getURL(), getLoadUrl()) && (pathname === '/app' || pathname.startsWith('/app/')); } catch { return false; }
}
function isMirror(event: Event): boolean {
  const wc = getPhoneWindow()?.webContents;
  const owner = getWebContents();
  if (!wc || !owner || event.sender !== wc || event.senderFrame !== wc.mainFrame) return false;
  try { return wc.getURL() === new URL(owner.getURL()).origin + PHONE_PATH; } catch { return false; }
}
function authorize(event: Event, mirror = false) {
  if (!(mirror ? isMirror(event) : isOwner(event))) throw new Error('sin_permiso');
}
function publish() { getPhoneWindow()?.webContents.send('phone:state', getPhoneSnapshot()); }
function missedAction(notice: PhoneMissedNotice, action: 'callback' | 'create_lead') {
  if (!snapshot || notice.scope !== snapshot.scope || missed?.id !== notice.id) return false;
  getMainWindow()?.show(); getMainWindow()?.focus();
  getWebContents()?.send('phone:missed-action', { id: notice.id, scope: notice.scope, action, number: notice.number });
  return true;
}
export function clearPhoneController() {
  snapshot = null; missed = null; missedIds.clear(); settled.clear();
  for (const [id, entry] of pending) { clearTimeout(entry.timer); entry.finish({ id, ok: false, error: 'controlador_desconectado' }); }
  pending.clear(); publish();
}
export function registerPhoneIpc() {
  ipcMain.on('phone:publish', (event, raw: unknown) => {
    if (!isOwner(event)) return;
    if (raw === null) { clearPhoneController(); return; }
    let next: PhoneSnapshot;
    try { next = parsePhoneSnapshot(raw); } catch { return; }
    if (snapshot && next.scope === snapshot.scope && next.revision <= snapshot.revision) return;
    if (snapshot && next.scope !== snapshot.scope) clearPhoneController();
    const newIncoming = next.incoming && (!snapshot?.incoming || next.scope !== snapshot.scope);
    snapshot = next; publish();
    if (newIncoming && Notification.isSupported()) {
      const labels = phoneLabels(next.locale);
      const notification = new Notification({ title: labels.title, body: next.call?.displayName ?? next.call?.number ?? labels.incoming });
      notification.on('click', () => { void openPhoneWindow(); }); notification.show();
    }
  });
  ipcMain.on('phone:missed', (event, raw: unknown) => {
    if (!isOwner(event) || !snapshot) return;
    let notice: PhoneMissedNotice;
    try { notice = parsePhoneMissedNotice(raw); } catch { return; }
    if (notice.scope !== snapshot.scope || missedIds.has(notice.id)) return;
    missedIds.add(notice.id); if (missedIds.size > 100) missedIds.delete(missedIds.values().next().value as string);
    missed = notice; publish();
    if (!Notification.isSupported()) return;
    const labels = phoneLabels(snapshot.locale);
    const notification = new Notification({ title: labels.missed, body: notice.displayName ?? notice.number,
      actions: [{ type: 'button', text: labels.callback }, { type: 'button', text: labels.lead }] });
    notification.on('click', () => { if (notice.scope === snapshot?.scope) void openPhoneWindow(); });
    notification.on('action', (_event, index) => { if (index === 0 || index === 1) missedAction(notice, index === 0 ? 'callback' : 'create_lead'); });
    notification.show();
  });
  ipcMain.handle('phone:missed-action', (event, raw: unknown) => {
    authorize(event, true);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('datos_invalidos');
    const value = raw as Record<string, unknown>;
    if (Object.keys(value).some(key => !['id', 'scope', 'action'].includes(key)) || !['callback', 'create_lead'].includes(String(value.action))) throw new TypeError('datos_invalidos');
    if (!missed || value.id !== missed.id || value.scope !== missed.scope) return { ok: false };
    return { ok: missedAction(missed, value.action as 'callback' | 'create_lead') };
  });
  ipcMain.handle('phone:open', async event => { authorize(event); return { ok: await openPhoneWindow() }; });
  ipcMain.handle('phone:state', event => {
    if (!isMirror(event) && !isOwner(event)) throw new Error('sin_permiso'); return getPhoneSnapshot();
  });
  ipcMain.handle('phone:close', event => { authorize(event, true); closePhoneWindow(); });
  ipcMain.handle('phone:minimize', event => { authorize(event, true); getPhoneWindow()?.minimize(); });
  ipcMain.handle('phone:pin', (event, value: unknown) => {
    authorize(event, true); if (typeof value !== 'boolean') throw new TypeError('datos_invalidos');
    getPhoneWindow()?.setAlwaysOnTop(value); return value;
  });
  ipcMain.handle('phone:open-main', event => { authorize(event, true); getMainWindow()?.show(); getMainWindow()?.focus(); });
  ipcMain.handle('phone:command', async (event, raw: unknown): Promise<PhoneReply> => {
    authorize(event, true); const command = parsePhoneCommand(raw);
    if (!snapshot || command.scope !== snapshot.scope || command.revision !== snapshot.revision) return { id: command.id, ok: false, error: 'estado_desactualizado' };
    const body = JSON.stringify(command); const old = settled.get(command.id);
    if (old) return old.body === body ? old.reply : { id: command.id, ok: false, error: 'clave_reutilizada' };
    if (pending.size > 0) return { id: command.id, ok: false, error: 'accion_en_curso' };
    const owner = getWebContents();
    if (!owner || owner.isDestroyed()) return { id: command.id, ok: false, error: 'controlador_desconectado' };
    return new Promise(resolve => {
      const finish = (reply: PhoneReply) => {
        pending.delete(command.id); settled.set(command.id, { body, reply });
        if (settled.size > 100) settled.delete(settled.keys().next().value as string);
        resolve(reply);
      };
      const timer = setTimeout(() => finish({ id: command.id, ok: false, error: 'sin_respuesta' }), 10000);
      pending.set(command.id, { scope: command.scope, finish, timer }); owner.send('phone:dispatch', command);
    });
  });
  ipcMain.on('phone:reply', (event, raw: unknown) => {
    if (!isOwner(event) || !raw || typeof raw !== 'object') return;
    const reply = raw as PhoneReply & { scope?: string };
    if (typeof reply.id !== 'string' || typeof reply.ok !== 'boolean' || (reply.error !== undefined && (typeof reply.error !== 'string' || reply.error.length > 400))) return;
    const item = pending.get(reply.id); if (!item || reply.scope !== item.scope) return;
    let control;
    try { control = reply.control === undefined ? undefined : parsePhoneControl(reply.control); } catch { return; }
    clearTimeout(item.timer); item.finish({ id: reply.id, ok: reply.ok, ...(reply.error ? { error: reply.error } : {}), ...(control ? { control } : {}) });
  });
}
/** Recargar/logout invalida el espejo; otra ventana no puede asumir el Device. */
export function attachPhoneControllerLifecycle() {
  const wc = getWebContents();
  wc?.on('did-start-navigation', (_event, _url, inPlace, mainFrame) => { if (mainFrame && !inPlace) clearPhoneController(); });
  wc?.once('destroyed', clearPhoneController);
}
