/**
 * Lógica pura de «Unidades y conversiones» (sin React ni Supabase). La regla
 * de conversión NO vive aquí: es `fn_unidad_factor` en la base. Esto solo
 * agrupa, filtra y da formato a lo que devuelve `fn_unidades_resumen`.
 */
import { normalizarBusqueda } from '@/components/kit/arbol';
import type { AmbitoConversion, Conversion, TipoUnidad, Unidad } from './tipos';

/** «1.000», «0,001», «0,45359» (hasta 6 decimales, sin ceros de más). */
export function formatoFactor(n: number, locale = 'es-CO'): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(locale, { maximumFractionDigits: 6 });
}

/** «1 KG = 1.000 GR». */
export function equivalencia(de: string, a: string, factor: number, locale = 'es-CO'): string {
  return `1 ${de} = ${formatoFactor(factor, locale)} ${a}`;
}

export interface FilaConversion {
  /** La que se muestra (del sistema: la de factor ≥ 1). */
  conversion: Conversion;
  /** Su inversa agrupada en la misma fila (solo las del sistema), si existe. */
  inversa: Conversion | null;
}

/**
 * Filas de la tabla (Figma `594:339276`): las del sistema se agrupan con su
 * inversa («1 KG = 1.000 GR» · inversa «1 GR = 0,001 KG»); las propias y las de
 * producto van una por fila, cada una con su inversa calculada.
 */
export function filasConversion(conversiones: readonly Conversion[]): FilaConversion[] {
  const porId = new Map(conversiones.map((c) => [c.id, c]));
  const usadas = new Set<number>();
  const filas: FilaConversion[] = [];
  for (const c of conversiones) {
    if (usadas.has(c.id)) continue;
    if (c.ambito === 'sistema' && c.inversa_id && porId.has(c.inversa_id)) {
      const inv = porId.get(c.inversa_id) as Conversion;
      const [principal, otra] = c.factor >= inv.factor ? [c, inv] : [inv, c];
      usadas.add(c.id).add(inv.id);
      filas.push({ conversion: principal, inversa: otra });
    } else {
      usadas.add(c.id);
      filas.push({ conversion: c, inversa: null });
    }
  }
  return filas;
}

/** Tipo de la conversión (el de la unidad de origen; en las de producto puede cruzar tipos). */
export function tipoDeConversion(c: Conversion): TipoUnidad | null {
  return c.tipo_de ?? c.tipo_a;
}

export type FiltroAmbito = 'todas' | AmbitoConversion;

export interface FiltrosConversion {
  texto: string;
  tipo: TipoUnidad | 'todos';
  ambito: FiltroAmbito;
  unidad: string | null;
  soloRevisar: boolean;
}

export function filtrarConversiones(filas: readonly FilaConversion[], f: FiltrosConversion): FilaConversion[] {
  const q = normalizarBusqueda(f.texto);
  return filas.filter(({ conversion: c }) => {
    if (f.tipo !== 'todos' && tipoDeConversion(c) !== f.tipo) return false;
    if (f.ambito !== 'todas' && c.ambito !== f.ambito) return false;
    if (f.unidad && c.de !== f.unidad && c.a !== f.unidad) return false;
    if (f.soloRevisar && !c.revisar) return false;
    if (!q) return true;
    return [c.de, c.a, c.nombre_de ?? '', c.nombre_a ?? '', c.producto?.nombre ?? '', c.producto?.sku ?? '']
      .some((x) => normalizarBusqueda(x).includes(q));
  });
}

export type FiltroUso = 'todas' | 'conProductos' | 'sinUso';

export interface FiltrosUnidad {
  texto: string;
  tipo: TipoUnidad | 'todos';
  ambito: 'todas' | 'sistema' | 'organizacion';
  uso: FiltroUso;
  sinConversion: boolean;
}

export function filtrarUnidades(unidades: readonly Unidad[], f: FiltrosUnidad): Unidad[] {
  const q = normalizarBusqueda(f.texto);
  return unidades.filter((u) => {
    if (f.tipo !== 'todos' && u.tipo !== f.tipo) return false;
    if (f.ambito !== 'todas' && u.ambito !== f.ambito) return false;
    if (f.uso === 'conProductos' && u.productos === 0) return false;
    if (f.uso === 'sinUso' && (u.productos > 0 || u.recetas > 0)) return false;
    if (f.sinConversion && u.conversiones > 0) return false;
    return !q || normalizarBusqueda(u.codigo).includes(q) || normalizarBusqueda(u.nombre).includes(q);
  });
}

/** Una unidad propia se puede eliminar si nada la usa (la RPC lo vuelve a comprobar). */
export function unidadEliminable(u: Unidad): boolean {
  return u.ambito === 'organizacion' && u.productos === 0 && u.recetas === 0;
}

export const CODIGO_UNIDAD = /^[A-Z0-9]{1,3}$/;

/** Código sugerido a partir del nombre: «Bulto» → BUL, «Atado» → ATD si ATA está tomado. */
export function codigoSugerido(nombre: string, tomados: ReadonlySet<string>): string {
  const base = normalizarBusqueda(nombre).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!base) return '';
  const candidatos = [base.slice(0, 3), base[0] + base.slice(1).replace(/[AEIOU]/g, '').slice(0, 2), base.slice(0, 2) + base.slice(-1)];
  return candidatos.find((c) => c.length > 0 && !tomados.has(c)) ?? base.slice(0, 3);
}
