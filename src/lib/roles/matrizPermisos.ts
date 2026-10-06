// ============================================================
// Matriz de permisos por módulo × acción (Figma «13. Equipo › Roles y permisos»,
// componentes MatrizEncabezado / ModuloMatriz / FilaPermiso / CeldaPermiso).
//
// Lógica pura, sin React ni Supabase. Una sola definición para el editor de
// rol, el de cargo, «Comparar» y «¿Qué puede hacer?» (regla 7).
//
// El catálogo `permissions` mezcla códigos con verbo (`pos.void`,
// `hr.leaves.approve`) y heredados sin verbo (`inventory_management`); la acción
// se DERIVA del último segmento del código y lo que no encaja va a «Otras
// acciones». Ningún código cambia: es solo presentación
// (docs/acceso/ROLES-Y-PERMISOS-ANALISIS.md §1, «hace falta un mapeo explícito»).
// ============================================================

import { nombreLegible, type FilaPermiso } from '@/lib/organizacion/permisosEfectivos';

export const ACCIONES = ['ver', 'crear', 'editar', 'eliminar', 'aprobar', 'otros'] as const;
export type AccionPermiso = (typeof ACCIONES)[number];

/** Por qué un permiso es delicado: mueve dinero, borra datos o abre el acceso. */
export type Sensibilidad = 'dinero' | 'eliminar' | 'acceso';

/** Fila de `permissions` con su id (columnas verificadas por MCP el 2026-10-06). */
export interface FilaPermisoConId extends FilaPermiso {
  id: number;
}

export interface PermisoCatalogo {
  id: number;
  codigo: string;
  modulo: string;
  nombre: string;
  accion: AccionPermiso;
  sensible: Sensibilidad | null;
}

const VERBO_ACCION: Readonly<Record<string, AccionPermiso>> = {
  view: 'ver',
  view_all: 'ver',
  ver_esperado: 'ver',
  create: 'crear',
  edit: 'editar',
  edit_any: 'editar',
  update: 'editar',
  delete: 'eliminar',
  approve: 'aprobar',
};

/** Último segmento del código (`hr.leaves.approve` → `approve`). Sin punto: no hay verbo. */
function verboDe(codigo: string): string | null {
  const i = codigo.lastIndexOf('.');
  return i < 0 ? null : codigo.slice(i + 1);
}

export function accionDe(codigo: string): AccionPermiso {
  const verbo = verboDe(codigo);
  return (verbo && VERBO_ACCION[verbo]) || 'otros';
}

/** Módulos del catálogo cuyo efecto es dar o quitar acceso a otras personas o a la organización. */
const MODULOS_ACCESO = new Set(['admin', 'roles', 'users', 'organizations']);
/** Verbos que mueven dinero aunque su módulo no sea `finance`. */
const VERBOS_DINERO = new Set(['refund', 'void', 'discount', 'reverse', 'liquidar', 'cerrar_ajenas', 'ver_esperado']);
const SEGMENTOS_DINERO = new Set(['payroll', 'cajas', 'propinas', 'accounting']);
const VERBOS_ELIMINAR = new Set(['delete', 'cancel', 'merge']);

/**
 * Sensibilidad derivada del código y el módulo. Prioridad: dinero > acceso >
 * eliminar (un `finance.void` es «dinero», no «eliminar»).
 */
export function sensibilidadDe(codigo: string, modulo: string): Sensibilidad | null {
  const segmentos = codigo.split('.');
  const verbo = verboDe(codigo);
  if (
    modulo === 'finance' ||
    codigo === 'billing_management' ||
    (verbo !== null && VERBOS_DINERO.has(verbo)) ||
    segmentos.some((s) => SEGMENTOS_DINERO.has(s))
  ) {
    return 'dinero';
  }
  if (MODULOS_ACCESO.has(modulo) || codigo === 'integrations.api_keys') return 'acceso';
  if (verbo !== null && VERBOS_ELIMINAR.has(verbo)) return 'eliminar';
  return null;
}

export function clasificarCatalogo(filas: readonly FilaPermisoConId[]): PermisoCatalogo[] {
  return filas
    .filter((f) => f && Number.isFinite(f.id) && f.code && f.module)
    .map((f) => ({
      id: f.id,
      codigo: f.code,
      modulo: f.module,
      nombre: nombreLegible(f),
      accion: accionDe(f.code),
      sensible: sensibilidadDe(f.code, f.module),
    }));
}

// ─── Agrupación por módulo ────────────────────────────────────────────────

export interface ModuloAgrupado {
  modulo: string;
  permisos: PermisoCatalogo[];
  /** Ids por acción (columna de la matriz). Una acción sin ids se pinta «—». */
  porAccion: Record<AccionPermiso, number[]>;
  /** El módulo tiene al menos un permiso sensible. */
  sensible: boolean;
}

const vacioPorAccion = (): Record<AccionPermiso, number[]> => ({
  ver: [],
  crear: [],
  editar: [],
  eliminar: [],
  aprobar: [],
  otros: [],
});

