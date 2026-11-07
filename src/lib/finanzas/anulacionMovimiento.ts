/**
 * Estado de un ingreso o egreso de tesorería (Figma 36 · G2), sin React ni Supabase.
 *
 * Anular no borra ni marca la fila: registra un movimiento contrario.
 * - Caja: `cash_movements` con uuid `uuidDeterminista('anulacion:<uuid original>')`, concepto
 *   «ANULACIÓN: …», motivo en `notes` y autor en `user_id` (`movimientosService.cancelMovement`).
 * - Banco: `bank_transactions` con `import_source = 'anulacion'` e `import_id = <uuid original>`,
 *   motivo en `reference` (`fn_movimiento_banco_anular`). La tabla no guarda el autor.
 */

export const PREFIJO_REVERSO = 'ANULACIÓN: ';

export type EstadoMovimiento = 'confirmado' | 'anulado' | 'reverso';

export interface AnulacionMovimiento {
  /** Instante (timestamptz) en que se registró el reverso. */
  fecha: string;
  motivo: string | null;
  /** Nombre de quien anuló; `null` si la fuente no lo guarda (banco) o no se pudo leer. */
  autor: string | null;
}

export function estadoMovimiento(datos: { anulacion: AnulacionMovimiento | null; esReverso?: boolean | null }): EstadoMovimiento {
  if (datos.esReverso) return 'reverso';
  return datos.anulacion ? 'anulado' : 'confirmado';
}

/** Un reverso no se anula ni se duplica; un anulado tampoco («Duplicar» y «Anular» ya no se ofrecen). */
export function accionesPermitidas(estado: EstadoMovimiento): { anular: boolean; duplicar: boolean } {
  const abierto = estado === 'confirmado';
  return { anular: abierto, duplicar: abierto };
}

export function esConceptoReverso(concepto: string | null | undefined): boolean {
  return (concepto ?? '').startsWith(PREFIJO_REVERSO);
}

/**
 * Motivo escrito por el usuario a partir de las notas del reverso: sin la coletilla de la caja
 * cerrada («· Caja original #N cerrada: …») y sin el texto automático «Anulación del movimiento #N».
 */
export function motivoDeNotas(notas: string | null | undefined): string | null {
  let texto = (notas ?? '').trim();
  const corte = texto.indexOf(' · Caja original #');
  if (corte >= 0) texto = texto.slice(0, corte).trim();
  if (!texto || /^Anulación del movimiento #\d+$/.test(texto)) return null;
  return texto;
}

export function nombrePersona(perfil: { first_name?: string | null; last_name?: string | null; email?: string | null } | null | undefined): string | null {
  if (!perfil) return null;
  const nombre = [perfil.first_name, perfil.last_name].map((p) => (p ?? '').trim()).filter(Boolean).join(' ');
  return nombre || (perfil.email ?? '').trim() || null;
}
