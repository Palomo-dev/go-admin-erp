/**
 * Cliente (navegador) de la sincronización del catálogo global de tasas.
 *
 * No habla con OpenExchangeRates ni escribe `currency_rates`: pide al servidor
 * que lo haga. La ruta exige administrador de la PLATAFORMA (el catálogo es de
 * todas las organizaciones); para cualquier otro usuario responde 403 y el
 * mensaje del servidor se muestra tal cual. Las organizaciones leen el catálogo;
 * el cron diario lo mantiene.
 */

export type ModoSincronizacion = 'hoy' | 'faltantes';

export interface ResultadoSincronizacionCliente {
  success: boolean;
  updated_count?: number;
  base_currency?: string;
  timestamp?: number;
  message?: string;
}

export const RUTA_SINCRONIZAR_TASAS = '/api/finanzas/tasas-cambio/sincronizar';

export async function sincronizarTasasDeCambio(modo: ModoSincronizacion = 'hoy'): Promise<ResultadoSincronizacionCliente> {
  const respuesta = await fetch(RUTA_SINCRONIZAR_TASAS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ modo }),
  });
  const cuerpo = (await respuesta.json().catch(() => ({}))) as ResultadoSincronizacionCliente & { error?: string };
  if (!respuesta.ok) {
    throw new Error(cuerpo.error || cuerpo.message || `HTTP ${respuesta.status}`);
  }
  return { ...cuerpo, success: cuerpo.success !== false };
}
