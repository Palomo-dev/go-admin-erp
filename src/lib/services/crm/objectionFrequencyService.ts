/**
 * Frecuencia de objeciones en llamadas (Figma CRM 1409:17 «Frecuencia en
 * llamadas (90 días)» y 1410:118018 «Aparece en llamadas»), sobre la RPC
 * `crm_objection_frequency(p_org, p_since, p_timezone, p_objection)`
 * (aplicada; verificada por MCP el 2026-10-06). La RPC resuelve acceso a la
 * organización, miembro activo, sucursal y si se ven solo las llamadas propias
 * o todas (`crm.calls.view_all`). Aquí: la ventana de 90 días en la zona de la
 * organización y la validación de la respuesta. SOLO servidor.
 */
import { z } from 'zod';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { addPlainDays, plainDateToInstant, toPlainDate } from '@/lib/utils/dateDisplay';
import { CRM_PERMISOS, exigirPermisoCrm, exigirUuid, type CrmSesion } from './crmRouteSupport';

export const DIAS_FRECUENCIA = 90;

const contador = z.coerce.number().int().nonnegative();
export const frecuenciaSchema = z.object({
  frequencies: z.array(z.object({
    objection_id: z.string().uuid(),
    call_count: contador,
    advanced_count: contador,
    opportunity_count: contador,
    advanced_opportunity_count: contador,
  })),
  weeks: z.array(z.object({ week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), call_count: contador })),
  calls: z.array(z.object({
    call_id: z.string().uuid(),
    started_at: z.string(),
    advanced: z.boolean(),
    start_ms: contador.nullable(),
    customer_name: z.string().nullable().transform((v) => v ?? ''),
    seller_name: z.string().nullable().transform((v) => v ?? ''),
  })),
  responses: z.array(z.object({ response_text: z.string(), used_count: contador, advanced_count: contador })),
});

export type FrecuenciaObjeciones = z.infer<typeof frecuenciaSchema> & { desde: string; dias: number };

/** Inicio de la ventana: hoy − 90 días a las 00:00 en la zona de la organización. */
export function inicioVentana(timezone: string, ahora = new Date()): string {
  return plainDateToInstant(addPlainDays(toPlainDate(ahora, timezone), -DIAS_FRECUENCIA), timezone, '00:00');
}

export async function leerFrecuenciaObjeciones(ctx: CrmSesion, objecionId: string | null = null): Promise<FrecuenciaObjeciones> {
  if (objecionId) exigirUuid(objecionId, 'Objeción');
  await exigirPermisoCrm(ctx, [CRM_PERMISOS.oportunidadesVer], 'ver frecuencia de objeciones');
  const timezone = await getOrganizationTimezone(ctx.organizationId, ctx.supabase);
  const desde = inicioVentana(timezone);
  const { data, error } = await ctx.supabase.rpc('crm_objection_frequency', {
    p_org: ctx.organizationId,
    p_since: desde,
    p_timezone: timezone,
    p_objection: objecionId,
  });
  if (error) throw error;
  return { ...frecuenciaSchema.parse(data), desde, dias: DIAS_FRECUENCIA };
}
