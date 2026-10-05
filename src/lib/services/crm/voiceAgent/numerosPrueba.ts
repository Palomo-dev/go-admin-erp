/**
 * Números de prueba internos del agente de voz (2026-09-30).
 *
 * Un número de prueba es un número del PROPIO equipo de la organización, con su
 * consentimiento, que se usa para probar el agente. Lo ÚNICO que exime es el
 * tope semanal de la Ley 2300 de 2023 (`evaluarTopeSemanal`): sin la exención,
 * quien prueba el agente con su celular queda bloqueado hasta el lunes.
 *
 * NO exime de: la franja horaria legal (L-V 7–19, sáb 8–15, nunca domingos ni
 * festivos), la lista de excluidos de la organización (`crm_excluded_numbers`),
 * la baja voluntaria (`fn_can_contact`), los topes diarios/horarios
 * del agente y de la campaña, el tope diario por cliente, la concurrencia ni
 * los créditos. La campaña no exige el RNE. La exención se aplica en UN punto:
 * `evaluarLey2300Cliente`
 * (`cumplimiento.ts`), por donde pasan el despacho de campañas y el puntual.
 *
 * Datos en `crm_voice_test_numbers` (migración 20260930235500_voz_numeros_prueba):
 * RLS por organización; solo sus administradores agregan y dan de baja, siempre
 * a su nombre; baja lógica (`removed_at`/`removed_by`) para conservar quién
 * agregó y quitó cada número; máximo 10 vigentes (trigger con candado).
 *
 * Módulo ligero (sin Next ni navegador): lo carga también el servidor de voz.
 * Las funciones reciben el cliente ya acotado a una organización validada; la
 * ruta usa el de la SESIÓN, así que la RLS vuelve a comprobar el permiso.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizarNumeroRne } from './rne';

/** Tope de números de prueba vigentes por organización (lo impone también la base). */
export const MAX_NUMEROS_PRUEBA = 10;
/** Largo máximo de la etiqueta (CHECK de la columna). */
export const MAX_ETIQUETA_NUMERO_PRUEBA = 80;

/** Marca que queda en `calls.metadata.ley2300_exencion` cuando se usó la exención. */
export const EXENCION_NUMERO_PRUEBA = 'numero_prueba' as const;

export interface NumeroPrueba {
  id: string;
  phone_e164: string;
  label: string | null;
  created_by: string;
  created_at: string;
}

export class NumeroPruebaError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'NumeroPruebaError';
    this.statusCode = statusCode;
  }
}

/**
 * Normaliza a E.164 con el MISMO criterio que el despachador aplica al teléfono
 * del cliente (`normalizarNumeroRne`): así un número guardado aquí coincide con
 * el que se va a marcar. `null` si no es un número marcable.
 */
export function normalizarNumeroPrueba(raw: unknown): string | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  return normalizarNumeroRne(String(raw));
}

/**
 * ¿El número es un número de prueba vigente de la organización?
 *
 * Un error de lectura cuenta como «no» y se registra: sin la exención se aplica
 * el tope semanal, que es la opción más restrictiva (falla cerrado respecto a
 * la ley, sin tumbar el despacho de los demás números).
 */
export async function esNumeroPrueba(supabase: SupabaseClient, orgId: number, telefonoE164: string | null | undefined): Promise<boolean> {
  if (!telefonoE164) return false;
  try {
    const { data, error } = await supabase.rpc('fn_voz_es_numero_prueba', { p_org: orgId, p_phone: telefonoE164 });
    if (error) {
      console.warn('[voz] no se pudo consultar los números de prueba; se aplica el tope semanal', { org: orgId, error: error.message });
      return false;
    }
    return data === true;
  } catch (err) {
    console.warn('[voz] la consulta de números de prueba lanzó; se aplica el tope semanal', {
      org: orgId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

const COLUMNAS = 'id, phone_e164, label, created_by, created_at';

/** Números de prueba vigentes de la organización, del más reciente al más antiguo. */
export async function listarNumerosPrueba(supabase: SupabaseClient, orgId: number): Promise<NumeroPrueba[]> {
  const { data, error } = await supabase
    .from('crm_voice_test_numbers')
    .select(COLUMNAS)
    .eq('organization_id', orgId)
    .is('removed_at', null)
    .order('created_at', { ascending: false })
    .limit(MAX_NUMEROS_PRUEBA);
  if (error) throw new NumeroPruebaError(`No se pudieron leer los números de prueba: ${error.message}`, 500);
  return (data ?? []) as NumeroPrueba[];
}

/** Agrega un número de prueba a nombre de `userId`. */
export async function agregarNumeroPrueba(
  supabase: SupabaseClient,
  orgId: number,
  userId: string,
  entrada: { phone: unknown; label?: unknown }
): Promise<NumeroPrueba> {
  const phone = normalizarNumeroPrueba(entrada.phone);
  if (!phone) {
    throw new NumeroPruebaError('Número inválido. Usa el formato internacional, por ejemplo +57 300 000 0000.');
  }
  let label: string | null = null;
  if (entrada.label !== undefined && entrada.label !== null) {
    if (typeof entrada.label !== 'string') throw new NumeroPruebaError('Etiqueta inválida.');
    label = entrada.label.trim() || null;
    if (label && label.length > MAX_ETIQUETA_NUMERO_PRUEBA) {
      throw new NumeroPruebaError(`La etiqueta admite como máximo ${MAX_ETIQUETA_NUMERO_PRUEBA} caracteres.`);
    }
  }

  const { data, error } = await supabase
    .from('crm_voice_test_numbers')
    .insert({ organization_id: orgId, phone_e164: phone, label, created_by: userId })
    .select(COLUMNAS)
    .single();
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === '23505') throw new NumeroPruebaError('Ese número ya está en la lista de prueba.', 409);
    if (code === 'P0001') throw new NumeroPruebaError(`Máximo ${MAX_NUMEROS_PRUEBA} números de prueba por organización.`, 409);
    if (code === '42501') throw new NumeroPruebaError('Solo un administrador puede gestionar los números de prueba.', 403);
    throw new NumeroPruebaError(`No se pudo agregar el número: ${error.message}`, 500);
  }
  console.info('[voz] número de prueba agregado', { org: orgId, id: (data as NumeroPrueba).id, por: userId });
  return data as NumeroPrueba;
}

/** Da de baja (lógica) un número de prueba a nombre de `userId`. */
export async function quitarNumeroPrueba(supabase: SupabaseClient, orgId: number, userId: string, id: string): Promise<void> {
  const { data, error } = await supabase
    .from('crm_voice_test_numbers')
    // `removed_at` lo fija el trigger con la hora del servidor; se manda para
    // cumplir el CHECK de consistencia de la baja.
    .update({ removed_at: new Date().toISOString(), removed_by: userId })
    .eq('organization_id', orgId)
    .eq('id', id)
    .is('removed_at', null)
    .select('id');
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === '42501') throw new NumeroPruebaError('Solo un administrador puede gestionar los números de prueba.', 403);
    throw new NumeroPruebaError(`No se pudo quitar el número: ${error.message}`, 500);
  }
  if (!Array.isArray(data) || data.length === 0) throw new NumeroPruebaError('Número de prueba no encontrado.', 404);
  console.info('[voz] número de prueba dado de baja', { org: orgId, id, por: userId });
}
