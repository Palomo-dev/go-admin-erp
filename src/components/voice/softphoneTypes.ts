/**
 * Tipos públicos del softphone (FASE-03 §5.2). Separados de
 * `SoftphoneProvider.tsx` en la ronda 2 para respetar el límite de 300 líneas
 * por componente; el provider los reexporta, así que los importadores
 * existentes (`CallDispositionDialog`, barrel `index.ts`) no cambian.
 */

import type { AudioDevicesState } from './hooks/useAudioDevices';
import type { DeviceState } from './hooks/useTwilioDevice';

export type CallStatus = 'idle' | 'connecting' | 'ringing' | 'connected' | 'ended';

export interface MakeCallOptions {
  customerId?: string | null;
  opportunityId?: string | null;
  /** Nombre para mostrar en el dock. */
  displayName?: string | null;
}

export interface ActiveCallInfo {
  direction: 'outbound' | 'inbound';
  callSid: string | null;
  /** Número marcado (saliente) o número que llama (entrante). */
  number: string;
  displayName: string | null;
  opportunityId: string | null;
  customerId: string | null;
  /** Epoch ms al conectar (para el timer). */
  connectedAt: number | null;
}

export interface EndedCallInfo extends ActiveCallInfo {
  /** `calls.id` resuelto por Realtime/polling (null si aún no llegó). */
  callId: string | null;
  durationSeconds: number;
  liveNote: string;
  endedAt: number;
}

export interface SoftphoneContextValue {
  available: true;
  deviceState: DeviceState;
  /** Motivo legible del estado error/no_permission/not_configured. */
  deviceReason: string | null;
  deviceErrorCode: number | null;
  /**
   * Credenciales de Twilio que faltan cuando `deviceState === 'not_configured'`
   * (nombres de variable, nunca valores). Vacío en el resto de estados.
   */
  deviceMissing: string[];
  callStatus: CallStatus;
  activeCall: ActiveCallInfo | null;
  /** `calls.id` de la llamada activa (Realtime por provider_call_sid). */
  activeCallId: string | null;
  /** Fila `calls` en vivo (estado, grabación). */
  activeCallRow: { id: string; status: string; recording_enabled: boolean; consent_given: boolean } | null;
  muted: boolean;
  hasIncoming: boolean;
  incoming: { from: string; callSid: string | null } | null;
  liveNote: string;
  setLiveNote: (text: string) => void;
  lastEndedCall: EndedCallInfo | null;
  clearLastEndedCall: () => void;
  audio: AudioDevicesState;
  makeCall: (to: string, opts?: MakeCallOptions) => Promise<void>;
  hangup: () => void;
  mute: (muted: boolean) => void;
  sendDigits: (digits: string) => void;
  acceptIncoming: () => void;
  rejectIncoming: () => void;
  /** Reintenta la inicialización (tras configurar telefonía o dar permiso al micrófono). */
  retry: () => void;
}

export type SoftphoneValue = SoftphoneContextValue | { available: false };
