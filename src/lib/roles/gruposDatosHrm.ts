// ============================================================
// Grupos de datos de Recursos humanos en el editor de rol (diseño 10.RH.4,
// Figma `2520:76242`). Lógica pura, sin React.
//
// En la base, el alcance de lectura es el SUFIJO del código:
//   `.view` → toda la organización · `.view_branch` → sus sedes ·
//   `.view_team` → su equipo (reportes directos e indirectos).
// La pantalla muestra un solo selector de alcance para el rol y, por grupo,
// «Ver» y «Editar». Aquí se traduce esa vista a los ids del catálogo.
//
// Decisión del dueño (2026-11-15): con «Solo su equipo», salario, cuenta
// bancaria y salud quedan bloqueados aunque se marquen. La base lo impone
// (`fn_hr_grupos_bloqueados_equipo`); la pantalla solo lo refleja y quita
// esas casillas para que el rol guardado diga lo mismo que hace.
// ============================================================

import type { PermisoCatalogo } from './matrizPermisos';

export const GRUPOS_DATOS_HRM = ['identificacion', 'salario_pago', 'banco', 'salud', 'disciplinario', 'sst'] as const;
export type GrupoDatosHrm = (typeof GRUPOS_DATOS_HRM)[number];

/** Grupos que «Solo su equipo» nunca deja ver ni editar (espejo de la base). */
export const BLOQUEADOS_CON_EQUIPO: ReadonlySet<GrupoDatosHrm> = new Set(['salario_pago', 'banco', 'salud']);

export const ALCANCES_HRM = ['organizacion', 'sedes', 'equipo'] as const;
export type AlcanceHrm = (typeof ALCANCES_HRM)[number];

const SUFIJO: Readonly<Record<AlcanceHrm, string>> = { organizacion: 'view', sedes: 'view_branch', equipo: 'view_team' };
const SUFIJOS_VER = Object.values(SUFIJO);

const EMPLEADOS = 'hr.employees';
const codigoVer = (base: string, alcance: AlcanceHrm) => `${base}.${SUFIJO[alcance]}`;
const baseGrupo = (g: GrupoDatosHrm) => `hr.data.${g}`;

/** Códigos que esta vista reemplaza en la lista de permisos del módulo. */
export function esCodigoDeAlcance(codigo: string): boolean {
  if (SUFIJOS_VER.some((s) => codigo === `${EMPLEADOS}.${s}`)) return true;
  return GRUPOS_DATOS_HRM.some((g) => codigo.startsWith(`${baseGrupo(g)}.`));
}

export interface EstadoGrupo {
  ver: boolean;
  editar: boolean;
  /** Con el alcance actual, la base no lo deja ver ni editar. */
  bloqueado: boolean;
}

export interface EstadoGruposHrm {
  /** null: el rol no ve empleados. */
  alcance: AlcanceHrm | null;
  grupos: Record<GrupoDatosHrm, EstadoGrupo>;
  /** El catálogo tiene los códigos (si no, el plan o la versión no los traen). */
  disponible: boolean;
}

type IdPorCodigo = ReadonlyMap<string, number>;

export function indicePorCodigo(catalogo: readonly PermisoCatalogo[]): Map<string, number> {
  return new Map(catalogo.map((p) => [p.codigo, p.id]));
}

const tiene = (ids: IdPorCodigo, sel: ReadonlySet<number>, codigo: string) => {
  const id = ids.get(codigo);
  return id !== undefined && sel.has(id);
};

/** El alcance más amplio marcado en «Ver empleados». */
export function alcanceDe(ids: IdPorCodigo, sel: ReadonlySet<number>): AlcanceHrm | null {
  for (const a of ALCANCES_HRM) if (tiene(ids, sel, codigoVer(EMPLEADOS, a))) return a;
  return null;
}

