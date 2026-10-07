/**
 * Qué hace el agente de voz ante el desinterés DEFINITIVO del cliente en una
 * llamada de venta (decisión del dueño, 2026-10-07). Sin React ni next/server:
 * lo usan el ws-server (Railway), el route handler y la UI.
 *
 * Configuración por organización (`crm_voice_disinterest_settings`, una fila
 * por organización; verificada por MCP, migración 20261007210403):
 *  - modo: `mark_lost` (marcar perdida, por defecto), `task_only` (solo tarea
 *    al vendedor) o `log_only` (no hacer nada: solo queda la objeción);
 *  - excepción por valor (opcional): si la oportunidad vale IGUAL O MÁS que el
 *    monto, no se cierra y queda tarea;
 *  - excepción por etapa (opcional): desde la etapa elegida (por `position`)
 *    en adelante, en el pipeline de esa etapa, no se cierra y queda tarea.
 * Sin fila = `mark_lost` sin excepciones: el comportamiento anterior intacto.
 *
 * Moneda de la excepción por valor. El monto se guarda CON su moneda
 * (`value_currency`, por defecto la base de la organización). La oportunidad
 * se compara en esa moneda: si está en la misma, directo; si no, se convierte
 * con la tasa más reciente de `exchange_rates` de la organización (directa o
 * pasando por la moneda base, el mismo criterio de `tasaVigente` que usan los
 * KPI del CRM). La tasa no se inventa: sin tasa, gana la opción prudente
 * (tarea). Oportunidad sin monto o con 0: la excepción no aplica.
 *
 * Precedencia: la opción MÁS RESTRICTIVA gana. Orden, de más a menos
 * prudente: no hacer nada > tarea > perdida. La etapa con
 * `action_policy='suggest'` aporta «tarea»; el modo de la organización aporta
 * el suyo; cada excepción cumplida aporta «tarea». Así, ni la etapa puede
 * volver «perdida» un «no hacer nada» de la organización, ni la organización
 * puede saltarse una etapa en «Sugerir».
 */

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { tasaVigente, type TasaCambio } from '@/lib/crm/monedaCrm';
import { normalizarCodigoMoneda } from '@/lib/utils/moneda';

export const TABLA_CONFIG_DESINTERES = 'crm_voice_disinterest_settings';

export const MODOS_DESINTERES = ['mark_lost', 'task_only', 'log_only'] as const;
export type ModoDesinteres = (typeof MODOS_DESINTERES)[number];

export interface ConfigDesinteres {
  modo: ModoDesinteres;
  excepcionValor: { activa: boolean; monto: number | null; moneda: string | null };
  excepcionEtapa: { activa: boolean; etapaId: string | null };
  /** false = no hay fila: se usan los valores por defecto. */
  guardada: boolean;
  actualizadaEn: string | null;
  actualizadaPor: string | null;
}

export const CONFIG_DESINTERES_POR_DEFECTO: ConfigDesinteres = Object.freeze({
  modo: 'mark_lost',
  excepcionValor: Object.freeze({ activa: false, monto: null, moneda: null }),
  excepcionEtapa: Object.freeze({ activa: false, etapaId: null }),
  guardada: false,
  actualizadaEn: null,
  actualizadaPor: null,
}) as ConfigDesinteres;

/** Fila real de la tabla (columnas verificadas por MCP). */
export interface FilaConfigDesinteres {
  organization_id: number;
  mode: string;
  value_exception_enabled: boolean;
  value_threshold: number | string | null;
  value_currency: string | null;
  stage_exception_enabled: boolean;
  advanced_stage_id: string | null;
  updated_by: string | null;
  updated_at: string | null;
}

export const COLUMNAS_CONFIG_DESINTERES =
  'organization_id, mode, value_exception_enabled, value_threshold, value_currency, stage_exception_enabled, advanced_stage_id, updated_by, updated_at';

