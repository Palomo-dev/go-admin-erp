/** Contrato único del control de conferencia: ningún booleano local acredita una acción del proveedor. */
export type PhoneTransferMode = 'direct' | 'consult';
export type PhoneControlPhase = 'ready' | 'holding' | 'held' | 'resuming' | 'consulting' | 'transferring' | 'error' | 'ended';
export type PhoneTransferStatus = 'dialing' | 'connected' | 'confirmed' | 'failed';

export interface PhoneTransfer {
  mode: PhoneTransferMode;
  status: PhoneTransferStatus;
  toName: string;
}

export interface PhoneControlState {
  supported: boolean;
  phase: PhoneControlPhase;
  held: boolean;
  heldAt: number | null;
  holdSeconds: number;
  transfer: PhoneTransfer | null;
  busy: boolean;
  error: string | null;
}

export type PhoneTransferTarget = { userId: string; number?: never } | { number: string; userId?: never };
export type PhoneControlCommand =
  | { action: 'hold'; held: boolean }
  | { action: 'transfer'; mode: PhoneTransferMode; target: PhoneTransferTarget }
  | { action: 'confirm_transfer' }
  | { action: 'cancel_transfer' }
  | { action: 'hangup' };

export type PhoneControlResult =
  | { ok: true; state: PhoneControlState }
  | { ok: false; code: string; message: string; state?: PhoneControlState };

export const UNSUPPORTED_PHONE_CONTROL: PhoneControlState = {
  supported: false, phase: 'ready', held: false, heldAt: null, holdSeconds: 0,
  transfer: null, busy: false, error: null,
};

/** DTO deliberadamente pequeño para web/Electron; las SIDs y los destinos privados nunca viajan por IPC. */
export function phoneControlDto(input: unknown): PhoneControlState | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  const phases: readonly string[] = ['ready', 'holding', 'held', 'resuming', 'consulting', 'transferring', 'error', 'ended'];
  if (typeof value.supported !== 'boolean' || !phases.includes(String(value.phase))
    || typeof value.held !== 'boolean' || typeof value.busy !== 'boolean'
    || typeof value.holdSeconds !== 'number' || !Number.isFinite(value.holdSeconds) || value.holdSeconds < 0
    || (value.heldAt !== null && (typeof value.heldAt !== 'number' || !Number.isFinite(value.heldAt)))
    || (value.error !== null && typeof value.error !== 'string')) return null;
  let transfer: PhoneTransfer | null = null;
  if (value.transfer !== null) {
    if (!value.transfer || typeof value.transfer !== 'object' || Array.isArray(value.transfer)) return null;
    const next = value.transfer as Record<string, unknown>;
    if ((next.mode !== 'direct' && next.mode !== 'consult')
      || !['dialing', 'connected', 'confirmed', 'failed'].includes(String(next.status))
      || typeof next.toName !== 'string' || next.toName.length > 200) return null;
    transfer = { mode: next.mode, status: next.status as PhoneTransferStatus, toName: next.toName };
  }
  return {
    supported: value.supported, phase: value.phase as PhoneControlPhase, held: value.held,
    heldAt: value.heldAt as number | null, holdSeconds: value.holdSeconds,
    transfer, busy: value.busy, error: value.error as string | null,
  };
}
