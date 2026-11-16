/**
 * Lógica pura de «Parámetros legales» (diseño 10.RH.1): qué fila rige en una
 * fecha, cuál viene después, el historial y los tramos de un período que cruza
 * dos vigencias. Ningún valor legal vive aquí: todo sale de las filas de la base.
 */
import type { FilaParametro, FilaParametroEmpresa } from './tipos';

type ConVigencia = { code: string; effective_from: string; effective_to: string | null };

/** Fila que rige `code` en la fecha (la de inicio más reciente que la cubre). */
export function vigenteEn<T extends ConVigencia>(filas: readonly T[], code: string, fecha: string): T | null {
  let mejor: T | null = null;
  for (const f of filas) {
    if (f.code !== code || f.effective_from > fecha) continue;
    if (f.effective_to !== null && f.effective_to < fecha) continue;
    if (!mejor || f.effective_from > mejor.effective_from) mejor = f;
  }
  return mejor;
}

/** Primera fila que empieza después de la fecha (lo «programado»). */
export function proximoDesde<T extends ConVigencia>(filas: readonly T[], code: string, fecha: string): T | null {
  let mejor: T | null = null;
  for (const f of filas) {
    if (f.code !== code || f.effective_from <= fecha) continue;
    if (!mejor || f.effective_from < mejor.effective_from) mejor = f;
  }
  return mejor;
}

/** Todas las vigencias de un parámetro, la más reciente primero. */
export function historialDe<T extends ConVigencia>(filas: readonly T[], code: string): T[] {
  return filas.filter((f) => f.code === code).sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
}

/** Día anterior / siguiente de una fecha plana `YYYY-MM-DD`, sin zona horaria. */
export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, d + dias));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

export function diasEntre(desde: string, hasta: string): number {
  const a = desde.split('-').map(Number);
  const b = hasta.split('-').map(Number);
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86_400_000) + 1;
}

export interface Tramo<T> {
  desde: string;
  hasta: string;
  dias: number;
  fila: T | null;
}

/** Parte un período en los tramos en que cambia la fila vigente de `code`. */
export function tramos<T extends ConVigencia>(filas: readonly T[], code: string, desde: string, hasta: string): Tramo<T>[] {
  const cortes = new Set<string>([desde]);
  for (const f of filas) {
    if (f.code !== code) continue;
    if (f.effective_from > desde && f.effective_from <= hasta) cortes.add(f.effective_from);
    if (f.effective_to) {
      const sig = sumarDias(f.effective_to, 1);
      if (sig > desde && sig <= hasta) cortes.add(sig);
    }
  }
  const lista = [...cortes].sort();
  return lista.map((d, i) => {
    const fin = i < lista.length - 1 ? sumarDias(lista[i + 1], -1) : hasta;
    return { desde: d, hasta: fin, dias: diasEntre(d, fin), fila: vigenteEn(filas, code, d) };
  });
}

/** Mes (primer y último día) de una fecha plana. */
export function mesDe(fecha: string): { desde: string; hasta: string } {
  const [a, m] = fecha.split('-').map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return { desde: `${a}-${mm}-01`, hasta: `${a}-${mm}-${String(ultimo).padStart(2, '0')}` };
}

/**
 * Ejemplo del detalle «Un período que cruza dos vigencias»: el mes del cambio
 * más reciente a la fecha (o del próximo, si aún no ha llegado ninguno).
 */
export function periodoQueCruza<T extends ConVigencia>(filas: readonly T[], code: string, fecha: string): Tramo<T>[] | null {
  const hist = historialDe(filas, code).filter((f) => !f.effective_from.endsWith('-01'));
  const pasado = hist.find((f) => f.effective_from <= fecha);
  const elegido = pasado ?? hist[hist.length - 1];
  if (!elegido) return null;
  const mes = mesDe(elegido.effective_from);
  const t = tramos(filas, code, mes.desde, mes.hasta);
  return t.length > 1 ? t : null;
}

/** Valor propio de la empresa que rige hoy o, si no, el próximo programado. */
export function valorEmpresa(filas: readonly FilaParametroEmpresa[], code: string, hoy: string): FilaParametroEmpresa | null {
  return vigenteEn(filas, code, hoy) ?? proximoDesde(filas, code, hoy);
}

/**
 * El valor final que la ley tiene programado para `code` (p. ej. el 100 % del
 * recargo dominical desde 2027) y si hoy ya rige. Sirve para «adelantar» la ley.
 */
export function metaProgramada(filas: readonly FilaParametro[], code: string, hoy: string): { valor: number; desde: string } | null {
  const futuros = filas.filter((f) => f.code === code && f.effective_from > hoy && f.value !== null && f.status !== 'por_confirmar');
  if (futuros.length === 0) return null;
  const ultimo = futuros.sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0];
  return { valor: Number(ultimo.value), desde: ultimo.effective_from };
}

/** Filtro de la lista de valores de ley. */
export function coincideBusqueda(texto: string, termino: string): boolean {
  const n = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const t = n(termino.trim());
  return !t || n(texto).includes(t);
}
