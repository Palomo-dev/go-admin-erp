/**
 * Lógica de `LoseDialog` (Figma 761:24268): perder con el catálogo de motivos
 * de la organización (`loss_reasons`: `id`, `code`, `label`, `is_active`,
 * `sort_order`; verificado por MCP el 2026-09-29). Si el motivo es de
 * competencia, pide competidor y precio. Sin React.
 *
 * El cuerpo es el de `POST /api/crm/opportunities/[id]/lose` (ola 1,
 * `lossDataSchema`): siempre mueve a la etapa `is_lost` y conserva el resto
 * de `metadata` (gates, onboarding, renovación).
 */
import { addPlainDays } from '@/lib/utils/dateDisplay';
import { parsearMonto } from './camposCrm';

export interface MotivoPerdida {
  id: string;
  code: string;
  label: string;
  is_active?: boolean | null;
  sort_order?: number | null;
}

/** Días del seguimiento que propone el Figma («Crear tarea de seguimiento en 90 días»). */
export const DIAS_RECONTACTO = 90;

/** Activos y ordenados por `sort_order`, luego por etiqueta. */
export function motivosVisibles(motivos: readonly MotivoPerdida[]): MotivoPerdida[] {
  return motivos
    .filter((m) => m.is_active !== false)
    .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999) || a.label.localeCompare(b.label));
}

/** Motivo de competencia: por código (`competitor`, `competencia`…). */
export function esCompetencia(motivo: Pick<MotivoPerdida, 'code'> | null | undefined): boolean {
  return !!motivo && /compet/i.test(motivo.code);
}

export interface ValoresPerder {
  motivoId: string;
  competidor: string;
  precioCompetidor: string;
  notas: string;
  crearSeguimiento: boolean;
}

export function valoresInicialesPerder(): ValoresPerder {
  return { motivoId: '', competidor: '', precioCompetidor: '', notas: '', crearSeguimiento: true };
}

export function validarPerder(v: ValoresPerder, motivo: MotivoPerdida | null): Partial<Record<keyof ValoresPerder, 'obligatorio' | 'montoInvalido'>> {
  const e: Partial<Record<keyof ValoresPerder, 'obligatorio' | 'montoInvalido'>> = {};
  if (!motivo) e.motivoId = 'obligatorio';
  if (esCompetencia(motivo)) {
    if (!v.competidor.trim()) e.competidor = 'obligatorio';
    const p = parsearMonto(v.precioCompetidor);
    if (p !== null && (Number.isNaN(p) || p < 0)) e.precioCompetidor = 'montoInvalido';
  }
  return e;
}

/** Cuerpo de `…/lose`. `hoy` = día de la organización (para la fecha de recontacto). */
export function cuerpoPerder(v: ValoresPerder, motivo: MotivoPerdida, hoy: string, stageId?: string) {
  const competencia = esCompetencia(motivo);
  const precio = parsearMonto(v.precioCompetidor);
  return {
    loss_data: {
      lossReasonId: motivo.id,
      lossReasonLabel: motivo.label,
      ...(competencia && v.competidor.trim() ? { competitor: v.competidor.trim() } : {}),
      ...(competencia && precio !== null && !Number.isNaN(precio) ? { competitorPrice: precio } : {}),
      ...(v.notas.trim() ? { notes: v.notas.trim() } : {}),
      ...(v.crearSeguimiento ? { recontactDate: addPlainDays(hoy, DIAS_RECONTACTO) } : {}),
    },
    ...(stageId ? { stage_id: stageId } : {}),
  };
}
