/**
 * Línea de redondeo y reversas (hallazgos 4 y 5 de la auditoría del Contador).
 * La base decide; aquí solo se lee lo que guardó y se adelanta en pantalla qué mostrar.
 * Módulo hoja: sin Supabase ni React.
 */

export type ClaveRedondeo = 'redondeo' | 'redondeo_en_contra';

export const MOTIVO_REDONDEO = 'redondeo_sin_cuenta';
export const MOTIVOS_REVERSA = ['linea_sin_cuenta', 'reversa_cuenta_titulo'] as const;

export interface TrazaRedondeo {
  clave: ClaveRedondeo;
  diferencia: number;
  debitos_exactos: number | null;
  creditos_exactos: number | null;
  debitos_en_pesos: number;
  creditos_en_pesos: number;
}

export interface LineaPropuesta {
  cuenta: string;
  descripcion: string | null;
  debito: number;
  credito: number;
}

export interface AsientoPropuesto {
  memo: string | null;
  fecha: string | null;
  clave: ClaveRedondeo;
  diferencia: number;
  lineas: LineaPropuesta[];
}

function numero(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

/** `journal_entry_failures.asiento_propuesto` a su forma de pantalla. Lo que no sea un asiento da null. */
export function leerAsientoPropuesto(crudo: unknown): AsientoPropuesto | null {
  if (!crudo || typeof crudo !== 'object') return null;
  const p = crudo as Record<string, unknown>;
  if (!Array.isArray(p.lineas)) return null;
  return {
    memo: typeof p.memo === 'string' ? p.memo : null,
    fecha: typeof p.fecha === 'string' ? p.fecha : null,
    clave: p.clave === 'redondeo_en_contra' ? 'redondeo_en_contra' : 'redondeo',
    diferencia: numero(p.diferencia),
    lineas: p.lineas.map((l) => {
      const linea = (l ?? {}) as Record<string, unknown>;
      return {
        cuenta: typeof linea.cuenta === 'string' ? linea.cuenta : '',
        descripcion: typeof linea.descripcion === 'string' ? linea.descripcion : null,
        debito: numero(linea.debito),
        credito: numero(linea.credito),
      };
    }),
  };
}

/** A favor falta un crédito; en contra, un débito. La fila «Diferencia» va en ese lado. */
export function ladoDeLaDiferencia(clave: ClaveRedondeo): 'debito' | 'credito' {
  return clave === 'redondeo' ? 'credito' : 'debito';
}

export interface LineaAsiento {
  id: number;
  account_code: string;
  debit: number;
  credit: number;
}

/** Líneas con valor que la reversa no puede copiar: sin cuenta o en una cuenta que hoy es de título. */
export function lineasPorResolver<T extends LineaAsiento>(
  lineas: readonly T[],
  esTitulo: (cuenta: string) => boolean,
): T[] {
  return lineas.filter((l) => {
    const conValor = Number(l.debit) !== 0 || Number(l.credit) !== 0;
    const cuenta = (l.account_code ?? '').trim();
    return conValor && (cuenta === '' || esTitulo(cuenta));
  });
}

/** El servidor exige un auxiliar del mismo título. Sin cuenta, cualquiera de movimiento. */
export function auxiliaresPara<T extends { account_code: string }>(
  cuentaLinea: string,
  deMovimiento: readonly T[],
): T[] {
  const titulo = (cuentaLinea ?? '').trim();
  if (!titulo) return [...deMovimiento];
  return deMovimiento.filter((c) => c.account_code !== titulo && c.account_code.startsWith(titulo));
}

/** Misma cuenta e importe invertido, línea por línea. Si no, hubo un auxiliar. */
export function reversaEsCopiaExacta(
  original: readonly Pick<LineaAsiento, 'account_code' | 'debit' | 'credit'>[],
  reversa: readonly Pick<LineaAsiento, 'account_code' | 'debit' | 'credit'>[],
): boolean {
  const huella = (cuenta: string, d: number, c: number) => `${cuenta}|${Number(d)}|${Number(c)}`;
  const esperadas = original
    .filter((l) => Number(l.debit) !== 0 || Number(l.credit) !== 0)
    .map((l) => huella(l.account_code, l.credit, l.debit))
    .sort();
  const reales = reversa
    .filter((l) => Number(l.debit) !== 0 || Number(l.credit) !== 0)
    .map((l) => huella(l.account_code, l.debit, l.credit))
    .sort();
  return esperadas.length === reales.length && esperadas.every((h, i) => h === reales[i]);
}
