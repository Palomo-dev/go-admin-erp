/**
 * «Así se habrían repartido los últimos 50 leads» (Figma CRM 1412:837868):
 * reparto HIPOTÉTICO de un lote de leads con una estrategia, sin escribir nada.
 * Lógica pura; los datos los trae `assignmentPreviewService`.
 *
 * Reproduce las tres estrategias de `assignmentService` sobre un lote (la
 * asignación real decide lead a lead leyendo la base; aquí el estado —turno,
 * carga— avanza en memoria con cada lead del lote):
 *  - round_robin: rota desde el siguiente al último asignado, en el orden de
 *    membresía (el mismo que `getActiveTeamMembers`).
 *  - territory: `mejorTerritorio` (la MISMA función de la asignación real); si
 *    el territorio tiene responsable que es miembro activo, a él; si no cae en
 *    ninguno o no tiene responsable válido, cuenta en «Sin territorio → turnos».
 *  - load_balance: al de menor carga, sumando cada lead a su carga.
 */

import { mejorTerritorio, type TerritorioEvaluable } from './assignmentService';
import type { LeadAssignmentStrategy } from './leadAssignmentConfig';

export const LOTE_PREVISUALIZACION = 50;

export interface MiembroPrevio {
  user_id: string;
  nombre: string;
}

export interface LeadPrevio {
  owner_id: string | null;
  /** Campos de `CAMPOS_CLIENTE_TERRITORIO`. */
  datos: Record<string, unknown>;
}

export interface RepartoPrevio {
  filas: { user_id: string; nombre: string; n: number }[];
  /** Solo con `territory`: leads que no caen en un territorio con responsable (van por turnos). */
  sinTerritorio: number | null;
  total: number;
  /** Cómo quedaron repartidos HOY esos mismos leads entre los miembros (por `owner_id`). */
  reales: { user_id: string; nombre: string; n: number }[];
}

export function previsualizarReparto(input: {
  orgId: number;
  estrategia: LeadAssignmentStrategy;
  miembros: readonly MiembroPrevio[];
  /** Del más viejo al más reciente. */
  leads: readonly LeadPrevio[];
  territorios: readonly TerritorioEvaluable[];
  cargas: ReadonlyMap<string, number>;
  ultimoAsignado: string | null;
}): RepartoPrevio {
  const { miembros, leads } = input;
  const cuenta = new Map<string, number>(miembros.map((m) => [m.user_id, 0]));
  const ids = miembros.map((m) => m.user_id);
  let sinTerritorio = 0;

  const idxUltimo = input.ultimoAsignado ? ids.indexOf(input.ultimoAsignado) : -1;
  let turno = idxUltimo >= 0 ? (idxUltimo + 1) % Math.max(ids.length, 1) : 0;
  const siguienteTurno = (): string => {
    const id = ids[turno];
    turno = (turno + 1) % ids.length;
    return id;
  };
  const carga = new Map<string, number>(ids.map((id) => [id, input.cargas.get(id) ?? 0]));

  if (ids.length > 0) {
    for (const lead of leads) {
      let elegido: string | null = null;
      if (input.estrategia === 'round_robin') elegido = siguienteTurno();
      else if (input.estrategia === 'load_balance') {
        // Menor carga; empate → orden de membresía (orden estable, como la real).
        elegido = ids.reduce((mejor, id) => ((carga.get(id) ?? 0) < (carga.get(mejor) ?? 0) ? id : mejor), ids[0]);
        carga.set(elegido, (carga.get(elegido) ?? 0) + 1);
      } else {
        const t = mejorTerritorio(input.orgId, input.territorios, lead.datos);
        if (t?.assigned_user_id && cuenta.has(t.assigned_user_id)) elegido = t.assigned_user_id;
        else sinTerritorio++;
      }
      if (elegido) cuenta.set(elegido, (cuenta.get(elegido) ?? 0) + 1);
    }
  }

  const reales = new Map<string, number>(miembros.map((m) => [m.user_id, 0]));
  for (const l of leads) if (l.owner_id && reales.has(l.owner_id)) reales.set(l.owner_id, (reales.get(l.owner_id) ?? 0) + 1);

  return {
    filas: miembros.map((m) => ({ user_id: m.user_id, nombre: m.nombre, n: cuenta.get(m.user_id) ?? 0 })),
    sinTerritorio: input.estrategia === 'territory' ? sinTerritorio : null,
    total: leads.length,
    reales: miembros.map((m) => ({ user_id: m.user_id, nombre: m.nombre, n: reales.get(m.user_id) ?? 0 })),
  };
}
