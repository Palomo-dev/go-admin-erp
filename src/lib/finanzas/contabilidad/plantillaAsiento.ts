/**
 * Reglas de una plantilla de asiento (Figma 36 · F3 y F4), sin React ni Supabase.
 *
 * El cuadre se compara redondeado a 2 decimales, igual que `fn_plantilla_asiento_guardar`
 * (`round(v_debe, 2) <> round(v_haber, 2)` → `ASIENTO_DESCUADRADO`): la pantalla adelanta lo que
 * la base vuelve a exigir al guardar.
 */

export interface LineaPlantillaBorrador {
  account_code: string;
  debit: string | number;
  credit: string | number;
}

export interface TotalesPlantilla {
  debitos: number;
  creditos: number;
  /** Débitos menos créditos, redondeado a centavos. */
  diferencia: number;
  cuadra: boolean;
}

/** Importe de un campo de texto del formulario; vacío o inválido es 0. */
export function importeLinea(valor: string | number | null | undefined): number {
  const n = typeof valor === 'number' ? valor : Number(String(valor ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

const centavos = (n: number) => Math.round(n * 100) / 100;

/** Una línea cuenta si tiene cuenta y un importe distinto de cero. */
export function esLineaUtil(l: LineaPlantillaBorrador): boolean {
  return Boolean(l.account_code) && (importeLinea(l.debit) !== 0 || importeLinea(l.credit) !== 0);
}

export function lineasUtiles<T extends LineaPlantillaBorrador>(lineas: readonly T[]): T[] {
  return lineas.filter(esLineaUtil);
}

export function totalesPlantilla(lineas: readonly LineaPlantillaBorrador[]): TotalesPlantilla {
  let debitos = 0;
  let creditos = 0;
  for (const l of lineasUtiles(lineas)) {
    debitos += importeLinea(l.debit);
    creditos += importeLinea(l.credit);
  }
  debitos = centavos(debitos);
  creditos = centavos(creditos);
  const diferencia = centavos(debitos - creditos);
  return { debitos, creditos, diferencia, cuadra: diferencia === 0 && debitos > 0 };
}

export type ErrorPlantilla = 'nombre' | 'lineasInsuficientes' | 'lineaInvalida' | 'descuadre';

/**
 * Lo que impide guardar, en el orden en que se le pide al usuario. `null` si se puede guardar.
 * Una línea va al débito o al crédito, nunca a los dos ni con negativos (`LINEA_INVALIDA`).
 */
export function validarPlantilla(nombre: string, lineas: readonly LineaPlantillaBorrador[]): ErrorPlantilla | null {
  if (!nombre.trim()) return 'nombre';
  const utiles = lineasUtiles(lineas);
  if (utiles.length < 2) return 'lineasInsuficientes';
  const invalida = utiles.some((l) => {
    const d = importeLinea(l.debit);
    const c = importeLinea(l.credit);
    return d < 0 || c < 0 || (d > 0 && c > 0);
  });
  if (invalida) return 'lineaInvalida';
  if (!totalesPlantilla(utiles).cuadra) return 'descuadre';
  return null;
}

export interface ErroresUsoPlantilla {
  fecha?: 'requerida';
  sucursal?: 'requerida';
}

/** «Usar plantilla»: fecha y sucursal son obligatorias, cada una con su error en el campo. */
export function validarUsoPlantilla(datos: { fecha: string | null | undefined; sucursalId: number | null | undefined }): ErroresUsoPlantilla {
  const errores: ErroresUsoPlantilla = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha ?? '')) errores.fecha = 'requerida';
  if (datos.sucursalId == null || !Number.isFinite(datos.sucursalId) || datos.sucursalId <= 0) errores.sucursal = 'requerida';
  return errores;
}

export function hayErroresUso(errores: ErroresUsoPlantilla): boolean {
  return Boolean(errores.fecha || errores.sucursal);
}
