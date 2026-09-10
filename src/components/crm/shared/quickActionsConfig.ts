/**
 * Lógica pura de QuickActionsBar (FASE-09 §5.2): qué acciones y qué modos de
 * llamada están disponibles según el contexto. Sin React, testeable con jest.
 */

import { LAST_RESORT_COUNTRY_CODE, normalizePhoneDigits } from '@/lib/services/crm/phoneNormalize';

export type QuickActionKind = 'call' | 'email' | 'whatsapp' | 'meeting' | 'task' | 'note';
export type CallMode = 'browser' | 'mobile' | 'ai';

export const ALL_QUICK_ACTIONS: readonly QuickActionKind[] = ['call', 'email', 'whatsapp', 'meeting', 'task', 'note'];

export interface QuickActionsContext {
  customer?: { email?: string | null; phone?: string | null } | null;
  hasOpportunity: boolean;
  hasCustomer: boolean;
  /** null si el SoftphoneProvider no está montado en la página. */
  softphone: { deviceState: string } | null;
  actions?: QuickActionKind[];
}

export interface QuickActionState {
  kind: QuickActionKind;
  label: string;
  enabled: boolean;
  reason?: string;
}

export interface CallModeState {
  mode: CallMode;
  label: string;
  enabled: boolean;
  reason?: string;
}

export const QUICK_ACTION_LABELS: Record<QuickActionKind, string> = {
  call: 'Llamar',
  email: 'Email',
  whatsapp: 'WhatsApp',
  meeting: 'Reunión',
  task: 'Tarea',
  note: 'Nota',
};

export function getQuickActions(ctx: QuickActionsContext): QuickActionState[] {
  const wanted = ctx.actions && ctx.actions.length ? ctx.actions : ALL_QUICK_ACTIONS;
  const hasTarget = ctx.hasOpportunity || ctx.hasCustomer;
  return wanted.map((kind) => {
    const label = QUICK_ACTION_LABELS[kind];
    if (!hasTarget) return { kind, label, enabled: false, reason: 'Sin oportunidad ni cliente' };
    switch (kind) {
      case 'email':
        return ctx.customer?.email
          ? { kind, label, enabled: true }
          : { kind, label, enabled: false, reason: 'El cliente no tiene email' };
      case 'whatsapp':
        return ctx.customer?.phone
          ? { kind, label, enabled: true }
          : { kind, label, enabled: false, reason: 'El cliente no tiene teléfono' };
      case 'call':
        return { kind, label, enabled: true };
      default:
        return { kind, label, enabled: true };
    }
  });
}

export function getCallModes(ctx: QuickActionsContext): CallModeState[] {
  const phone = ctx.customer?.phone ?? null;
  const noPhone = !phone ? 'El cliente no tiene teléfono' : undefined;
  const sp = ctx.softphone;
  const browser: CallModeState = !sp
    ? { mode: 'browser', label: 'Desde el navegador', enabled: false, reason: 'Softphone no configurado en esta página' }
    : sp.deviceState !== 'registered'
      ? { mode: 'browser', label: 'Desde el navegador', enabled: false, reason: `Softphone ${sp.deviceState === 'registering' ? 'conectando…' : 'no registrado'}` }
      : noPhone
        ? { mode: 'browser', label: 'Desde el navegador', enabled: false, reason: noPhone }
        : { mode: 'browser', label: 'Desde el navegador', enabled: true };
  const mobile: CallModeState = noPhone
    ? { mode: 'mobile', label: 'Desde mi celular', enabled: false, reason: noPhone }
    : { mode: 'mobile', label: 'Desde mi celular', enabled: true };
  const ai: CallModeState = { mode: 'ai', label: 'Agente IA', enabled: false, reason: 'Disponible al finalizar F6 (agentes de voz)' };
  return [browser, mobile, ai];
}

/** Normaliza un teléfono a E.164 aproximado (por defecto +57). */
export function normalizePhone(raw: string | null | undefined, defaultCountry = LAST_RESORT_COUNTRY_CODE): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, '');
  if (!digits) return null;
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  if (digits.length === 10) {
    // GEMELO de F-4 (tester r3): esto ponía `+57` a CUALQUIER número de 10
    // dígitos, así que un número de EE.UU. o una cédula escrita en el campo
    // teléfono se convertían en un número colombiano REAL y distinto… y de
    // aquí salen el enlace de WhatsApp y la LLAMADA del móvil. Ahora se usa la
    // misma regla que el servicio: si no tiene forma de número nacional de ese
    // país, no hay teléfono.
    const d = normalizePhoneDigits(digits, defaultCountry);
    return d ? `+${d}` : null;
  }
  return `+${digits}`;
}
