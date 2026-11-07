/**
 * Centros de costo en pantalla (Figma «Escritorio / Centros de costo — árbol»
 * 2327:125607 y «Nueva distribución» 2327:126356): árbol filtrable, padres
 * posibles sin ciclos y validación de la distribución. Sin React ni Supabase.
 *
 * El árbol usa las funciones del kit (`construirArbol`, `filtrarArbol`,
 * `aplanarArbol`), que trabajan con id numérico: el uuid de cada centro se
 * traduce a su posición en la lista y de vuelta.
 */
import { aplanarArbol, construirArbol, filtrarArbol, normalizarBusqueda, type NodoPlano } from '@/components/kit/arbol';

export interface CentroVista {
  id: string;
  code: string;
  name: string;
  parent_id: string | null;
  branch_id: number | null;
  is_active: boolean;
  sucursal?: string | null;
}

export type FiltroEstadoCentro = 'todos' | 'activos' | 'inactivos';

export interface FiltrosCentros {
  busqueda: string;
  estado: FiltroEstadoCentro;
  /** `null`: todas; `0`: los de toda la organización (sin sucursal). */
  sucursal: number | null;
  /** Ramas cerradas a mano (uuid). Por defecto todo abierto, como el Figma. */
  cerrados: ReadonlySet<string>;
}

export interface FilaCentro<T extends CentroVista> {
  centro: T;
  nivel: number;
  tieneHijos: boolean;
  abierto: boolean;
  /** Ancestro que se ve solo como contexto de una coincidencia. */
  contexto: boolean;
}

interface Nodo<T> extends NodoPlano {
  centro: T;
}

function compararCodigo(a: { code: string }, b: { code: string }): number {
  return a.code.localeCompare(b.code, 'es', { numeric: true });
}

export function coincideCentro(centro: CentroVista, filtros: Omit<FiltrosCentros, 'cerrados'>): boolean {
  if (filtros.estado === 'activos' && !centro.is_active) return false;
  if (filtros.estado === 'inactivos' && centro.is_active) return false;
  if (filtros.sucursal !== null) {
    if (filtros.sucursal === 0 ? centro.branch_id !== null : centro.branch_id !== filtros.sucursal) return false;
  }
  const termino = normalizarBusqueda(filtros.busqueda);
  if (!termino) return true;
  return normalizarBusqueda(`${centro.code} ${centro.name}`).includes(termino);
}

export function hayFiltros(filtros: Omit<FiltrosCentros, 'cerrados'>): boolean {
  return filtros.busqueda.trim() !== '' || filtros.estado !== 'todos' || filtros.sucursal !== null;
}

/** Filas visibles del árbol, ordenadas por código, con los ancestros de cada coincidencia. */
export function filasCentros<T extends CentroVista>(centros: readonly T[], filtros: FiltrosCentros): FilaCentro<T>[] {
  const indice = new Map(centros.map((c, i) => [c.id, i + 1]));
  const nodos: Nodo<T>[] = centros.map((c, i) => ({
    id: i + 1,
    parentId: c.parent_id ? indice.get(c.parent_id) ?? null : null,
    centro: c,
  }));
  const raices = construirArbol(nodos, (a, b) => compararCodigo(a.centro, b.centro));
  const filtrando = hayFiltros(filtros);
  const { raices: visibles, coincidencias, abiertasPorBusqueda } = filtrarArbol(
    raices,
    filtrando ? (n) => coincideCentro(n.centro, filtros) : null,
  );
  const cerradosNum = new Set([...filtros.cerrados].map((id) => indice.get(id)).filter((n): n is number => n !== undefined));
  const abiertos = new Set(nodos.map((n) => n.id).filter((id) => !cerradosNum.has(id)));
  return aplanarArbol(visibles, {
    abiertos,
    abiertasPorBusqueda,
    cerradosAMano: cerradosNum,
    coincidencias: filtrando ? coincidencias : undefined,
  }).map((f) => ({ centro: f.dato.centro, nivel: f.nivel, tieneHijos: f.tieneHijos, abierto: f.abierto, contexto: f.contexto }));
}

