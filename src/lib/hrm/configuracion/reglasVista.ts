/**
 * Lógica pura de «Aprobaciones» (diseño 10.RH.2): las condiciones de una regla
 * como filas editables (campo · operador · valor) y de vuelta al JSON que
 * evalúa `fn_hr_regla_aplica`; el estado de una delegación; el orden.
 */
import type { Delegacion, PasoRegla, Regla } from './tipos';

export const CAMPOS_LISTA = ['sede', 'area', 'cargo'] as const;
export const CAMPOS_NUMERO = ['dias', 'horas', 'monto', 'aumento'] as const;
export type CampoLista = (typeof CAMPOS_LISTA)[number];
export type CampoNumero = (typeof CAMPOS_NUMERO)[number];
export type CampoCondicion = CampoLista | CampoNumero;

export type Condicion =
  | { campo: CampoLista; valores: string[] }
  | { campo: CampoNumero; op: 'gt' | 'lt'; valor: number | null };

const CLAVE_LISTA: Record<CampoLista, string> = { sede: 'branch_ids', area: 'department_ids', cargo: 'position_ids' };
const CLAVE_NUMERO: Record<CampoNumero, string> = { dias: 'dias', horas: 'horas', monto: 'monto', aumento: 'aumento_pct' };

export function esCampoLista(c: CampoCondicion): c is CampoLista {
  return (CAMPOS_LISTA as readonly string[]).includes(c);
}

/** JSON de la base → filas. Lo que no se reconoce se ignora (la base tampoco lo evalúa). */
export function condicionesDe(json: Record<string, unknown> | null | undefined): Condicion[] {
  const salida: Condicion[] = [];
  const c = json ?? {};
  for (const campo of CAMPOS_LISTA) {
    const v = c[CLAVE_LISTA[campo]];
    if (Array.isArray(v) && v.length > 0) salida.push({ campo, valores: v.map(String) });
  }
  for (const campo of CAMPOS_NUMERO) {
    for (const op of ['gt', 'lt'] as const) {
      const v = c[`${CLAVE_NUMERO[campo]}_${op}`];
      if (v !== undefined && v !== null && Number.isFinite(Number(v))) salida.push({ campo, op, valor: Number(v) });
    }
  }
  return salida;
}

/** Filas → JSON. Las filas incompletas no se guardan. Las sedes son enteros. */
export function condicionesA(filas: readonly Condicion[]): Record<string, unknown> {
  const json: Record<string, unknown> = {};
  for (const f of filas) {
    if (esCampoLista(f.campo)) {
      const fl = f as Extract<Condicion, { valores: string[] }>;
      if (fl.valores.length === 0) continue;
      json[CLAVE_LISTA[fl.campo]] = fl.campo === 'sede' ? fl.valores.map(Number).filter(Number.isInteger) : [...fl.valores];
    } else {
      const fn = f as Extract<Condicion, { op: 'gt' | 'lt' }>;
      if (fn.valor === null || !Number.isFinite(fn.valor)) continue;
      json[`${CLAVE_NUMERO[fn.campo]}_${fn.op}`] = fn.valor;
    }
  }
  return json;
}

export type EstadoDelegacion = 'programada' | 'activa' | 'terminada';

export function estadoDelegacion(d: Pick<Delegacion, 'activa' | 'desde' | 'hasta'>, hoy: string): EstadoDelegacion {
  if (!d.activa || d.hasta < hoy) return 'terminada';
  return d.desde > hoy ? 'programada' : 'activa';
}

/** Reglas de un tipo, en su orden. */
export function reglasDelTipo(reglas: readonly Regla[], tipo: string): Regla[] {
  return reglas.filter((r) => r.tipo === tipo).sort((a, b) => a.prioridad - b.prioridad);
}

/** Mueve `id` a la posición de `destino` (arrastrar o «Subir/Bajar»). */
export function mover(ids: readonly string[], id: string, destino: number): string[] {
  const i = ids.indexOf(id);
  if (i < 0) return [...ids];
  const lista = ids.filter((x) => x !== id);
  const d = Math.max(0, Math.min(destino, lista.length));
  lista.splice(d, 0, id);
  return lista;
}

// ─── R3 (Marcación M0): horas extra y novedades de asistencia con jefe directo ──

/**
 * Tipos de solicitud cuya regla siempre incluye al jefe directo. Si la persona
 * no tiene jefe, el motor pasa a RR. HH. La base lo exige en `fn_hr_regla_guardar`
 * (`jefe_directo_requerido`); aquí se valida antes, para avisar en el editor.
 */
export const TIPOS_CON_JEFE_DIRECTO = ['horas_extra', 'novedad_asistencia'] as const;

export function exigeJefeDirecto(tipo: string | null | undefined): boolean {
  return typeof tipo === 'string' && (TIPOS_CON_JEFE_DIRECTO as readonly string[]).includes(tipo);
}

/** La regla es de un tipo que lo exige y ningún paso es «Jefe directo». */
export function faltaJefeDirecto(tipo: string | null | undefined, pasos: readonly Pick<PasoRegla, 'tipo'>[] | null | undefined): boolean {
  return exigeJefeDirecto(tipo) && !(pasos ?? []).some((p) => p.tipo === 'jefe_directo');
}

/** El paso `i` es el único «Jefe directo» de una regla que lo exige: no se puede quitar. */
export function pasoJefeFijo(tipo: string | null | undefined, pasos: readonly Pick<PasoRegla, 'tipo'>[], i: number): boolean {
  return exigeJefeDirecto(tipo) && pasos[i]?.tipo === 'jefe_directo' && pasos.filter((p) => p.tipo === 'jefe_directo').length === 1;
}
