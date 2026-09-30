/**
 * «Nuevo pipeline» en 3 pasos (Figma 816:56539 plantilla, 816:56990 nombre y
 * tipo, 816:57260 etapas, 816:58273 error sin estado a medias). Sin React.
 *
 * El cuerpo es el de `POST /api/crm/pipelines` (ola 1, M6), que crea pipeline
 * y etapas en UNA transacción (`crm_create_pipeline_with_stages`): si algo
 * falla no queda nada a medias. La validación de aquí es la misma que hace la
 * base (una ganada, una perdida y probabilidades en orden); la base manda.
 */
import { PIPELINE_TEMPLATES, type PipelineTemplate, type PipelineTemplateKey } from '@/lib/services/crm/pipelineTemplates';
import { etapasDePlantilla } from '@/components/crm/kit/pipelineTemplateCardLogica';
import { validarEtapas, type EtapaEditable, type ErrorEtapa } from '@/components/crm/kit/stageEditorRowLogica';
import { parsearMonto } from '@/components/crm/kit/camposCrm';

export type PasoAsistente = 'plantilla' | 'datos' | 'etapas';
export const PASOS_ASISTENTE: readonly PasoAsistente[] = ['plantilla', 'datos', 'etapas'];
export const TIPOS_PIPELINE = ['sales', 'onboarding', 'renewal'] as const;
export type TipoPipeline = (typeof TIPOS_PIPELINE)[number];
export const PERIODOS_META = ['monthly', 'quarterly', 'yearly'] as const;
export type PeriodoMeta = (typeof PERIODOS_META)[number];
export const MAX_ETAPAS = 20;

/** Orden del Figma: Ventas, Onboarding, Renovación, En blanco. */
export function plantillasAsistente(): PipelineTemplate[] {
  const orden: PipelineTemplateKey[] = ['sales', 'onboarding', 'renewal', 'blank'];
  return orden.map((k) => PIPELINE_TEMPLATES.find((t) => t.key === k)).filter((t): t is PipelineTemplate => !!t);
}

export interface DatosPipeline {
  nombre: string;
  tipo: TipoPipeline;
  meta: string;
  moneda: string;
  periodo: PeriodoMeta;
  porDefecto: boolean;
}

export function datosIniciales(p: PipelineTemplate, monedaBase: string, nombre: string, tiposExistentes: readonly (string | null)[]): DatosPipeline {
  const tipo = (TIPOS_PIPELINE as readonly string[]).includes(p.pipeline_type ?? '') ? (p.pipeline_type as TipoPipeline) : 'sales';
  return { nombre, tipo, meta: '', moneda: monedaBase, periodo: 'quarterly', porDefecto: tipo === 'sales' && !tiposExistentes.includes('sales') };
}

let secuencia = 0;
const nuevaClave = () => `nueva-${++secuencia}`;

export function etapasEditables(p: PipelineTemplate, nombresCierre: { ganada: string; perdida: string }): EtapaEditable[] {
  return etapasDePlantilla(p, nombresCierre).map((e) => ({ clave: nuevaClave(), name: e.name, color: e.color, probability: e.probability, sla_days: e.sla_days, is_won: e.is_won, is_lost: e.is_lost }));
}

export function etapaNueva(color: string): EtapaEditable {
  return { clave: nuevaClave(), name: '', color, probability: null, sla_days: null, is_won: false, is_lost: false };
}

/** Las abiertas, en orden, no bajan de probabilidad (lo exige la RPC con 22023). */
export function probabilidadesEnOrden(etapas: readonly EtapaEditable[]): boolean {
  const abiertas = etapas.filter((e) => !e.is_won && !e.is_lost).map((e) => e.probability ?? 0);
  return abiertas.every((p, i) => i === 0 || p >= abiertas[i - 1]);
}

export interface RevisionEtapas {
  errores: Record<string, ErrorEtapa>;
  ganada: string | null;
  perdida: string | null;
  enOrden: boolean;
  ok: boolean;
}

export function revisarEtapas(etapas: readonly EtapaEditable[]): RevisionEtapas {
  const errores = validarEtapas(etapas);
  const ganada = etapas.find((e) => e.is_won)?.name.trim() || null;
  const perdida = etapas.find((e) => e.is_lost)?.name.trim() || null;
  const enOrden = probabilidadesEnOrden(etapas);
  return { errores, ganada, perdida, enOrden, ok: Object.keys(errores).length === 0 && !!ganada && !!perdida && enOrden && etapas.length <= MAX_ETAPAS };
}

export type ErrorDatos = 'nombreObligatorio' | 'nombreRepetido' | 'metaInvalida';

export function validarDatos(d: DatosPipeline, nombresExistentes: readonly string[]): ErrorDatos | null {
  const nombre = d.nombre.trim();
  if (!nombre) return 'nombreObligatorio';
  if (nombresExistentes.some((n) => n.trim().toLocaleLowerCase('es') === nombre.toLocaleLowerCase('es'))) return 'nombreRepetido';
  const meta = parsearMonto(d.meta);
  if (meta !== null && (Number.isNaN(meta) || meta < 0)) return 'metaInvalida';
  return null;
}

/** Cuerpo de `POST /api/crm/pipelines` (sin plantilla: las etapas son las del paso 3). */
export function cuerpoPipeline(d: DatosPipeline, etapas: readonly EtapaEditable[]) {
  const meta = parsearMonto(d.meta);
  return {
    name: d.nombre.trim(),
    pipeline_type: d.tipo,
    is_default: d.porDefecto,
    ...(meta !== null && !Number.isNaN(meta) && meta > 0 ? { goal_amount: meta, goal_period: d.periodo, goal_currency: d.moneda.toUpperCase() } : {}),
    stages: etapas.map((e) => ({
      name: e.name.trim(),
      probability: e.probability ?? 0,
      ...(/^#[0-9a-fA-F]{6}$/.test(e.color) ? { color: e.color } : {}),
      sla_days: e.is_won || e.is_lost ? null : e.sla_days,
      is_won: e.is_won,
      is_lost: e.is_lost,
      ...(e.exit_criteria ? { exit_criteria: e.exit_criteria as Record<string, unknown> } : {}),
    })),
  };
}
