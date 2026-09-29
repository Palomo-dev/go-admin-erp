/**
 * Deduplicación CONTRA LA BASE del importador de leads (lógica pura; las
 * consultas viven en `leadsImportLookup.ts`).
 *
 * Una fila coincide con un cliente existente de la organización por, en este
 * orden de precedencia:
 *   1. id externo del MISMO lote (`metadata.importacion.{lote,id_externo}`):
 *      es la clave de idempotencia — un reintento del mismo archivo no duplica;
 *   2. teléfono: el guardado se normaliza con `normalizePhoneDigits` (la regla
 *      de WhatsApp y campañas, que entiende `+57 300…`, `300 123 4567`…) y se
 *      compara con el E.164 de la fila;
 *   3. NIT: dígitos del guardado = NIT, o NIT + DV pegado;
 *   4. correo, sin distinguir mayúsculas.
 */

import { normalizePhoneDigits } from '@/lib/services/crm/phoneNormalize';
import { calcularDv } from '@/lib/utils/nitDv';
import { digitosDe } from './normalizacion';
import type { ClienteExistenteRef, FilaLeadNormalizada } from './tipos';

export interface ClienteCandidato {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  identification_number: string | null;
  /** `metadata.importacion` (solo lote e id externo interesan aquí). */
  importacion?: { lote?: unknown; id_externo?: unknown } | null;
}

/** Escapa un texto para usarlo literal dentro de una expresión regular (JS y Postgres ARE). */
export function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\\-/]/g, '\\$&');
}

/** Patrón (`imatch`) que encuentra un NIT guardado con cualquier separador y con o sin DV pegado. */
export function patronNits(nits: readonly string[]): string {
  return `^\\D*(?:${nits.map((n) => n.split('').join('\\D*')).join('|')})`;
}

/** Patrón (`imatch`) de correos exactos, sin distinguir mayúsculas. */
export function patronCorreos(correos: readonly string[]): string {
  return `^\\s*(?:${correos.map(escaparRegex).join('|')})\\s*$`;
}

function coincideNit(guardado: string | null, nit: string): boolean {
  if (!guardado) return false;
  const g = guardado.replace(/\D/g, '');
  return g === nit || g === `${nit}${calcularDv(nit)}`;
}

/**
 * Cliente existente con el que coincide la fila, o `null`. `indicativo` es el
 * del país por defecto de la importación (`'57'` para CO), para interpretar
 * teléfonos guardados sin indicativo.
 */
export function clienteCoincidente(
  d: Pick<FilaLeadNormalizada, 'idExterno' | 'telefono' | 'nit' | 'correo'>,
  candidatos: readonly ClienteCandidato[],
  lote: string,
  indicativo: string,
): ClienteExistenteRef | null {
  const ref = (c: ClienteCandidato, por: ClienteExistenteRef['por']): ClienteExistenteRef => ({ id: c.id, nombre: c.full_name, por });

  if (d.idExterno) {
    const c = candidatos.find((x) => x.importacion?.lote === lote && String(x.importacion?.id_externo ?? '') === d.idExterno);
    if (c) return ref(c, 'id_externo');
  }
  if (d.telefono) {
    const digitos = digitosDe(d.telefono);
    const c = candidatos.find((x) => !!x.phone && normalizePhoneDigits(x.phone, indicativo) === digitos);
    if (c) return ref(c, 'telefono');
  }
  if (d.nit) {
    const nit = d.nit;
    const c = candidatos.find((x) => coincideNit(x.identification_number, nit));
    if (c) return ref(c, 'nit');
  }
  if (d.correo) {
    const correo = d.correo;
    const c = candidatos.find((x) => (x.email ?? '').trim().toLowerCase() === correo);
    if (c) return ref(c, 'correo');
  }
  return null;
}