/** Orden de acciones dentro de un módulo: el de las columnas; luego por nombre. */
const ordenAccion = (a: AccionPermiso) => ACCIONES.indexOf(a);

export function agruparPorModulo(
  permisos: readonly PermisoCatalogo[],
  etiquetaModulo: (modulo: string) => string = (m) => m,
): ModuloAgrupado[] {
  const grupos = new Map<string, ModuloAgrupado>();
  for (const p of permisos) {
    const g = grupos.get(p.modulo) ?? { modulo: p.modulo, permisos: [], porAccion: vacioPorAccion(), sensible: false };
    g.permisos.push(p);
    g.porAccion[p.accion].push(p.id);
    if (p.sensible) g.sensible = true;
    grupos.set(p.modulo, g);
  }
  for (const g of grupos.values()) {
    g.permisos.sort((a, b) => ordenAccion(a.accion) - ordenAccion(b.accion) || a.nombre.localeCompare(b.nombre, 'es'));
  }
  return [...grupos.values()].sort((a, b) => etiquetaModulo(a.modulo).localeCompare(etiquetaModulo(b.modulo), 'es'));
}

// ─── Estado de casillas ───────────────────────────────────────────────────

/** `vacio`: la columna no tiene permisos en ese módulo («—»). */
export type EstadoCasilla = 'todo' | 'parcial' | 'nada' | 'vacio';

export function estadoCasilla(ids: readonly number[], seleccion: ReadonlySet<number>): EstadoCasilla {
  if (ids.length === 0) return 'vacio';
  let marcados = 0;
  for (const id of ids) if (seleccion.has(id)) marcados += 1;
  if (marcados === 0) return 'nada';
  return marcados === ids.length ? 'todo' : 'parcial';
}

export function contarMarcados(ids: readonly number[], seleccion: ReadonlySet<number>): number {
  let n = 0;
  for (const id of ids) if (seleccion.has(id)) n += 1;
  return n;
}

/**
 * Alterna un grupo (módulo entero o columna): si estaba todo marcado lo
 * desmarca; si no (nada o parcial) lo marca entero. Los ids `bloqueados` (lo da
 * el rol, en el editor de cargo) no se tocan. Devuelve un conjunto nuevo.
 */
export function alternarGrupo(
  seleccion: ReadonlySet<number>,
  ids: readonly number[],
  bloqueados: ReadonlySet<number> = new Set(),
): Set<number> {
  const editables = ids.filter((id) => !bloqueados.has(id));
  const siguiente = new Set(seleccion);
  const todo = editables.length > 0 && editables.every((id) => seleccion.has(id));
  for (const id of editables) {
    if (todo) siguiente.delete(id);
    else siguiente.add(id);
  }
  return siguiente;
}

export function alternarUno(seleccion: ReadonlySet<number>, id: number): Set<number> {
  const siguiente = new Set(seleccion);
  if (siguiente.has(id)) siguiente.delete(id);
  else siguiente.add(id);
  return siguiente;
}

// ─── Búsqueda y filtros ───────────────────────────────────────────────────

export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('es')
    .trim();
}

export interface FiltroMatriz {
  termino?: string;
  /** Solo lo concedido (en el editor: lo marcado ahora). */
  soloConcedidos?: boolean;
  soloSensibles?: boolean;
}

/**
 * Filtra los permisos de cada módulo. Un módulo cuyo nombre coincide con el
 * término conserva todos sus permisos. Devuelve solo los módulos con algo.
 */
export function filtrarModulos(
  modulos: readonly ModuloAgrupado[],
  seleccion: ReadonlySet<number>,
  filtro: FiltroMatriz,
  etiquetaModulo: (modulo: string) => string = (m) => m,
): ModuloAgrupado[] {
  const termino = normalizarTexto(filtro.termino ?? '');
  const palabras = termino ? termino.split(/\s+/) : [];
  const coincide = (texto: string) => {
    const t = normalizarTexto(texto);
    return palabras.every((p) => t.includes(p));
  };
  const resultado: ModuloAgrupado[] = [];
  for (const m of modulos) {
    const moduloCoincide = palabras.length > 0 && coincide(`${etiquetaModulo(m.modulo)} ${m.modulo}`);
    const permisos = m.permisos.filter((p) => {
      if (filtro.soloConcedidos && !seleccion.has(p.id)) return false;
      if (filtro.soloSensibles && !p.sensible) return false;
      if (palabras.length === 0 || moduloCoincide) return true;
      return coincide(`${p.nombre} ${p.codigo}`);
    });
    if (permisos.length === 0) continue;
    const porAccion = vacioPorAccion();
    for (const p of permisos) porAccion[p.accion].push(p.id);
    resultado.push({ ...m, permisos, porAccion });
  }
  return resultado;
}

export function idsDe(modulo: ModuloAgrupado): number[] {
  return modulo.permisos.map((p) => p.id);
}
