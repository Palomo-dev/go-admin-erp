/** Lógica pura de la simulación de asignación y de los conteos por territorio (sin React). */

export const ESTRATEGIAS = ['round_robin', 'territory', 'load_balance'] as const;

export interface DatosSimulacion {
  strategy: string;
  team_id: string;
  city: string;
  company_size: string;
  branches_count: string;
  lifecycle_stage: string;
  current_software: string;
}

const texto = (v: string) => (v.trim() ? v.trim() : null);

/** Cuerpo de `POST /api/crm/assignment/simulate`: vacío = «lo configurado» / «sin dato». */
export function cuerpoSimulacion(d: DatosSimulacion): Record<string, unknown> {
  const n = d.branches_count.trim() ? Number(d.branches_count) : null;
  return {
    ...((ESTRATEGIAS as readonly string[]).includes(d.strategy) ? { strategy: d.strategy } : {}),
    ...(d.team_id ? { team_id: d.team_id } : {}),
    customer: {
      city: texto(d.city),
      company_size: texto(d.company_size),
      branches_count: n !== null && Number.isFinite(n) ? n : null,
      lifecycle_stage: texto(d.lifecycle_stage),
      current_software: texto(d.current_software),
    },
  };
}

export interface ConteoTerritorioUi {
  clientes: number;
  solapados: number;
  reglasDeOportunidad: boolean;
  sinReglas: boolean;
}

/** Clave i18n de la nota de un territorio («sin reglas», «reglas de oportunidad»…) o null. */
export function notaTerritorio(c: ConteoTerritorioUi | undefined): 'sinReglas' | 'reglasDeOportunidad' | 'solapados' | null {
  if (!c) return null;
  if (c.sinReglas) return 'sinReglas';
  if (c.reglasDeOportunidad) return 'reglasDeOportunidad';
  if (c.solapados > 0) return 'solapados';
  return null;
}
