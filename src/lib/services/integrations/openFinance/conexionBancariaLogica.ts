/**
 * Conectar banco (Finanzas, ronda 2 · A3–A6). Sin React ni Supabase: lo usan
 * la pantalla (estados de la tabla, cifras, cuándo se puede renovar) y la ruta
 * de renovación (la misma regla de 7 días en el servidor).
 */

/** Renovar solo las autorizaciones que vencen en 7 días o menos. */
export const DIAS_PARA_RENOVAR = 7;

const MS_DIA = 24 * 60 * 60 * 1000;

export type EstadoAutorizacion = 'activa' | 'porVencer' | 'vencida' | 'revocada';

export interface AutorizacionMinima {
  status: string | null;
  expires_at: string | null;
}

/**
 * Días completos que faltan para el vencimiento (redondeo hacia arriba: si
 * vence mañana a cualquier hora, falta 1). Negativo si ya venció; null si no
 * tiene vencimiento.
 */
export function diasParaVencer(expiresAt: string | null | undefined, ahora: Date = new Date()): number | null {
  if (!expiresAt) return null;
  const vence = new Date(expiresAt).getTime();
  if (Number.isNaN(vence)) return null;
  return Math.ceil((vence - ahora.getTime()) / MS_DIA);
}

/** Estado que ve la persona: la BD dice `active`, aquí se distingue «Por vencer» y lo ya vencido. */
export function estadoAutorizacion(a: AutorizacionMinima, ahora: Date = new Date()): EstadoAutorizacion {
  if (a.status === 'revoked') return 'revocada';
  if (a.status === 'expired') return 'vencida';
  const dias = diasParaVencer(a.expires_at, ahora);
  if (dias !== null && dias <= 0) return 'vencida';
  if (dias !== null && dias <= DIAS_PARA_RENOVAR) return 'porVencer';
  return 'activa';
}

/** «Renovar» solo en una autorización activa que vence en 7 días o menos (y aún no venció). */
export function puedeRenovar(a: AutorizacionMinima, ahora: Date = new Date()): boolean {
  return estadoAutorizacion(a, ahora) === 'porVencer';
}

/** «Revocar» en toda autorización vigente. */
export function puedeRevocar(a: AutorizacionMinima, ahora: Date = new Date()): boolean {
  const estado = estadoAutorizacion(a, ahora);
  return estado === 'activa' || estado === 'porVencer';
}

// ---------------------------------------------------------------------------
// Bancos y cuentas conectadas
// ---------------------------------------------------------------------------

export interface LinkBanco {
  id: string;
  institution_name: string | null;
  status: string | null;
  last_sync_at: string | null;
}

export interface CuentaBanco {
  id: string;
  link_id: string;
  bank_account_id: number | null;
  account_number: string | null;
  account_type: string | null;
  currency: string | null;
  is_active: boolean;
  last_balance: number | null;
  last_balance_at: string | null;
}

export interface CuentaGoAdmin {
  id: number;
  name: string | null;
  account_number: string | null;
  account_code: string | null;
}

export type EstadoCuentaConectada = 'activa' | 'sinVincular' | 'fallo';

export interface FilaCuentaConectada {
  id: string;
  linkId: string;
  banco: string;
  tipoCuenta: string | null;
  numeroCorto: string | null;
  cuentaGoId: number | null;
  cuentaGo: { nombre: string | null; numeroCorto: string | null; codigo: string | null } | null;
  saldo: number | null;
  moneda: string | null;
  ultimaSincronizacion: string | null;
  estado: EstadoCuentaConectada;
}

/** Los cuatro últimos dígitos («··4321»); null si no hay número. */
export function numeroCorto(numero: string | null | undefined): string | null {
  const digitos = (numero ?? '').replace(/\D/g, '');
  return digitos.length >= 4 ? `··${digitos.slice(-4)}` : null;
}

/** Bancos que cuentan como conectados: los que no se revocaron ni vencieron. */
export function esLinkConectado(l: Pick<LinkBanco, 'status'>): boolean {
  return l.status === 'active' || l.status === 'error';
}

/**
 * Una fila por cuenta del banco. «Falló» manda sobre «Sin vincular»: si el
 * banco no respondió, eso es lo primero que hay que resolver.
 */
export function filasCuentasConectadas(
  links: readonly LinkBanco[],
  cuentas: readonly CuentaBanco[],
  cuentasGo: readonly CuentaGoAdmin[],
): FilaCuentaConectada[] {
  const porLink = new Map(links.filter(esLinkConectado).map((l) => [l.id, l]));
  const porCuentaGo = new Map(cuentasGo.map((c) => [c.id, c]));
  const filas: FilaCuentaConectada[] = [];
  for (const c of cuentas) {
    const link = porLink.get(c.link_id);
    if (!link || !c.is_active) continue;
    const go = c.bank_account_id !== null ? porCuentaGo.get(c.bank_account_id) ?? null : null;
    const estado: EstadoCuentaConectada =
      link.status === 'error' ? 'fallo' : c.bank_account_id === null ? 'sinVincular' : 'activa';
    filas.push({
      id: c.id,
      linkId: c.link_id,
      banco: (link.institution_name ?? '').trim() || '—',
      tipoCuenta: c.account_type,
      numeroCorto: numeroCorto(c.account_number),
      cuentaGoId: c.bank_account_id,
      cuentaGo: go ? { nombre: go.name, numeroCorto: numeroCorto(go.account_number), codigo: go.account_code } : null,
      saldo: c.last_balance === null || c.last_balance === undefined ? null : Number(c.last_balance),
      moneda: c.currency,
      ultimaSincronizacion: link.last_sync_at,
      estado,
    });
  }
  return filas.sort((a, b) => a.banco.localeCompare(b.banco, 'es') || (a.numeroCorto ?? '').localeCompare(b.numeroCorto ?? ''));
}

export interface CifrasConexion {
  bancosConectados: number;
  cuentasVinculadas: number;
}

export function cifrasConexion(links: readonly LinkBanco[], filas: readonly FilaCuentaConectada[]): CifrasConexion {
  return {
    bancosConectados: links.filter(esLinkConectado).length,
    cuentasVinculadas: filas.filter((f) => f.cuentaGoId !== null).length,
  };
}

/** Bancos que fallaron en la última sincronización (banda roja bajo la tabla). */
export function bancosConFallo(links: readonly LinkBanco[]): string[] {
  return links
    .filter((l) => l.status === 'error')
    .map((l) => (l.institution_name ?? '').trim())
    .filter(Boolean);
}

/** La sincronización más reciente entre los bancos conectados. */
export function ultimaSincronizacion(links: readonly LinkBanco[]): string | null {
  let max: string | null = null;
  for (const l of links) {
    if (!esLinkConectado(l) || !l.last_sync_at) continue;
    if (!max || new Date(l.last_sync_at).getTime() > new Date(max).getTime()) max = l.last_sync_at;
  }
  return max;
}
