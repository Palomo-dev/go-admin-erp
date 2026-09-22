'use client';

/**
 * useCallModePolicy — modo de llamada por defecto para ESTE usuario en ESTA
 * plataforma (F5/F15-B). Junta tres entradas y se las pasa a la única función
 * que decide, `resolveDefaultCallMode` (regla 7):
 *  - capacidades reales del cliente (`getCapabilities`),
 *  - preferencia del usuario (`GET /api/crm/me/comm-preferences`),
 *  - estado del permiso de micrófono SIN pedirlo (`queryMicrophonePermission`).
 *
 * Caché de la preferencia a nivel de módulo (TTL 60 s): la barra de acciones
 * se monta en cada tarjeta del Kanban. Un fallo de la API deja `prefs=null`
 * (la política cae al valor por plataforma) y no se cachea.
 */
import { useCallback, useEffect, useState } from 'react';
// Hoja server-safe (sin cliente Supabase): solo lee la organización activa del storage.
import { getOrganizationId } from '@/lib/utils/orgId';
import { getCapabilities, queryMicrophonePermission } from '@/lib/services/voice/platformCapabilities';
import {
  detectDesktopOs,
  microphoneSettingsHint,
  resolveDefaultCallMode,
  type CallModeDecision,
  type CallModePrefs,
} from '@/lib/services/voice/callModePolicy';

const PREFS_TTL_MS = 60_000;
// Tester F15-B: la caché lleva la organización. `user_comm_preferences` es por
// (org, usuario) y hay cambios de organización sin recarga (OrganizationList
// con `reload: false`); los cambios de usuario siempre recargan la página.
let prefsCache: { at: number; orgId: number; value: CallModePrefs } | null = null;
let inflight: Promise<CallModePrefs | null> | null = null;

export async function loadCallModePrefs(): Promise<CallModePrefs | null> {
  const orgId = getOrganizationId();
  if (prefsCache && prefsCache.orgId === orgId && Date.now() - prefsCache.at < PREFS_TTL_MS) return prefsCache.value;
  if (inflight) return inflight;
  // `Promise.resolve().then(...)`: si `fetch` no existe o lanza síncronamente, cae al `.catch` (null) en vez de rechazar.
  inflight = Promise.resolve()
    .then(() => fetch('/api/crm/me/comm-preferences', { headers: { Accept: 'application/json' } }))
    .then(async (res) => {
      if (!res.ok) return null;
      const body = (await res.json().catch(() => null)) as { data?: { default_call_mode?: unknown } } | null;
      const raw = body?.data?.default_call_mode;
      const value: CallModePrefs = { default_call_mode: raw === 'browser' || raw === 'mobile' ? raw : null };
      prefsCache = { at: Date.now(), orgId, value };
      return value;
    })
    .catch(() => null)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Tras guardar la preferencia (Configuración → Telefonía) o en tests. */
export function invalidateCallModePrefs(): void {
  prefsCache = null;
  inflight = null;
}

/**
 * Motivo del estado `no_permission` del softphone con la ruta de Ajustes de
 * ESTA plataforma. En Electron el permiso lo bloquea el SO (Windows:
 * Privacidad → Micrófono → apps de escritorio; macOS: Seguridad y
 * privacidad), no el navegador: «permite el micrófono en el navegador» no
 * le sirve a nadie ahí.
 */
export function microphoneDeniedReason(): string {
  const caps = getCapabilities();
  return microphoneSettingsHint(caps.platform, detectDesktopOs(typeof navigator === 'undefined' ? '' : navigator.userAgent));
}

/** Decisión completa en el cliente (sin React): capacidades + preferencia + micrófono. */
export async function computeCallModeDecision(): Promise<CallModeDecision> {
  const caps = getCapabilities();
  const [prefs, mic] = await Promise.all([loadCallModePrefs(), queryMicrophonePermission()]);
  const os = detectDesktopOs(typeof navigator === 'undefined' ? '' : navigator.userAgent);
  return resolveDefaultCallMode(caps, prefs, mic, os);
}

export interface CallModePolicyState {
  /** `null` mientras se resuelve (y siempre en SSR). */
  decision: CallModeDecision | null;
  refresh: () => void;
}

export function useCallModePolicy(): CallModePolicyState {
  const [decision, setDecision] = useState<CallModeDecision | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => {
    invalidateCallModePrefs();
    setTick((t) => t + 1);
  }, []);
  useEffect(() => {
    let cancelled = false;
    void computeCallModeDecision().then((d) => {
      if (!cancelled) setDecision(d);
    });
    return () => {
      cancelled = true;
    };
  }, [tick]);
  return { decision, refresh };
}