function numeroONull(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function configDesdeFila(fila: FilaConfigDesinteres | null | undefined): ConfigDesinteres {
  if (!fila) return { ...CONFIG_DESINTERES_POR_DEFECTO };
  const modo = (MODOS_DESINTERES as readonly string[]).includes(fila.mode) ? (fila.mode as ModoDesinteres) : 'mark_lost';
  return {
    modo,
    excepcionValor: {
      activa: Boolean(fila.value_exception_enabled),
      monto: numeroONull(fila.value_threshold),
      moneda: normalizarCodigoMoneda(fila.value_currency),
    },
    excepcionEtapa: { activa: Boolean(fila.stage_exception_enabled), etapaId: fila.advanced_stage_id ?? null },
    guardada: true,
    actualizadaEn: fila.updated_at ?? null,
    actualizadaPor: fila.updated_by ?? null,
  };
}

/**
 * Lee la configuración de la organización. Sin fila → por defecto. Si la
 * lectura FALLA, no se adivina hacia lo destructivo: se devuelve `task_only`
 * (la persona decide) y se registra. Nunca se cierra una oportunidad con una
 * configuración que no se pudo leer.
 */
export async function leerConfigDesinteres(supabase: SupabaseClient, orgId: number): Promise<ConfigDesinteres> {
  const { data, error } = await supabase
    .from(TABLA_CONFIG_DESINTERES)
    .select(COLUMNAS_CONFIG_DESINTERES)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (error) {
    console.error(`[desinteresConfig] org ${orgId}: no se pudo leer la configuración (${error.message}); se deja tarea`);
    return { ...CONFIG_DESINTERES_POR_DEFECTO, modo: 'task_only' };
  }
  return configDesdeFila(data as FilaConfigDesinteres | null);
}

// ─── Validación de lo que llega del cliente ─────────────────────────────────

/** Cuerpo de `PUT /api/crm/voice-agents/desinteres`. La organización NO viaja aquí. */
export const configDesinteresSchema = z
  .object({
    modo: z.enum(MODOS_DESINTERES),
    excepcionValor: z
      .object({
        activa: z.boolean(),
        monto: z.number().finite().min(0, 'monto_negativo').max(1e15, 'monto_muy_alto').nullable(),
        moneda: z
          .string()
          .trim()
          .transform((s) => s.toUpperCase())
          .refine((s) => /^[A-Z]{3}$/.test(s), 'moneda_invalida')
          .nullable(),
      })
      .strict(),
    excepcionEtapa: z.object({ activa: z.boolean(), etapaId: z.string().uuid('etapa_invalida').nullable() }).strict(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.excepcionValor.activa && v.excepcionValor.monto === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['excepcionValor', 'monto'], message: 'monto_requerido' });
    }
    if (v.excepcionValor.activa && v.excepcionValor.moneda === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['excepcionValor', 'moneda'], message: 'moneda_requerida' });
    }
    if (v.excepcionEtapa.activa && v.excepcionEtapa.etapaId === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['excepcionEtapa', 'etapaId'], message: 'etapa_requerida' });
    }
  });

export type EntradaConfigDesinteres = z.infer<typeof configDesinteresSchema>;

// ─── Decisión ───────────────────────────────────────────────────────────────

export type AccionDesinteres = 'perdida' | 'tarea' | 'nada';

export type RazonDesinteres =
  | 'modo_perdida'
  | 'modo_tarea'
  | 'modo_nada'
  | 'politica_etapa'
  | 'excepcion_valor'
  | 'excepcion_valor_sin_tasa'
  | 'excepcion_etapa';

/** De más a menos prudente. */
const PRUDENCIA: Record<AccionDesinteres, number> = { nada: 3, tarea: 2, perdida: 1 };

export function masRestrictiva(a: AccionDesinteres, b: AccionDesinteres): AccionDesinteres {
  return PRUDENCIA[a] >= PRUDENCIA[b] ? a : b;
}

