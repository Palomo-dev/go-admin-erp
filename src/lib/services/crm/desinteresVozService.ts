/**
 * Leer y guardar qué hace el agente de voz ante el desinterés definitivo
 * (`crm_voice_disinterest_settings`, decisión del dueño 2026-10-07). Lo usa
 * `GET|PUT /api/crm/voice-agents/desinteres`; la lógica de decisión vive en
 * `voiceAgent/desinteresConfig.ts` (sin next/server, la usa el ws-server).
 *
 * Permisos (regla dura 6): se resuelven en el servidor con la sesión.
 *  - Leer: cualquier miembro de la organización (RLS por pertenencia).
 *  - Cambiar: `crm.stages.manage` («Configurar etapas»), el mismo permiso que
 *    configura la política de la etapa (`stage_agents.action_policy`) y las
 *    etapas del pipeline (`/api/crm/stages`). Los administradores pasan por
 *    `hasOrgAdminOrPermission`. La política RLS de escritura exige lo mismo
 *    (`fn_crm_tiene_permiso`): defensa en profundidad.
 * Cliente: el de la sesión del usuario (`ctx.supabase`, con RLS), nunca el de
 * servicio. La organización sale del contexto, nunca del body.
 */

import { resolveOrgCurrency } from '@/lib/services/monedaOrganizacion';
import { CRM_PERMISOS, CrmHttpError, exigirPermisoCrm, tienePermisoCrm, type CrmSesion } from './crmRouteSupport';
import {
  COLUMNAS_CONFIG_DESINTERES,
  TABLA_CONFIG_DESINTERES,
  configDesdeFila,
  type ConfigDesinteres,
  type EntradaConfigDesinteres,
  type FilaConfigDesinteres,
} from './voiceAgent/desinteresConfig';

export interface EtapaOpcionDesinteres {
  id: string;
  nombre: string;
  posicion: number;
  pipelineId: string;
  pipelineNombre: string;
  /** Lugar entre las etapas abiertas del pipeline (1 de N). */
  orden: number;
  total: number;
}

export interface VistaConfigDesinteres {
  config: ConfigDesinteres;
  puedeEditar: boolean;
  monedaBase: string;
  monedas: string[];
  etapas: EtapaOpcionDesinteres[];
}

async function etapasDeVentas(ctx: CrmSesion): Promise<EtapaOpcionDesinteres[]> {
  const { data, error } = await ctx.supabase
    .from('pipelines')
    .select('id, name, pipeline_type, stages(id, name, position, is_won, is_lost)')
    .eq('organization_id', ctx.organizationId)
    .eq('pipeline_type', 'sales')
    .order('name', { ascending: true });
  if (error) throw error;
  const salida: EtapaOpcionDesinteres[] = [];
  for (const p of (data ?? []) as Array<{ id: string; name: string; stages: Array<{ id: string; name: string; position: number; is_won: boolean | null; is_lost: boolean | null }> | null }>) {
    const abiertas = (p.stages ?? []).filter((s) => !s.is_won && !s.is_lost).sort((a, b) => a.position - b.position);
    abiertas.forEach((s, i) =>
      salida.push({ id: s.id, nombre: s.name, posicion: s.position, pipelineId: p.id, pipelineNombre: p.name, orden: i + 1, total: abiertas.length }),
    );
  }
  return salida;
}

async function monedasDe(ctx: CrmSesion, base: string): Promise<string[]> {
  const { data, error } = await ctx.supabase.from('organization_currencies').select('currency_code').eq('organization_id', ctx.organizationId);
  if (error) throw error;
  const codigos = new Set<string>([base]);
  for (const f of (data ?? []) as Array<{ currency_code: string | null }>) {
    const c = (f.currency_code ?? '').trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(c)) codigos.add(c);
  }
  return [...codigos];
}

export async function leerFilaConfig(ctx: CrmSesion): Promise<ConfigDesinteres> {
  const { data, error } = await ctx.supabase
    .from(TABLA_CONFIG_DESINTERES)
    .select(COLUMNAS_CONFIG_DESINTERES)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (error) throw error;
  return configDesdeFila(data as FilaConfigDesinteres | null);
}

export async function obtenerConfigDesinteres(ctx: CrmSesion): Promise<VistaConfigDesinteres> {
  const [config, puedeEditar, moneda, etapas] = await Promise.all([
    leerFilaConfig(ctx),
    tienePermisoCrm(ctx, CRM_PERMISOS.etapasGestionar),
    resolveOrgCurrency(ctx.supabase, ctx.organizationId),
    etapasDeVentas(ctx),
  ]);
  const monedas = await monedasDe(ctx, moneda.code);
  if (config.excepcionValor.moneda && !monedas.includes(config.excepcionValor.moneda)) monedas.push(config.excepcionValor.moneda);
  return { config, puedeEditar, monedaBase: moneda.code, monedas, etapas };
}

/** La moneda existe en el catálogo (`currencies`). */
async function monedaValida(ctx: CrmSesion, codigo: string): Promise<boolean> {
  const { data, error } = await ctx.supabase.from('currencies').select('code').eq('code', codigo).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function guardarConfigDesinteres(ctx: CrmSesion, entrada: EntradaConfigDesinteres): Promise<VistaConfigDesinteres> {
  await exigirPermisoCrm(ctx, [CRM_PERMISOS.etapasGestionar], 'PUT /api/crm/voice-agents/desinteres');

  const v = entrada.excepcionValor;
  if (v.moneda && !(await monedaValida(ctx, v.moneda))) {
    throw new CrmHttpError(400, 'moneda_invalida', 'La moneda no existe', { campo: 'excepcionValor.moneda' });
  }
  const e = entrada.excepcionEtapa;
  if (e.etapaId) {
    // La etapa tiene que ser de un pipeline de VENTAS de esta organización y no terminal.
    const etapas = await etapasDeVentas(ctx);
    if (!etapas.some((x) => x.id === e.etapaId)) {
      throw new CrmHttpError(400, 'etapa_invalida', 'La etapa no es de un pipeline de ventas de la organización', { campo: 'excepcionEtapa.etapaId' });
    }
  }

  const fila = {
    organization_id: ctx.organizationId,
    mode: entrada.modo,
    value_exception_enabled: v.activa,
    value_threshold: v.monto,
    value_currency: v.moneda,
    stage_exception_enabled: e.activa,
    advanced_stage_id: e.etapaId,
    updated_by: ctx.userId,
    updated_at: new Date().toISOString(),
  };
  const { error } = await ctx.supabase.from(TABLA_CONFIG_DESINTERES).upsert(fila, { onConflict: 'organization_id' });
  if (error) throw error;
  return obtenerConfigDesinteres(ctx);
}
