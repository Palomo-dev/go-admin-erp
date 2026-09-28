/**
 * Catálogo global de tasas de cambio: zona del catálogo, guardado y moneda base.
 *
 * GO-sec (2026-09-28): la llamada a OpenExchangeRates y la sincronización se
 * movieron a `tasasCambio.server.ts` (solo servidor, clave
 * `OPENEXCHANGERATES_API_KEY`). Este módulo lo importan componentes de cliente:
 * aquí no puede haber ninguna clave ni ninguna llamada a la API del proveedor.
 * El navegador pide la sincronización a `/api/finanzas/tasas-cambio/sincronizar`
 * (`tasasCambioCliente.ts`), que exige administrador de plataforma.
 *
 * Tablas:
 * - currencies: Catálogo global de monedas
 * - organization_currencies: Relación organización-moneda con flags
 * - currency_rates: Tasas de cambio históricas
 * - exchange_rates_logs: Registro de actualizaciones
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { toPlainDate, todayInTz } from '@/lib/utils/timezone';

// ============================================================
// Fase B, tanda 10 — ADR-004: el catalogo de tasas se queda con el dia del
// sistema, a proposito.
//
// `currency_rates` NO tiene `organization_id` ni `branch_id` (verificado en
// `information_schema.columns`): es un catalogo global compartido. No existe
// "la organizacion" de una tasa de cambio, asi que aqui NO se resuelve ninguna
// zona de organizacion. Si dos organizaciones en husos distintos escribieran su
// propio dia, la clave `(code, rate_date)` tendria dos verdades para el mismo
// instante y ganaria la ultima en escribir: peor que el defecto que se corrige.
//
// Lo que si cambia es que el dia deja de salir de `toISOString()` —que daba el
// dia UTC, o peor, el dia del NAVEGADOR restando `getTimezoneOffset()`— y pasa
// a salir de una zona con nombre, la misma que usa la base.
// ============================================================

/**
 * Zona horaria de sistema del catalogo global de tasas. Gemelo en el cliente de
 * `fn_today_system()` en Postgres, que es literalmente
 * `(now() AT TIME ZONE 'America/Bogota')::date` y es el `DEFAULT` de
 * `currency_rates.rate_date`.
 *
 * NO es un fallback ni la zona de ninguna organizacion: es la zona del SaaS.
 * La regla 6 de `docs/reglas-fechas-timezone.md` prohibe cablear la zona de una
 * organizacion; esta no lo es, y ADR-004 la autoriza explicitamente. Si
 * `fn_today_system()` cambia, esta constante cambia con ella o el catalogo
 * queda con dos criterios de dia dentro de la misma tabla.
 */
export const ZONA_DEL_CATALOGO_GLOBAL = 'America/Bogota';

/**
 * Guarda las tasas obtenidas en la base de datos mediante RPC
 * @param rates - Objeto con las tasas de cambio
 * @param date - Fecha de las tasas (opcional)
 * @param source - Fuente de los datos (por defecto: openexchangerates)
 * @param api_timestamp - Timestamp de la API (opcional)
 * @param base_currency_code - Código de moneda base (por defecto: USD)
 * @returns Resultado de la operación
 */
