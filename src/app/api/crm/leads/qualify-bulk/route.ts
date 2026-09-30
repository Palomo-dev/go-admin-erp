import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { CRM_PERMISOS, exigirPermisoCrm, respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { oportunidadAltaSchema } from '@/lib/services/crm/opportunityWriteService';
import { calificarLeadsEnLote } from '@/lib/services/crm/leadWriteService';
import { LARGO_MAXIMO_NOMBRE, MAX_LOTE_CALIFICAR } from '@/lib/services/crm/calificarLoteLogica';

/**
 * POST /api/crm/leads/qualify-bulk — «Calificar en lote» (CRM, Leads).
 *
 * Crea una oportunidad por lead, cada una con la misma RPC atómica que
 * `POST /api/crm/leads/[id]/qualify` (`calificarLead`): pipeline de ventas por
 * defecto si la plantilla no trae uno, `origen='lead'`, y lo que la plantilla
 * no trae se prellena desde cada lead (responsable, valor estimado…).
 *
 * Body: {
 *   customer_ids: uuid[] (1–100; los repetidos cuentan una vez),
 *   patron_nombre: string no vacío (`{cliente}` → nombre de cada lead),
 *   plantilla: cuerpo de `POST /api/crm/opportunities` sin `name`,
 *              `customer_id`, `origen` ni `origen_ref` (los fija el servidor)
 * }
 * `crm.opportunities.create`.
 * 200 { creadas: [{ customer_id, opportunity_id, nombre }],
 *       fallidas: [{ customer_id, nombre, codigo, mensaje }] } — resultado
 *     parcial por lead (estilo 207 en el cuerpo): un lead ajeno a la
 *     organización sale en `fallidas` con `no_encontrado`, nunca se crea.
 * 400 cuerpo inválido · 403 sin permiso u organización ajena en el body.
 */
const plantillaSchema = oportunidadAltaSchema.omit({ name: true, customer_id: true, origen: true, origen_ref: true });

const bodySchema = z
  .object({
    customer_ids: z.array(z.string().uuid()).min(1).max(MAX_LOTE_CALIFICAR),
    patron_nombre: z.string().trim().min(1).max(LARGO_MAXIMO_NOMBRE),
    plantilla: plantillaSchema.default({}),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const leido: Record<string, unknown> = await readOrgBody(ctx, request);
    const body = sinClavesDeOrganizacion(leido);
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.oportunidadesCrear], 'POST /api/crm/leads/qualify-bulk');
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }
    const { customer_ids, patron_nombre, plantilla } = parsed.data;
    const data = await calificarLeadsEnLote(ctx, customer_ids, plantilla, patron_nombre);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return respuestaErrorCrm(error, 'POST /api/crm/leads/qualify-bulk');
  }
}