/** Centro y todos sus descendientes: no pueden ser su padre (ciclo). */
export function descendientesYPropio(centros: readonly CentroVista[], id: string): Set<string> {
  const salida = new Set<string>([id]);
  let crecio = true;
  while (crecio) {
    crecio = false;
    for (const c of centros) {
      if (c.parent_id && salida.has(c.parent_id) && !salida.has(c.id)) {
        salida.add(c.id);
        crecio = true;
      }
    }
  }
  return salida;
}

// ── Distribuciones ─────────────────────────────────────────────────────────

export interface LineaDistribucionForm {
  centroId: string;
  porcentaje: string;
}

export type ErrorDistribucion = 'nombre' | 'minimo' | 'linea' | 'repetido' | 'suma';

const TOLERANCIA = 0.001;

export function porcentajeDe(texto: string): number {
  const n = Number(String(texto).replace(',', '.').trim());
  return Number.isFinite(n) ? n : NaN;
}

export function sumaDistribucion(lineas: readonly LineaDistribucionForm[]): number {
  const suma = lineas.reduce((total, l) => total + (Number.isFinite(porcentajeDe(l.porcentaje)) ? porcentajeDe(l.porcentaje) : 0), 0);
  return Math.round(suma * 1000) / 1000;
}

/** Mismo criterio que `fn_distribucion_guardar`; la base vuelve a validar. */
export function validarDistribucion(nombre: string, lineas: readonly LineaDistribucionForm[]): ErrorDistribucion | null {
  if (!nombre.trim()) return 'nombre';
  if (lineas.length < 2) return 'minimo';
  if (lineas.some((l) => {
    const p = porcentajeDe(l.porcentaje);
    return !l.centroId || !Number.isFinite(p) || p <= 0 || p > 100;
  })) return 'linea';
  if (new Set(lineas.map((l) => l.centroId)).size !== lineas.length) return 'repetido';
  if (Math.abs(sumaDistribucion(lineas) - 100) > TOLERANCIA) return 'suma';
  return null;
}

/** Código del error de la RPC → clave de error de la pantalla. */
export function errorRpcDistribucion(mensaje: string): ErrorDistribucion | 'nombreRepetido' | 'centroInvalido' | 'desconocido' {
  if (mensaje.includes('DISTRIBUCION_SUMA')) return 'suma';
  if (mensaje.includes('CENTRO_REPETIDO')) return 'repetido';
  if (mensaje.includes('NOMBRE_REPETIDO')) return 'nombreRepetido';
  if (mensaje.includes('CENTRO_INVALIDO')) return 'centroInvalido';
  if (mensaje.includes('NOMBRE_REQUERIDO')) return 'nombre';
  return 'desconocido';
}

/** «Mostrador 60 % · Domicilios 40 %». Un centro que ya no está sale con su porcentaje solo. */
export function resumenDistribucion(
  lineas: readonly { cost_center_id: string; porcentaje: number }[],
  centros: readonly CentroVista[],
  formatearPorcentaje: (n: number) => string,
): string {
  return lineas
    .map((l) => {
      const c = centros.find((x) => x.id === l.cost_center_id);
      return c ? `${c.name} ${formatearPorcentaje(l.porcentaje)}` : formatearPorcentaje(l.porcentaje);
    })
    .join(' · ');
}

/** Error de guardar un centro → clave de la pantalla. */
export function errorGuardarCentro(mensaje: string): 'ciclo' | 'codigoRepetido' | 'conMovimientos' | 'desconocido' {
  if (mensaje.includes('CENTRO_CICLO')) return 'ciclo';
  if (mensaje.includes('centro_con_movimientos')) return 'conMovimientos';
  if (mensaje.includes('duplicate key') || mensaje.includes('23505')) return 'codigoRepetido';
  return 'desconocido';
}