export async function guardarTasasDeCambio(
  rates: Record<string, number>,
  date?: Date,
  source: string = 'openexchangerates',
  api_timestamp?: number,
  base_currency_code: string = 'USD',
  client?: SupabaseClient
) {
  // Quien escribe es el servidor con service role (cron o ruta de plataforma):
  // desde 20260928150534 la RLS de `currency_rates` no deja escribir a ningún
  // usuario. El cliente de sesión por defecto solo sirve a las pruebas.
  const supabase = client ?? (await import('@/lib/supabase/config')).supabase;
  
  try {
    // Dia del catalogo (ADR-004): zona del sistema, nunca la del navegador.
    // Lo anterior era `date.getTime() - date.getTimezoneOffset() * 60000` y
    // luego `toISOString()`, es decir el dia de la maquina de quien pulsaba el
    // boton: dos administradores en husos distintos guardaban la misma tanda de
    // tasas bajo dos `rate_date` diferentes.
    const formattedDate = date ? toPlainDate(date, ZONA_DEL_CATALOGO_GLOBAL) : undefined;

    console.log('Guardando tasas con moneda base:', base_currency_code, 'para fecha:', formattedDate || 'hoy');

    // Validar que tenemos todos los parámetros necesarios
    const finalDate = formattedDate || todayInTz(ZONA_DEL_CATALOGO_GLOBAL);
    const finalTimestamp = api_timestamp || Math.floor(Date.now() / 1000);
    
    // Ir directamente a la inserción en la tabla ya que la función RPC está desactualizada
    // y hace referencia a tablas que ya no existen (currency_templates)
    
    // Insertamos directamente en la tabla currency_rates
    console.log('Insertando datos en la tabla currency_rates');
    
    // Preparar lote de registros para insertar
    const records = Object.entries(rates).map(([code, rate]) => ({
      code,
      rate_date: finalDate,
      rate: rate.toString(),
      source,
      base_currency_code,
      api_data: {
        base: base_currency_code,
        code,
        rate,
        timestamp: finalTimestamp
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));
    
    // Usamos upsert en lugar de delete + insert para evitar errores de duplicados
    // La operación upsert actualizará registros existentes o insertará nuevos
    // definimos los campos que conforman la clave única
    const onConflict = 'code,rate_date';
    
    // Insertamos los nuevos registros en lotes de 10 para evitar límites
    const batchSize = 10;
    let inserted = 0;
    
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      
      // Utilizamos upsert para manejar los registros existentes
      const { error: upsertError, data: upsertData } = await supabase
        .from('currency_rates')
        .upsert(batch, { onConflict, ignoreDuplicates: false })
        .select();
      
      if (upsertError) {
        console.error(`Error al actualizar lote ${i/batchSize + 1}:`, upsertError);
      } else {
        // Actualizamos contador
        if (upsertData) {
          inserted += upsertData.length;
          console.log(`Lote ${i/batchSize + 1}: ${upsertData.length} registros procesados`);
        }
      }
    }
    
    console.log(`Actualización completada: ${inserted} de ${records.length} registros procesados (insertados o actualizados)`);
    
    // Devolver formato similar al de la función RPC para mantener compatibilidad
    return {
      success: true,
      message: 'Tasas de cambio actualizadas exitosamente',
      updated_count: inserted,
      skipped_count: records.length - inserted,
      base_currency_code
    };
  } catch (error: unknown) {
    console.error('Error al guardar tasas en la base de datos:', error);
    throw new Error(`No se pudieron guardar las tasas: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Obtiene la moneda base de una organización con su fila del catálogo
 * `currencies`. Delegado en la fuente única `resolveOrgCurrency`
 * (`src/lib/services/monedaOrganizacion.ts`), que aplica la cadena de
 * respaldo: is_base → preferencia → USD asignado → primera asignada → moneda
 * del país → USD.
 *
 * @param orgId - ID de la organización
 * @returns Información de la moneda base y su origen (`tipo` = `source`)
 */
export async function obtenerMonedaBase(orgId: number) {
  const { supabase } = await import('@/lib/supabase/config');
  const { resolveOrgCurrency } = await import('@/lib/services/monedaOrganizacion');

  if (!orgId || isNaN(orgId)) {
    throw new Error(`ID de organización inválido: ${orgId}`);
  }

  const resuelta = await resolveOrgCurrency(supabase, orgId);
  const { data: detalle } = await supabase
    .from('currencies')
    .select('*')
    .eq('code', resuelta.code)
    .maybeSingle();

  return {
    moneda: {
      ...(detalle ?? { code: resuelta.code, symbol: resuelta.symbol, decimals: resuelta.decimals }),
      is_base: resuelta.source === 'base',
    },
    tipo: resuelta.source,
  };
}
