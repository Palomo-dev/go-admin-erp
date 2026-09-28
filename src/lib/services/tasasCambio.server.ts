/**
 * Sincronización del catálogo GLOBAL de tasas (`currency_rates`) con
 * OpenExchangeRates. SOLO SERVIDOR.
 *
 * GO-sec (2026-09-28): antes esto vivía en `openexchangerates.ts`, se ejecutaba
 * en el navegador con la variable pública (prefijo NEXT_PUBLIC_) de la clave (quedaba
 * en el bundle público y en el instalador del escritorio) y escribía el
 * catálogo con la sesión del usuario, gracias a una RLS que dejaba insertar a
 * cualquier admin de cualquier organización. Ahora:
 *   - la clave es `OPENEXCHANGERATES_API_KEY`, variable de servidor;
 *   - escribe el cliente que se recibe, que es siempre service role: el cron
 *     (`/api/cron/update-exchange-rates`, `verifyCronSecret`) o la ruta de
 *     plataforma (`/api/finanzas/tasas-cambio/sincronizar`, `withPlatformAdmin`);
 *   - la RLS de `currency_rates` ya no tiene políticas de escritura
 *     (migración 20260928150534_gosec_catalogo_tasas_solo_plataforma).
 *
 * El guardado (`guardarTasasDeCambio`) y la zona del catálogo siguen en
 * `openexchangerates.ts`: el día es el del sistema (ADR-004).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { assertServerOnly } from '@/lib/supabase/server-service';
import { guardarTasasDeCambio, ZONA_DEL_CATALOGO_GLOBAL } from '@/lib/services/openexchangerates';
import { addPlainDays, nextPlainDay, todayInTz } from '@/lib/utils/timezone';

const API = 'https://openexchangerates.org/api';

export interface RespuestaTasas {
  base: string;
  timestamp: number;
  rates: Record<string, number>;
}

export interface ResultadoSincronizacion {
  success: boolean;
  timestamp?: number;
  updated_count?: number;
  base_currency?: string;
  message?: string;
}

/** Clave de servidor. Nunca `NEXT_PUBLIC_`: lo vigila src/__tests__/guardrails.test.ts. */
function claveOpenExchangeRates(): string {
  assertServerOnly();
  const clave = process.env.OPENEXCHANGERATES_API_KEY;
  if (!clave) throw new Error('OPENEXCHANGERATES_API_KEY no está configurada en el servidor');
  return clave;
}

async function pedir(ruta: string, intento = 1): Promise<RespuestaTasas> {
  const url = `${API}/${ruta}${ruta.includes('?') ? '&' : '?'}app_id=${encodeURIComponent(claveOpenExchangeRates())}`;
  let respuesta: Response;
  try {
    respuesta = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json', 'User-Agent': 'GO-Admin-ERP/1.0' },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    if (intento < 3) {
      await new Promise((r) => setTimeout(r, 2000));
      return pedir(ruta, intento + 1);
    }
    throw err;
  }
  if (!respuesta.ok) {
    // Nunca se registra la URL: lleva la clave.
    throw new Error(`OpenExchangeRates respondió ${respuesta.status} ${respuesta.statusText}`);
  }
  const datos = (await respuesta.json()) as Partial<RespuestaTasas>;
  if (!datos || typeof datos.rates !== 'object' || datos.rates === null || typeof datos.timestamp !== 'number') {
    throw new Error('Respuesta de OpenExchangeRates sin tasas');
  }
  return { base: datos.base ?? 'USD', timestamp: datos.timestamp, rates: datos.rates as Record<string, number> };
}

/** Tasas actuales, base USD (el plan de la API solo admite USD como base). */
export function obtenerTasasActuales(): Promise<RespuestaTasas> {
  return pedir('latest.json');
}

/** Tasas históricas de un día `YYYY-MM-DD`, base USD. */
export function obtenerTasasHistoricas(fecha: string): Promise<RespuestaTasas> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error(`Fecha inválida: ${fecha}`);
  return pedir(`historical/${fecha}.json`);
}

