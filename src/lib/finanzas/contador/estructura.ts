/**
 * Estructura y naturaleza del PUC según la hoja del contador.
 * Decreto 2650 de 1993, aplicado bajo NIIF para pymes.
 * Cada naturaleza se hereda del padre y se puede editar; las excepciones mandan.
 */

export type Naturaleza = 'debito' | 'credito';

export const NIVELES_PUC = [
  { nivel: 'clase', digitos: 1 },
  { nivel: 'grupo', digitos: 2 },
  { nivel: 'cuenta', digitos: 4 },
  { nivel: 'subcuenta', digitos: 6 },
  { nivel: 'auxiliar', digitos: 8 },
  { nivel: 'subauxiliar', digitosMinimos: 10 },
] as const;

/** Excepciones de naturaleza. 3610 es débito dentro de la clase 3. */
export const EXCEPCIONES_NATURALEZA: Readonly<Record<string, Naturaleza>> = {
  '1399': 'credito',
  '1592': 'credito',
  '1598': 'credito',
  '3610': 'debito',
  '3710': 'debito',
  '4175': 'debito',
};

const CLASE_DEBITO = new Set(['1', '5', '6', '7', '8']);
const CLASE_CREDITO = new Set(['2', '3', '4', '9']);

export function codigoPuc(valor: string): string {
  const codigo = valor.trim();
  if (!/^\d+$/.test(codigo)) {
    throw new Error('El código PUC es numérico, sin guion');
  }
  const longitud = codigo.length;
  const parValido = longitud === 1 || longitud === 2 || longitud === 4 || longitud === 6 || longitud === 8 || (longitud >= 10 && longitud % 2 === 0);
  if (!parValido) throw new Error('La longitud del código PUC no corresponde a un nivel');
  return codigo;
}

export function nivelDe(codigo: string): (typeof NIVELES_PUC)[number]['nivel'] {
  const longitud = codigoPuc(codigo).length;
  if (longitud === 1) return 'clase';
  if (longitud === 2) return 'grupo';
  if (longitud === 4) return 'cuenta';
  if (longitud === 6) return 'subcuenta';
  if (longitud === 8) return 'auxiliar';
  return 'subauxiliar';
}

/** El padre de una cuenta de 4 dígitos es el grupo (2). 3610 cuelga de 36. */
export function padreDe(codigo: string): string | null {
  const c = codigoPuc(codigo);
  if (c.length === 1) return null;
  if (c.length === 2) return c.slice(0, 1);
  if (c.length === 4) return c.slice(0, 2);
  return c.slice(0, c.length - 2);
}

export function naturalezaDeClase(clase: string): Naturaleza {
  if (CLASE_DEBITO.has(clase)) return 'debito';
  if (CLASE_CREDITO.has(clase)) return 'credito';
  throw new Error('Clase PUC desconocida');
}

/** Naturaleza de la cuenta, con excepciones y los grupos 89 y 99. */
export function naturalezaDe(codigo: string): Naturaleza {
  const c = codigoPuc(codigo);
  const claves = Object.keys(EXCEPCIONES_NATURALEZA).sort((a, b) => b.length - a.length);
  for (const clave of claves) {
    if (c === clave || c.startsWith(clave)) return EXCEPCIONES_NATURALEZA[clave];
  }
  if (c.startsWith('89')) return 'credito';
  if (c.startsWith('99')) return 'debito';
  return naturalezaDeClase(c[0]);
}

/**
 * La cuenta puede traer una naturaleza editada. Si no, usa la propia
 * (excepción exacta) o la del padre. 3610 sigue en débito aunque el padre sea crédito.
 */
export function naturalezaHeredada(
  codigo: string,
  naturalezaPadre: Naturaleza | null,
  editada: Naturaleza | null,
): Naturaleza {
  if (editada) return editada;
  const c = codigoPuc(codigo);
  if (EXCEPCIONES_NATURALEZA[c]) return EXCEPCIONES_NATURALEZA[c];
  if (c.startsWith('89')) return 'credito';
  if (c.startsWith('99')) return 'debito';
  if (naturalezaPadre) return naturalezaPadre;
  return naturalezaDe(c);
}

/** Las clases 8 y 9 son de orden: no entran a los estados financieros. */
export function enEstadosFinancieros(codigo: string): boolean {
  const clase = codigoPuc(codigo)[0];
  return clase !== '8' && clase !== '9';
}

/** Solo el último nivel recibe movimiento. Clase y grupo nunca. */
export function aceptaMovimiento(codigo: string, tieneHijos: boolean): boolean {
  if (codigoPuc(codigo).length < 4) return false;
  return !tieneHijos;
}

/** Con movimientos no se borra: solo se inactiva. */
export function puedeBorrarCuenta(tieneMovimientos: boolean): boolean {
  return !tieneMovimientos;
}

export function puedeInactivarCuenta(): boolean {
  return true;
}

const GRUPOS_TERCERO = ['13', '21', '22', '23', '25', '28'];

/**
 * Tercero obligatorio. La clase 7 no. El grupo 11 es opcional.
 * 2408, 3105 y 3115 sí, igual que las clases 4, 5 y 6.
 */
export function requiereTercero(codigo: string): boolean {
  const c = codigoPuc(codigo);
  const clase = c[0];
  if (clase === '4' || clase === '5' || clase === '6') return true;
  if (c.startsWith('11')) return false;
  if (GRUPOS_TERCERO.some((grupo) => c.startsWith(grupo))) return true;
  if (c.startsWith('2408')) return true;
  if (c.startsWith('3105') || c.startsWith('3115')) return true;
  return false;
}

/** Centro de costo o sede obligatorio en las clases 4, 5, 6 y 7. */
export function requiereCentroCosto(codigo: string): boolean {
  const clase = codigoPuc(codigo)[0];
  return clase === '4' || clase === '5' || clase === '6' || clase === '7';
}

/** Nombres oficiales. 6105 no es el costo de ventas del comercio. */
export const NOMBRES_OFICIALES: Readonly<Record<string, string>> = {
  '1405': 'Materias primas',
  '1435': 'Mercancías no fabricadas por la empresa',
  '2105': 'Bancos nacionales',
  '2205': 'Proveedores nacionales',
  '2404': 'Impuesto de renta',
  '2408': 'IVA por pagar',
  '3605': 'Utilidad del ejercicio',
  '3610': 'Pérdida del ejercicio',
  '4105': 'Agricultura, ganadería, caza y silvicultura',
  '4135': 'Comercio al por mayor y al por menor',
  '4175': 'Devoluciones en ventas',
  '4225': 'Comisiones',
  '4235': 'Servicios',
  '5905': 'Ganancias y pérdidas',
  '6105': 'Agricultura, ganadería, caza y silvicultura',
  '6135': 'Costo de ventas comercio al por mayor y al por menor',
};

export function nombreOficial(codigo: string): string {
  const nombre = NOMBRES_OFICIALES[codigoPuc(codigo)];
  if (!nombre) throw new Error('Ese código no tiene nombre oficial en la fuente del contador');
  return nombre;
}
