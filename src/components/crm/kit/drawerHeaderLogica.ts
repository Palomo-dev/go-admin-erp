/**
 * Lógica de `OpportunityDrawerHeader` (Figma 801:25828). Sin React.
 *
 * Mismos datos que `DrawerHeader.tsx` (`name`, `temperature`, cliente,
 * `status`, `score_total`, `icp_band`, `amount` + `currency`,
 * `expected_close_date` como `date`) y, a la vista, la probabilidad de la
 * etapa, el responsable (`salesperson_id`) y los días en la etapa (último
 * `opportunity_stage_history.changed_at`).
 */
import type { TonoBadge } from '@/components/kit/estadoTono';

export type EstadoOportunidad = 'open' | 'won' | 'lost';

export function estadoOportunidad(status: string | null | undefined): EstadoOportunidad {
  return status === 'won' || status === 'lost' ? status : 'open';
}

export const TONO_ESTADO: Record<EstadoOportunidad, TonoBadge> = { open: 'informacion', won: 'exito', lost: 'peligro' };

/** Banda ICP válida (A–D) o null. */
export function bandaIcp(v: string | null | undefined): string | null {
  const b = (v ?? '').trim().toUpperCase();
  return /^[A-D]$/.test(b) ? b : null;
}

/** Botones del pie según estado y permiso de cerrar (nunca por nombre de rol). */
export function accionesPie(estado: EstadoOportunidad, permisos: { editar?: boolean; cerrar?: boolean } = {}): ('editar' | 'perder' | 'ganar' | 'reabrir')[] {
  const salida: ('editar' | 'perder' | 'ganar' | 'reabrir')[] = [];
  if (permisos.editar !== false) salida.push('editar');
  if (permisos.cerrar !== false) salida.push(...(estado === 'open' ? (['perder', 'ganar'] as const) : (['reabrir'] as const)));
  return salida;
}
