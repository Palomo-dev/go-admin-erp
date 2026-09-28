/**
 * Pago único: cómo se reparte un monto entre varios documentos abiertos de un
 * mismo tercero. Módulo hoja, sin dependencias (lo usan el diálogo y las pruebas;
 * la RPC `fn_registrar_pago` vuelve a validar todo en la base).
 *
 * Reglas (decisión del dueño, 2026-09-23):
 * - De la más antigua a la más nueva: por vencimiento ascendente (sin vencimiento
 *   al final), desempate por fecha de emisión y por id.
 * - Nunca se aplica a una fila más que su saldo.
 * - El sobrante NO se aplica en silencio: solo va a saldo a favor si el usuario
 *   marca la casilla (`permitirSobrante`). Sin casilla, un monto mayor que la
 *   suma de saldos es un error (`excede`).
 * - Todas las filas deben compartir moneda; si no, `moneda_distinta`.
 *
 * La aritmética va en centavos enteros para no arrastrar errores de coma flotante.
 */

export interface DocumentoAbierto {
  id: string;
  saldo: number;
  moneda: string;
  /** Día calendario `YYYY-MM-DD` (o timestamptz ISO: solo se compara el orden). */
  vencimiento?: string | null;
  emision?: string | null;
}

export interface Aplicacion {
  id: string;
  monto: number;
}

export type ErrorReparto = 'monto_invalido' | 'sin_documentos' | 'moneda_distinta' | 'excede';

export type ResultadoReparto =
  | { ok: true; aplicaciones: Aplicacion[]; aplicado: number; sobrante: number; moneda: string }
  | { ok: false; error: ErrorReparto };

const aCentavos = (n: number): number => Math.round(n * 100);
const deCentavos = (c: number): number => c / 100;

/** Orden FIFO: vencimiento, emisión e id ascendentes; los nulos al final. */
export function ordenarFifo<T extends Pick<DocumentoAbierto, 'id' | 'vencimiento' | 'emision'>>(docs: readonly T[]): T[] {
  const cmp = (a?: string | null, b?: string | null): number => {
    if (a && b) return a < b ? -1 : a > b ? 1 : 0;
    if (a) return -1;
    if (b) return 1;
    return 0;
  };
  return [...docs].sort(
    (x, y) => cmp(x.vencimiento, y.vencimiento) || cmp(x.emision, y.emision) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0),
  );
}

/** Moneda común de los documentos, o `null` si hay más de una. */
export function monedaComun(docs: readonly Pick<DocumentoAbierto, 'moneda'>[]): string | null {
  const monedas = new Set(docs.map((d) => (d.moneda || '').toUpperCase()));
  return monedas.size === 1 ? [...monedas][0] : null;
}

/**
 * Reparte `monto` entre `documentos` de la más antigua a la más nueva.
 * Los documentos con saldo ≤ 0 se ignoran.
 */
export function repartirFifo(
  monto: number,
  documentos: readonly DocumentoAbierto[],
  opciones: { permitirSobrante?: boolean } = {},
): ResultadoReparto {
  if (!Number.isFinite(monto) || monto <= 0) return { ok: false, error: 'monto_invalido' };
  const abiertos = documentos.filter((d) => Number.isFinite(d.saldo) && d.saldo > 0);
  if (abiertos.length === 0) return { ok: false, error: 'sin_documentos' };
  const moneda = monedaComun(abiertos);
  if (!moneda) return { ok: false, error: 'moneda_distinta' };

  let restante = aCentavos(monto);
  const aplicaciones: Aplicacion[] = [];
  for (const doc of ordenarFifo(abiertos)) {
    if (restante <= 0) break;
    const aplicar = Math.min(restante, aCentavos(doc.saldo));
    if (aplicar > 0) {
      aplicaciones.push({ id: doc.id, monto: deCentavos(aplicar) });
      restante -= aplicar;
    }
  }
  if (restante > 0 && !opciones.permitirSobrante) return { ok: false, error: 'excede' };
  const aplicado = aplicaciones.reduce((s, a) => s + aCentavos(a.monto), 0);
  return { ok: true, aplicaciones, aplicado: deCentavos(aplicado), sobrante: deCentavos(restante), moneda };
}

export type ErrorAplicacion = 'monto_invalido' | 'excede_saldo' | 'documento_desconocido' | 'repetido';

/**
 * Valida un reparto editado a mano (monto por fila): cada monto > 0 y ≤ el saldo
 * de su documento, sin filas repetidas. Devuelve el primer error por fila.
 */
export function validarAplicaciones(
  aplicaciones: readonly Aplicacion[],
  documentos: readonly DocumentoAbierto[],
): { ok: true; total: number } | { ok: false; id: string; error: ErrorAplicacion } {
  const porId = new Map(documentos.map((d) => [d.id, d]));
  const vistos = new Set<string>();
  let total = 0;
  for (const a of aplicaciones) {
    if (vistos.has(a.id)) return { ok: false, id: a.id, error: 'repetido' };
    vistos.add(a.id);
    const doc = porId.get(a.id);
    if (!doc) return { ok: false, id: a.id, error: 'documento_desconocido' };
    if (!Number.isFinite(a.monto) || a.monto <= 0) return { ok: false, id: a.id, error: 'monto_invalido' };
    if (aCentavos(a.monto) > aCentavos(doc.saldo)) return { ok: false, id: a.id, error: 'excede_saldo' };
    total += aCentavos(a.monto);
  }
  return { ok: true, total: deCentavos(total) };
}
