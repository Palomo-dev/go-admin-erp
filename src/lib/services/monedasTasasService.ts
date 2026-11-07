/**
 * Monedas y tasas de la organización (Finanzas › Monedas y tasas). Navegador:
 * sesión del usuario con RLS. Tablas y columnas verificadas por MCP el
 * 2026-11-07 (proyecto taqjemqjtumhwptchcxk).
 *
 * - Las escrituras de monedas van por las RPC de la migración
 *   20260928145431 (permiso resuelto en la base con `fn_finanzas_exigir_permiso`).
 *   La moneda base se cambia en `CurrencyPreferences.tsx` (lo fija
 *   src/__tests__/seguridad/gosecMonedasOrganizacion.test.ts).
 * - `currency_rates` es el catálogo GLOBAL (solo lectura para las organizaciones).
 * - `exchange_rates` es de la organización; la tasa manual se escribe SOLO por
 *   `fn_finanzas_registrar_tasa_manual` (migración 20261107180000, aplicada
 *   el 2026-11-07): guarda autor y motivo y exige el permiso en la base.
 *
 * La lógica de cruce y de «la manual manda» está en
 * `src/components/finanzas/monedas/tasasLogica.ts`.
 */
import { supabase } from '@/lib/supabase/config';
import type { TasaCatalogo, TasaManualFila } from '@/lib/finanzas/monedas/tasasLogica';
import { nombrePerfil } from '@/lib/finanzas/monedas/tasasLogica';

export interface MonedaOrganizacion {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  is_base: boolean;
  /** `organization_currencies.auto_update`: la tasa sale del catálogo de GO Admin. */
  automatica: boolean;
}

export interface MonedaCatalogo {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
}

interface FilaMonedaRpc {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  auto_update: boolean | null;
  is_base: boolean | null;
  org_auto_update: boolean | null;
}

const limpiar = (c: string) => (c ?? '').trim().toUpperCase();

export async function listarMonedasOrganizacion(organizationId: number): Promise<MonedaOrganizacion[]> {
  const { data, error } = await supabase.rpc('get_organization_currencies', { p_organization_id: organizationId });
  if (error) throw error;
  return ((data ?? []) as FilaMonedaRpc[]).map((m) => ({
    code: limpiar(m.code),
    name: m.name,
    symbol: m.symbol,
    decimals: m.decimals,
    is_base: !!m.is_base,
    automatica: (m.org_auto_update ?? m.auto_update ?? true) !== false,
  }));
}

/** Monedas del catálogo que la organización aún no tiene. */
export async function listarMonedasDisponibles(organizationId: number): Promise<MonedaCatalogo[]> {
  const { data, error } = await supabase.rpc('get_currency_templates', { p_organization_id: organizationId });
  if (error) throw error;
  return ((data ?? []) as MonedaCatalogo[]).map((m) => ({ ...m, code: limpiar(m.code) }));
}

export async function agregarMonedaOrganizacion(organizationId: number, code: string, automatica: boolean): Promise<void> {
  const { error } = await supabase.rpc('add_organization_currency', {
    p_organization_id: organizationId,
    p_currency_code: code,
    p_is_base: false,
    p_auto_update: automatica,
  });
  if (error) throw error;
}

export async function quitarMonedaOrganizacion(organizationId: number, code: string): Promise<void> {
  const { error } = await supabase.rpc('remove_organization_currency', {
    p_organization_id: organizationId,
    p_currency_code: code,
  });
  if (error) throw error;
}

export async function cambiarTasaAutomatica(organizationId: number, code: string, automatica: boolean): Promise<void> {
  // Una sola sobrecarga desde 20260928145431.
  const { error } = await supabase.rpc('set_currency_auto_update', {
    p_currency_code: code,
    p_auto_update: automatica,
    p_org_id: organizationId,
  });
  if (error) throw error;
}

/** Catálogo global de `codigos` entre dos días (incluidos). */
export async function leerTasasCatalogo(codigos: readonly string[], desde: string, hasta: string): Promise<TasaCatalogo[]> {
  // USD siempre: el catálogo es base USD y el cruce lo necesita.
  const lista = [...new Set([...codigos.map(limpiar), 'USD'])];
  const { data, error } = await supabase
    .from('currency_rates')
    .select('code, rate, rate_date, created_at')
    .in('code', lista)
    .gte('rate_date', desde)
    .lte('rate_date', hasta)
    .order('rate_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TasaCatalogo[];
}

/**
 * Tasas manuales de la organización entre dos días. `select('*')`: las
 * columnas `created_by` y `reason` llegan con la migración 20261107180000;
 * sin ella la lectura sigue funcionando y el autor sale vacío.
 */
export async function leerTasasManuales(organizationId: number, desde: string, hasta: string): Promise<TasaManualFila[]> {
  const { data, error } = await supabase
    .from('exchange_rates')
    .select('*')
    .eq('organization_id', organizationId)
    .gte('effective_date', desde)
    .lte('effective_date', hasta)
    .order('effective_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TasaManualFila[];
}

/** Nombres de quienes registraron tasas (perfiles visibles para miembros de la organización). */
export async function leerNombresAutores(ids: readonly string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter(Boolean))];
  const mapa = new Map<string, string>();
  if (unicos.length === 0) return mapa;
  const { data, error } = await supabase.from('profiles').select('id, first_name, last_name, email').in('id', unicos);
  if (error) return mapa;
  for (const p of data ?? []) {
    const nombre = nombrePerfil(p);
    if (nombre) mapa.set(p.id as string, nombre);
  }
  return mapa;
}

export interface TasaManualNueva {
  moneda: string;
  /** Día `YYYY-MM-DD` de la organización. */
  fecha: string;
  /** 1 `moneda` = `tasa` moneda base. */
  tasa: number;
  motivo: string;
}

/** Registra (o reemplaza) la tasa manual de un día. No recalcula documentos ya contabilizados. */
export async function registrarTasaManual(organizationId: number, tasa: TasaManualNueva): Promise<void> {
  const { error } = await supabase.rpc('fn_finanzas_registrar_tasa_manual', {
    p_org: organizationId,
    p_moneda: tasa.moneda,
    p_fecha: tasa.fecha,
    p_tasa: tasa.tasa,
    p_motivo: tasa.motivo,
  });
  if (error) throw error;
}
