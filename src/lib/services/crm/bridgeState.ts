/**
 * Estado y helpers puros del bridge móvil (FASE-05 §2.4) — sin I/O.
 *
 * Se separan del servicio para que la máquina de estados sea testeable sola y
 * para que `mobileBridgeService.ts` quede en el tamaño objetivo del doc §4.2.
 * `mobileBridgeService` los reexporta: los llamadores no cambian de import.
 */

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type BridgeStatus =
  | 'initiating'
  | 'agent_ringing'
  | 'agent_answered'
  | 'customer_dialing'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'agent_no_answer'
  | 'agent_rejected';

/** Estados de los que ya no se sale (el CHECK no tiene `canceled`: §2.4). */
export const TERMINAL_BRIDGE_STATUSES: readonly BridgeStatus[] = [
  'completed',
  'failed',
  'agent_no_answer',
  'agent_rejected',
];

/** Estados en los que el bridge sigue vivo (índice `idx_bridges_org_active`). */
export const ACTIVE_BRIDGE_STATUSES: readonly BridgeStatus[] = [
  'initiating',
  'agent_ringing',
  'agent_answered',
  'customer_dialing',
  'in_progress',
];

export function isTerminalBridgeStatus(status: string | null | undefined): boolean {
  return (TERMINAL_BRIDGE_STATUSES as readonly string[]).includes(String(status));
}

export interface MobileCallBridge {
  id: string;
  organization_id: number;
  user_id: string;
  agent_phone: string;
  target_phone: string;
  customer_id: string | null;
  opportunity_id: string | null;
  call_id: string | null;
  agent_leg_sid: string | null;
  customer_leg_sid: string | null;
  status: BridgeStatus;
  confirm_digit_required: boolean;
  whisper_text: string | null;
  cancel_requested_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface InitiateBridgeInput {
  /** Número del CLIENTE en E.164 (el del vendedor nunca viaja en el body). */
  to: string;
  customerId?: string | null;
  opportunityId?: string | null;
  /** Texto opcional del whisper (≤200 caracteres). */
  whisper?: string | null;
}

export interface InitiateBridgeResult {
  bridge: MobileCallBridge;
  callId: string;
  agentLegSid: string;
  agentPhoneMasked: string;
}

export interface BridgeFilters {
  status?: BridgeStatus;
  user_id?: string;
  customer_id?: string;
  limit?: number;
  offset?: number;
}

/** Error de negocio con código estable para la API (§4.1). */
export class BridgeError extends Error {
  code: string;
  statusCode: number;
  constructor(code: string, statusCode: number, message?: string) {
    super(message ?? code);
    this.name = 'BridgeError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/** Minutos reservados por bridge: uno por pata (§8). */
export const BRIDGE_RESERVED_MINUTES = 2;

// ─── Helpers puros ───────────────────────────────────────────────────────────

/**
 * E.164 estricto. A diferencia de `formatE164` (que antepone `+57` a ciegas y
 * convierte `"abc"` en `"+57abc"`), aquí un número que no es un E.164 válido se
 * rechaza: es el número al que la organización va a pagar por marcar.
 */
export function normalizeE164(raw: string | null | undefined, defaultCountry = '57'): string | null {
  if (!raw) return null;
  const cleaned = String(raw).replace(/[\s\-().]/g, '');
  if (!/^\+?\d+$/.test(cleaned)) return null;
  let candidate = cleaned;
  if (!candidate.startsWith('+')) {
    if (candidate.startsWith('00')) candidate = `+${candidate.slice(2)}`;
    else if (candidate.length === 10) candidate = `+${defaultCountry}${candidate}`;
    else return null; // sin prefijo ni longitud nacional: no se adivina
  }
  return /^\+[1-9]\d{7,14}$/.test(candidate) ? candidate : null;
}

/** `+573101234567` → `+57 310 *** 4567` (logs y respuestas, §7). */
export function maskPhone(e164: string | null | undefined): string {
  const n = String(e164 ?? '');
  if (n.length < 7) return '***';
  return `${n.slice(0, 6)} *** ${n.slice(-4)}`;
}

export interface WhisperParams {
  customerName: string;
  opportunityName?: string | null;
  confirmDigit: boolean;
}

/** §4.5.1 — "Llamada a Juan Pérez por Renovación 2027. Presiona 1 para conectar, o 2 para cancelar." */
export function buildWhisper(p: WhisperParams): string {
  const who = (p.customerName || '').trim() || 'un cliente';
  const opp = (p.opportunityName || '').trim();
  const base = opp ? `Llamada a ${who} por ${opp}.` : `Llamada a ${who}.`;
  const tail = p.confirmDigit
    ? ' Presiona 1 para conectar, o 2 para cancelar.'
    : ' Conectando.';
  return `${base}${tail}`.slice(0, 400);
}

export interface BridgeLegEvent {
  CallStatus: string;
  AnsweredBy?: string | null;
  SequenceNumber?: string | number | null;
}

/**
 * §2.4 — nuevo estado del bridge para un evento del leg del VENDEDOR.
 * `null` = no tocar (terminal pegajoso o evento que no aporta).
 */
export function applyAgentLegEvent(current: BridgeStatus, ev: BridgeLegEvent): BridgeStatus | null {
  if (isTerminalBridgeStatus(current)) return null;
  const status = String(ev.CallStatus || '').toLowerCase();
  const machine = String(ev.AnsweredBy || '').startsWith('machine');

  if (machine && (status === 'in-progress' || status === 'answered')) return 'agent_no_answer';

  switch (status) {
    case 'queued':
    case 'initiated':
    case 'ringing':
      return current === 'initiating' ? 'agent_ringing' : null;
    case 'in-progress':
    case 'answered':
      return current === 'initiating' || current === 'agent_ringing' ? 'agent_answered' : null;
    case 'completed':
      // El vendedor colgó. Si ya se estaba marcando al cliente, el desenlace lo
      // fija `dial-complete`/el leg del cliente, no este evento.
      if (current === 'customer_dialing' || current === 'in_progress') return null;
      return current === 'agent_answered' ? 'agent_rejected' : 'agent_no_answer';
    case 'busy':
    case 'no-answer':
      return 'agent_no_answer';
    case 'failed':
    case 'canceled':
      return 'failed';
    default:
      return null; // CallStatus desconocido: no mata el bridge
  }
}

/** §2.4 — nuevo estado del bridge para un evento del leg del CLIENTE. */
export function applyCustomerLegEvent(current: BridgeStatus, ev: BridgeLegEvent): BridgeStatus | null {
  if (isTerminalBridgeStatus(current)) return null;
  const status = String(ev.CallStatus || '').toLowerCase();
  switch (status) {
    case 'queued':
    case 'initiated':
    case 'ringing':
      return current === 'in_progress' ? null : 'customer_dialing';
    case 'in-progress':
    case 'answered':
      return 'in_progress';
    case 'completed':
      return current === 'in_progress' ? 'completed' : 'failed';
    case 'busy':
    case 'no-answer':
    case 'failed':
    case 'canceled':
      return 'failed';
    default:
      return null;
  }
}

/** ¿El bridge terminó sin llegar a marcar al cliente? (→ se reembolsa 1 minuto) */
export function customerLegNeverDialed(previous: BridgeStatus, next: BridgeStatus): boolean {
  if (!isTerminalBridgeStatus(next)) return false;
  return previous === 'initiating' || previous === 'agent_ringing' || previous === 'agent_answered';
}
