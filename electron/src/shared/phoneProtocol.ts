/** Contrato compartido entre el controlador web y su espejo nativo; sin secretos. */
export const PHONE_PATH = '/telefono';
export type PhoneLocale = 'es' | 'en' | 'fr' | 'pt';
export interface PhoneMissedNotice { id: string; scope: string; number: string; displayName: string | null }
export interface PhoneMissedAction { id: string; scope: string; action: 'callback' | 'create_lead'; number: string }
export type PhoneAction = 'dial' | 'mute' | 'digits' | 'hangup' | 'accept' | 'reject' | 'retry' | 'hold' | 'transfer' | 'confirm_transfer' | 'cancel_transfer';
export interface PhoneControlSnapshot {
  supported: boolean; phase: 'ready' | 'holding' | 'held' | 'resuming' | 'consulting' | 'transferring' | 'error' | 'ended';
  held: boolean; heldAt: number | null; holdSeconds: number; busy: boolean; error: string | null;
  transfer: { mode: 'direct' | 'consult'; status: 'dialing' | 'connected' | 'confirmed' | 'failed'; toName: string } | null;
}
export interface PhoneTransferValue { mode: 'direct' | 'consult'; target: { userId: string } | { number: string } }
export interface PhoneSnapshot {
  scope: string;
  revision: number;
  organizationId: number;
  deviceState: string;
  reason: string | null;
  callStatus: 'idle' | 'connecting' | 'ringing' | 'connected' | 'ended';
  call: { number: string; displayName: string | null; connectedAt: number | null } | null;
  incoming: boolean;
  muted: boolean;
  recording: boolean;
  control?: PhoneControlSnapshot;
  locale?: PhoneLocale;
  missed?: PhoneMissedNotice;
}
export interface PhoneCommand {
  id: string;
  scope: string;
  revision: number;
  action: PhoneAction;
  value?: string | boolean | PhoneTransferValue;
}
export interface PhoneReply { id: string; ok: boolean; error?: string; control?: PhoneControlSnapshot }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('datos_invalidos');
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).some(k => !keys.includes(k))) throw new TypeError('datos_invalidos');
}
function text(value: unknown, max: number): value is string { return typeof value === 'string' && value.length <= max; }
export function parsePhoneSnapshot(value: unknown): PhoneSnapshot {
  const p = record(value);
  exact(p, ['scope', 'revision', 'organizationId', 'deviceState', 'reason', 'callStatus', 'call', 'incoming', 'muted', 'recording', 'control', 'locale', 'missed']);
  if (!text(p.scope, 36) || !uuid.test(p.scope) || !Number.isSafeInteger(p.revision) || Number(p.revision) < 0
    || !Number.isSafeInteger(p.organizationId) || Number(p.organizationId) <= 0
    || !['idle', 'unregistered', 'registering', 'registered', 'error', 'no_permission', 'not_configured'].includes(String(p.deviceState))
    || (p.reason !== null && !text(p.reason, 400))
    || !['idle', 'connecting', 'ringing', 'connected', 'ended'].includes(String(p.callStatus))
    || ['incoming', 'muted', 'recording'].some(k => typeof p[k] !== 'boolean')) throw new TypeError('datos_invalidos');
  if (p.call !== null) {
    const c = record(p.call); exact(c, ['number', 'displayName', 'connectedAt']);
    if (!text(c.number, 80) || (c.displayName !== null && !text(c.displayName, 200))
      || (c.connectedAt !== null && (typeof c.connectedAt !== 'number' || !Number.isFinite(c.connectedAt) || c.connectedAt < 0))) throw new TypeError('datos_invalidos');
  }
  if (p.control !== undefined) parsePhoneControl(p.control);
  if (p.locale !== undefined && !['es', 'en', 'fr', 'pt'].includes(String(p.locale))) throw new TypeError('datos_invalidos');
  if (p.missed !== undefined && parsePhoneMissedNotice(p.missed).scope !== p.scope) throw new TypeError('datos_invalidos');
  return p as unknown as PhoneSnapshot;
}
export function parsePhoneMissedNotice(value: unknown): PhoneMissedNotice {
  const p = record(value); exact(p, ['id', 'scope', 'number', 'displayName']);
  if (!text(p.id, 36) || !uuid.test(p.id) || !text(p.scope, 36) || !uuid.test(p.scope)
    || !text(p.number, 16) || !/^\+[1-9][0-9]{6,14}$/.test(p.number)
    || (p.displayName !== null && !text(p.displayName, 200))) throw new TypeError('datos_invalidos');
  return p as unknown as PhoneMissedNotice;
}
export function parsePhoneControl(value: unknown): PhoneControlSnapshot {
    const c = record(value); exact(c, ['supported', 'phase', 'held', 'heldAt', 'holdSeconds', 'busy', 'error', 'transfer']);
    if (['supported', 'held', 'busy'].some(key => typeof c[key] !== 'boolean')
      || !['ready', 'holding', 'held', 'resuming', 'consulting', 'transferring', 'error', 'ended'].includes(String(c.phase))
      || typeof c.holdSeconds !== 'number' || !Number.isFinite(c.holdSeconds) || c.holdSeconds < 0
      || (c.heldAt !== null && (typeof c.heldAt !== 'number' || !Number.isFinite(c.heldAt) || c.heldAt < 0))
      || (c.error !== null && !text(c.error, 400))) throw new TypeError('datos_invalidos');
    if (c.transfer !== null) {
      const x = record(c.transfer); exact(x, ['mode', 'status', 'toName']);
      if (!['direct', 'consult'].includes(String(x.mode)) || !['dialing', 'connected', 'confirmed', 'failed'].includes(String(x.status)) || !text(x.toName, 200)) throw new TypeError('datos_invalidos');
    }
  return c as unknown as PhoneControlSnapshot;
}
export function parsePhoneCommand(value: unknown): PhoneCommand {
  const p = record(value); exact(p, ['id', 'scope', 'revision', 'action', 'value']);
  if (!text(p.id, 36) || !uuid.test(p.id) || !text(p.scope, 36) || !uuid.test(p.scope)
    || !Number.isSafeInteger(p.revision) || Number(p.revision) < 0
    || !['dial', 'mute', 'digits', 'hangup', 'accept', 'reject', 'retry', 'hold', 'transfer', 'confirm_transfer', 'cancel_transfer'].includes(String(p.action))) throw new TypeError('datos_invalidos');
  if (p.action === 'dial' && (!text(p.value, 40) || !/^\+?[0-9 ()-]{3,40}$/.test(p.value))) throw new TypeError('numero_invalido');
  if (p.action === 'digits' && (!text(p.value, 32) || !/^[0-9*#w]+$/.test(p.value))) throw new TypeError('datos_invalidos');
  if (['mute', 'hold'].includes(String(p.action)) && typeof p.value !== 'boolean') throw new TypeError('datos_invalidos');
  if (p.action === 'transfer') {
    const v = record(p.value); exact(v, ['mode', 'target']);
    if (!['direct', 'consult'].includes(String(v.mode))) throw new TypeError('datos_invalidos');
    const target = record(v.target); exact(target, ['userId', 'number']);
    if (typeof target.userId === 'string' && uuid.test(target.userId) && target.number === undefined) { /* identidad propia que el servidor vuelve a autorizar */ }
    else if (text(target.number, 16) && /^\+[1-9][0-9]{6,14}$/.test(target.number) && target.userId === undefined) { /* E.164, nunca una SID o un destino de invitación privada */ }
    else throw new TypeError('datos_invalidos');
  }
  if (!['dial', 'mute', 'digits', 'hold', 'transfer'].includes(String(p.action)) && p.value !== undefined) throw new TypeError('datos_invalidos');
  return p as unknown as PhoneCommand;
}