export interface EntradaDecision {
  config: ConfigDesinteres;
  /** `stage_agents.action_policy` de la llamada (null si no tiene etapa). */
  politicaEtapa: 'auto' | 'suggest' | null;
  /** Valor de la oportunidad (`opportunities.amount` / `.currency`). */
  oportunidad: { monto: number | string | null; moneda: string | null };
  /** Moneda base de la organización (`resolveOrgCurrency`). */
  monedaBase: string;
  /** `exchange_rates` de la organización (solo hacen falta si hay que convertir). */
  tasas: readonly TasaCambio[];
  /** Etapa actual de la oportunidad. */
  etapaActual: { pipelineId: string; position: number } | null;
  /** Etapa configurada en la excepción por etapa. */
  etapaAvanzada: { pipelineId: string; position: number } | null;
}

export interface DecisionDesinteres {
  accion: AccionDesinteres;
  razones: RazonDesinteres[];
  /** Valor de la oportunidad expresado en la moneda de la excepción (si se calculó). */
  valorComparado: { monto: number; moneda: string } | null;
}

/** Monto convertido de `de` a `a`: directo, o pasando por la base. null si no hay tasa. */
export function convertirMonto(
  monto: number,
  de: string,
  a: string,
  base: string,
  tasas: readonly TasaCambio[],
): number | null {
  if (de === a) return monto;
  const directa = tasaVigente(de, a, tasas);
  if (directa) return monto * directa.tasa;
  const aBase = de === base ? { tasa: 1 } : tasaVigente(de, base, tasas);
  const desdeBase = a === base ? { tasa: 1 } : tasaVigente(a, base, tasas);
  if (!aBase || !desdeBase || !(desdeBase.tasa > 0)) return null;
  return (monto * aBase.tasa) / desdeBase.tasa;
}

export function decidirAccionDesinteres(e: EntradaDecision): DecisionDesinteres {
  const razones: RazonDesinteres[] = [];
  let accion: AccionDesinteres;
  if (e.config.modo === 'log_only') {
    accion = 'nada';
    razones.push('modo_nada');
  } else if (e.config.modo === 'task_only') {
    accion = 'tarea';
    razones.push('modo_tarea');
  } else {
    accion = 'perdida';
    razones.push('modo_perdida');
  }

  if (e.politicaEtapa === 'suggest') {
    accion = masRestrictiva(accion, 'tarea');
    razones.push('politica_etapa');
  }

  let valorComparado: DecisionDesinteres['valorComparado'] = null;
  const ev = e.config.excepcionValor;
  const monto = numeroONull(e.oportunidad.monto);
  const monedaExcepcion = normalizarCodigoMoneda(ev.moneda);
  if (ev.activa && ev.monto !== null && monedaExcepcion && monto !== null && monto > 0) {
    const base = normalizarCodigoMoneda(e.monedaBase) ?? monedaExcepcion;
    const monedaOpp = normalizarCodigoMoneda(e.oportunidad.moneda) ?? base;
    const convertido = convertirMonto(monto, monedaOpp, monedaExcepcion, base, e.tasas);
    if (convertido === null) {
      accion = masRestrictiva(accion, 'tarea');
      razones.push('excepcion_valor_sin_tasa');
    } else {
      valorComparado = { monto: convertido, moneda: monedaExcepcion };
      if (convertido >= ev.monto) {
        accion = masRestrictiva(accion, 'tarea');
        razones.push('excepcion_valor');
      }
    }
  }

  const ee = e.config.excepcionEtapa;
  if (
    ee.activa &&
    e.etapaAvanzada &&
    e.etapaActual &&
    e.etapaActual.pipelineId === e.etapaAvanzada.pipelineId &&
    e.etapaActual.position >= e.etapaAvanzada.position
  ) {
    accion = masRestrictiva(accion, 'tarea');
    razones.push('excepcion_etapa');
  }

  return { accion, razones, valorComparado };
}

/** ¿Hace falta leer etapas/tasas para decidir? Evita consultas cuando no hay excepciones. */
export function necesitaDatosDeExcepciones(config: ConfigDesinteres): { etapas: boolean; valor: boolean } {
  return {
    etapas: config.excepcionEtapa.activa && Boolean(config.excepcionEtapa.etapaId),
    valor: config.excepcionValor.activa && config.excepcionValor.monto !== null && Boolean(config.excepcionValor.moneda),
  };
}
