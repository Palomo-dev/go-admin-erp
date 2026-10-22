/**
 * Jerarquía del PUC comercial (Decreto 2650 de 1993).
 *
 * Longitudes: clase 1, grupo 2, cuenta 4, subcuenta 6, auxiliar 8,
 * subauxiliar 10 o más, siempre par. El hijo usa el código del padre
 * más el tramo del nivel inmediatamente siguiente: 1435 → 143505 → 14350501.
 */

export type NivelPuc =
  | 'clase'
  | 'grupo'
  | 'cuenta'
  | 'subcuenta'
  | 'auxiliar'
  | 'subauxiliar'
  | 'legacy';

export type NaturalezaPuc = 'debito' | 'credito' | 'orden';

export type TipoCuentaPuc = 'asset' | 'liability' | 'equity' | 'income' | 'expense' | 'order';

const NOMBRES_NIVEL: Record<NivelPuc, string> = {
  clase: 'Clase',
  grupo: 'Grupo',
  cuenta: 'Cuenta',
  subcuenta: 'Subcuenta',
  auxiliar: 'Auxiliar',
  subauxiliar: 'Subauxiliar',
  legacy: 'Anterior',
};

export function nombreNivel(nivel: NivelPuc): string {
  return NOMBRES_NIVEL[nivel];
}

export function esCodigoPuc(codigo: string): boolean {
  if (!/^[0-9]+$/.test(codigo)) return false;
  const n = codigo.length;
  return n === 1 || n === 2 || n === 4 || n === 6 || n === 8 || (n >= 10 && n % 2 === 0);
}

export function nivelDe(codigo: string): NivelPuc {
  if (!esCodigoPuc(codigo)) return 'legacy';
  switch (codigo.length) {
    case 1:
      return 'clase';
    case 2:
      return 'grupo';
    case 4:
      return 'cuenta';
    case 6:
      return 'subcuenta';
    case 8:
      return 'auxiliar';
    default:
      return 'subauxiliar';
  }
}

export function claseDe(codigo: string): number | null {
  const digito = codigo[0];
  if (digito < '1' || digito > '9') return null;
  return Number(digito);
}

export function tipoDeClase(clase: number): TipoCuentaPuc {
  switch (clase) {
    case 1:
      return 'asset';
    case 2:
      return 'liability';
    case 3:
      return 'equity';
    case 4:
      return 'income';
    case 5:
    case 6:
    case 7:
      return 'expense';
    default:
      return 'order';
  }
}

/** Naturaleza de la clase. 8 y 9 son de orden. Las contrapartidas se guardan aparte. */
export function naturalezaPorClase(clase: number): NaturalezaPuc {
  if (clase === 1 || clase === 5 || clase === 6 || clase === 7) return 'debito';
  if (clase === 2 || clase === 3 || clase === 4) return 'credito';
  return 'orden';
}

export function naturalezaDe(codigo: string, explicita?: NaturalezaPuc | null): NaturalezaPuc | null {
  if (explicita) return explicita;
  const clase = claseDe(codigo);
  if (clase == null) return null;
  return naturalezaPorClase(clase);
}

/** Longitud del nivel siguiente. Null si el padre no tiene forma PUC. */
export function longitudSiguiente(longitudPadre: number): number | null {
  if (longitudPadre === 1) return 2;
  if (longitudPadre === 2) return 4;
  if (longitudPadre === 4) return 6;
  if (longitudPadre === 6) return 8;
  if (longitudPadre === 8) return 10;
  if (longitudPadre >= 10 && longitudPadre % 2 === 0) return longitudPadre + 2;
  return null;
}

/** Prefijo que tiene que ser el padre. 2805 → 28, no 21. */
export function prefijoPadre(codigo: string): string | null {
  const esperada = longitudSiguienteInvertida(codigo.length);
  if (esperada == null) return null;
  return codigo.slice(0, esperada);
}

function longitudSiguienteInvertida(longitudHijo: number): number | null {
  if (longitudHijo === 2) return 1;
  if (longitudHijo === 4) return 2;
  if (longitudHijo === 6) return 4;
  if (longitudHijo === 8) return 6;
  if (longitudHijo >= 10 && longitudHijo % 2 === 0) return longitudHijo - 2;
  return null;
}

export type ErrorHijo = 'forma' | 'prefijo' | 'longitud';

/**
 * El hijo empieza por el padre y mide exactamente el nivel siguiente.
 * 21 no es padre de 2805: el padre de una cuenta de 4 dígitos es su grupo.
 */
export function validarHijo(padre: string, hijo: string): ErrorHijo | null {
  if (!esCodigoPuc(hijo) || !esCodigoPuc(padre)) return 'forma';
  const esperada = longitudSiguiente(padre.length);
  if (esperada == null || hijo.length !== esperada) return 'longitud';
  if (prefijoPadre(hijo) !== padre) return 'prefijo';
  return null;
}

/** Primer código libre del nivel siguiente. 1435 con 143505 ocupada → 143506. */
export function siguienteCodigo(padre: string, existentes: readonly string[]): string | null {
  if (!esCodigoPuc(padre)) return null;
  const longitud = longitudSiguiente(padre.length);
  if (longitud == null) return null;
  const sufijo = longitud - padre.length;
  const tope = 10 ** sufijo;
  const usados = new Set<number>();
  for (const codigo of existentes) {
    if (codigo.length !== longitud || !codigo.startsWith(padre) || !/^[0-9]+$/.test(codigo)) continue;
    usados.add(Number(codigo.slice(padre.length)));
  }
  for (let i = 1; i < tope; i++) {
    if (!usados.has(i)) return padre + String(i).padStart(sufijo, '0');
  }
  return null;
}