export function leerGruposHrm(catalogo: readonly PermisoCatalogo[], sel: ReadonlySet<number>): EstadoGruposHrm {
  const ids = indicePorCodigo(catalogo);
  const alcance = alcanceDe(ids, sel);
  const grupos = {} as Record<GrupoDatosHrm, EstadoGrupo>;
  for (const g of GRUPOS_DATOS_HRM) {
    const bloqueado = alcance === 'equipo' && BLOQUEADOS_CON_EQUIPO.has(g);
    grupos[g] = {
      ver: !bloqueado && ALCANCES_HRM.some((a) => tiene(ids, sel, codigoVer(baseGrupo(g), a))),
      editar: !bloqueado && tiene(ids, sel, `${baseGrupo(g)}.edit`),
      bloqueado,
    };
  }
  return { alcance, grupos, disponible: ids.has(codigoVer(EMPLEADOS, 'organizacion')) };
}

function quitarCodigos(sel: Set<number>, ids: IdPorCodigo, codigos: readonly string[]) {
  for (const c of codigos) {
    const id = ids.get(c);
    if (id !== undefined) sel.delete(id);
  }
}

function ponerCodigo(sel: Set<number>, ids: IdPorCodigo, codigo: string) {
  const id = ids.get(codigo);
  if (id !== undefined) sel.add(id);
}

const vistasDe = (base: string) => ALCANCES_HRM.map((a) => codigoVer(base, a));

/**
 * Cambia el alcance del rol. Conserva qué grupos ve (con el nuevo sufijo) y
 * quita lo que el nuevo alcance bloquea. `null` quita «Ver empleados» y todo
 * lo que se ve a través de él.
 */
export function aplicarAlcance(catalogo: readonly PermisoCatalogo[], sel: ReadonlySet<number>, alcance: AlcanceHrm | null): Set<number> {
  const ids = indicePorCodigo(catalogo);
  const antes = leerGruposHrm(catalogo, sel);
  const siguiente = new Set(sel);
  quitarCodigos(siguiente, ids, vistasDe(EMPLEADOS));
  for (const g of GRUPOS_DATOS_HRM) quitarCodigos(siguiente, ids, vistasDe(baseGrupo(g)));
  if (alcance === null) return siguiente;
  ponerCodigo(siguiente, ids, codigoVer(EMPLEADOS, alcance));
  for (const g of GRUPOS_DATOS_HRM) {
    const bloqueado = alcance === 'equipo' && BLOQUEADOS_CON_EQUIPO.has(g);
    if (bloqueado) {
      quitarCodigos(siguiente, ids, [`${baseGrupo(g)}.edit`]);
      continue;
    }
    // Un grupo que estaba bloqueado no vuelve marcado al ampliar el alcance.
    if (antes.grupos[g].ver) ponerCodigo(siguiente, ids, codigoVer(baseGrupo(g), alcance));
  }
  return siguiente;
}

/** Marca o desmarca «Ver» de un grupo con el alcance actual. Quitar «Ver» quita también «Editar». */
export function alternarVerGrupo(catalogo: readonly PermisoCatalogo[], sel: ReadonlySet<number>, g: GrupoDatosHrm): Set<number> {
  const ids = indicePorCodigo(catalogo);
  const estado = leerGruposHrm(catalogo, sel);
  const siguiente = new Set(sel);
  if (!estado.alcance || estado.grupos[g].bloqueado) return siguiente;
  if (estado.grupos[g].ver) {
    quitarCodigos(siguiente, ids, [...vistasDe(baseGrupo(g)), `${baseGrupo(g)}.edit`]);
  } else {
    ponerCodigo(siguiente, ids, codigoVer(baseGrupo(g), estado.alcance));
  }
  return siguiente;
}

/** Marca o desmarca «Editar» de un grupo. Editar exige ver: marcarlo marca «Ver». */
export function alternarEditarGrupo(catalogo: readonly PermisoCatalogo[], sel: ReadonlySet<number>, g: GrupoDatosHrm): Set<number> {
  const ids = indicePorCodigo(catalogo);
  const estado = leerGruposHrm(catalogo, sel);
  const siguiente = new Set(sel);
  if (!estado.alcance || estado.grupos[g].bloqueado) return siguiente;
  if (estado.grupos[g].editar) {
    quitarCodigos(siguiente, ids, [`${baseGrupo(g)}.edit`]);
  } else {
    ponerCodigo(siguiente, ids, `${baseGrupo(g)}.edit`);
    if (!estado.grupos[g].ver) ponerCodigo(siguiente, ids, codigoVer(baseGrupo(g), estado.alcance));
  }
  return siguiente;
}
