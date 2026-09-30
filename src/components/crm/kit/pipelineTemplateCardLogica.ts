/**
 * Lógica de `PipelineTemplateCard` (Figma 800:25326): las 4 plantillas de
 * `src/lib/services/crm/pipelineTemplates.ts` con sus etapas,
 * probabilidades, colores y etapas de cierre. Sin React.
 *
 * «En blanco»: la plantilla no trae etapas; el diseño (aprobado el
 * 2026-09-29) agrega «Ganada» (100 %) y «Perdida» (0 %) para poder cerrar.
 * Aviso: ya existe un pipeline de ese tipo (se crea uno nuevo), u onboarding
 * sin etapa perdida.
 */
import { PIPELINE_TEMPLATES, type PipelineTemplate, type PipelineTemplateKey, type PipelineTemplateStage } from '@/lib/services/crm/pipelineTemplates';

export interface EtapaPlantilla {
  name: string;
  probability: number;
  color: string;
  sla_days: number | null;
  is_won: boolean;
  is_lost: boolean;
}

/** Las etapas de cierre de «En blanco» toman el color de las de la plantilla de ventas. */
function colorCierre(tipo: 'is_won' | 'is_lost'): string {
  return PIPELINE_TEMPLATES.find((t) => t.key === 'sales')?.stages.find((e) => e[tipo])?.color ?? '';
}

const CIERRE_EN_BLANCO = (ganada: string, perdida: string): EtapaPlantilla[] => [
  { name: ganada, probability: 100, color: colorCierre('is_won'), sla_days: null, is_won: true, is_lost: false },
  { name: perdida, probability: 0, color: colorCierre('is_lost'), sla_days: null, is_won: false, is_lost: true },
];

/** Etapas que se ven (y se crean): las de la plantilla o, en blanco, las dos de cierre. */
export function etapasDePlantilla(p: Pick<PipelineTemplate, 'key' | 'stages'>, nombresCierre: { ganada: string; perdida: string }): EtapaPlantilla[] {
  if (p.key === 'blank') return CIERRE_EN_BLANCO(nombresCierre.ganada, nombresCierre.perdida);
  return [...p.stages]
    .sort((a: PipelineTemplateStage, b: PipelineTemplateStage) => a.position - b.position)
    .map(({ name, probability, color, sla_days, is_won, is_lost }) => ({ name, probability, color, sla_days, is_won, is_lost }));
}

/** SLA mínimo y máximo de las etapas abiertas (null si ninguna tiene). */
export function rangoSla(etapas: readonly EtapaPlantilla[]): { min: number; max: number } | null {
  const slas = etapas.map((e) => e.sla_days).filter((s): s is number => typeof s === 'number');
  return slas.length ? { min: Math.min(...slas), max: Math.max(...slas) } : null;
}

export type AvisoPlantilla = 'tipoExistente' | 'sinPerdida' | null;

/** `tiposExistentes`: `pipelines.pipeline_type` de la organización. */
export function avisoPlantilla(p: Pick<PipelineTemplate, 'key' | 'pipeline_type'>, etapas: readonly EtapaPlantilla[], tiposExistentes: readonly (string | null)[]): AvisoPlantilla {
  if (p.pipeline_type && tiposExistentes.includes(p.pipeline_type)) return 'tipoExistente';
  if (p.key !== 'blank' && !etapas.some((e) => e.is_lost)) return 'sinPerdida';
  return null;
}

/** Clave i18n de la plantilla (los textos de `pipelineTemplates.ts` están solo en español). */
export function clavePlantilla(key: PipelineTemplateKey): 'ventas' | 'onboarding' | 'renovacion' | 'enBlanco' {
  return key === 'sales' ? 'ventas' : key === 'onboarding' ? 'onboarding' : key === 'renewal' ? 'renovacion' : 'enBlanco';
}