async function registrar(db: SupabaseClient, exito: boolean, detalle: Record<string, unknown>, error: string | null) {
  const { error: logError } = await db.rpc('log_exchange_rates_execution', {
    p_execution_date: new Date().toISOString(),
    p_success: exito,
    p_error_message: error,
    p_organizations_total: 0,
    p_organizations_success: 0,
    p_organizations_error: 0,
    p_details: [detalle],
  });
  if (logError) console.warn('[tasasCambio] no se pudo registrar la ejecución:', logError.message);
}

/**
 * Descarga las tasas de hoy y las guarda para las monedas del catálogo con
 * `auto_update`. `db` tiene que ser service role.
 */
export async function actualizarTasasDeCambioGlobal(db: SupabaseClient): Promise<ResultadoSincronizacion> {
  assertServerOnly();
  try {
    const datos = await obtenerTasasActuales();
    const { data: monedas, error } = await db.from('currencies').select('code').eq('auto_update', true);
    if (error) throw new Error(`Error al obtener monedas activas: ${error.message}`);
    if (!monedas || monedas.length === 0) throw new Error('No hay monedas con auto_update en el catálogo');

    const filtradas: Record<string, number> = {};
    for (const { code } of monedas as Array<{ code: string }>) {
      const codigo = code.trim();
      if (codigo === 'USD') filtradas[codigo] = 1;
      else if (datos.rates[codigo]) filtradas[codigo] = datos.rates[codigo];
    }

    const resultado = await guardarTasasDeCambio(
      filtradas,
      new Date(datos.timestamp * 1000),
      'openexchangerates',
      datos.timestamp,
      'USD',
      db,
    );
    const actualizadas = resultado.updated_count || 0;
    await registrar(db, true, { operation: 'global_update', rates_updated: actualizadas, base_currency: 'USD', currencies_total: monedas.length }, null);
    return {
      success: true,
      timestamp: datos.timestamp,
      updated_count: actualizadas,
      base_currency: 'USD',
      message: `Tasas de cambio actualizadas. Total: ${actualizadas} registros`,
    };
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    await registrar(db, false, { operation: 'global_update', error: mensaje }, mensaje);
    throw err;
  }
}

/**
 * Rellena, con datos históricos reales, los días de los últimos 15 (sin
 * domingos) que no tienen tasas de OpenExchangeRates. `db` tiene que ser
 * service role.
 */
export async function llenarFechasFaltantesConDatosReales(db: SupabaseClient): Promise<{
  success: boolean;
  fechas_encontradas: number;
  fechas_llenadas: number;
  errores: string[];
  message: string;
}> {
  assertServerOnly();
  const hoy = todayInTz(ZONA_DEL_CATALOGO_GLOBAL);
  const fechas: string[] = [];
  for (let fecha = addPlainDays(hoy, -15); fecha <= hoy; fecha = nextPlainDay(fecha)) {
    if (new Date(`${fecha}T00:00:00Z`).getUTCDay() !== 0) fechas.push(fecha);
  }
  const { data: existentes, error } = await db
    .from('currency_rates')
    .select('rate_date')
    .in('rate_date', fechas)
    .like('source', '%openexchangerates%');
  if (error) throw new Error(`Error consultando fechas existentes: ${error.message}`);
  const conDatos = new Set((existentes ?? []).map((f: { rate_date: string }) => f.rate_date));
  const faltantes = fechas.filter((f) => !conDatos.has(f));

  let llenadas = 0;
  const errores: string[] = [];
  for (const fecha of faltantes) {
    try {
      const datos = await obtenerTasasHistoricas(fecha);
      const { error: rpcError } = await db.rpc('update_global_exchange_rates', {
        rates: datos.rates,
        source: 'openexchangerates_historical',
        api_timestamp: datos.timestamp,
        rate_date: fecha,
        base_currency_code: 'USD',
      });
      if (rpcError) errores.push(`${fecha}: ${rpcError.message}`);
      else llenadas++;
      await new Promise((r) => setTimeout(r, 1000));
    } catch (err) {
      errores.push(`${fecha}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return {
    success: true,
    fechas_encontradas: faltantes.length,
    fechas_llenadas: llenadas,
    errores,
    message: `Se llenaron ${llenadas} de ${faltantes.length} fechas con datos reales`,
  };
}
