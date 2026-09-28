/**
 * POST /api/crm/voice-agents/campaigns/run-now — «Ejecutar ahora» desde el panel.
 *
 * Camino SEPARADO del cron, a propósito. `/api/crm/voice-agents/campaigns/run` y
 * `/api/voice/agent-campaigns/run` siguen siendo fail-closed por `CRON_SECRET` y
 * no se tocan: debilitar ese contrato (aceptar «o secreto o sesión») convertiría
 * el punto de entrada del planificador en una superficie con dos autenticaciones,
 * y la más débil manda siempre. Aquí, en cambio, no hay secreto alguno:
 *
 *  - la organización sale de la SESIÓN (`withOrg` → `getServerOrgContext`), nunca
 *    del cuerpo (regla dura 5); `readOrgBody` convierte una organización ajena en
 *    el cuerpo o en la query en 403 + registro;
 *  - el permiso se resuelve en el SERVIDOR con el MISMO criterio que «Lanzar» de
 *    campañas (`withOrg(..., { admin: true })` → `requireOrgAdminOrPermission`:
 *    `organization_members.is_super_admin`, role_id 1|2 o el permiso
 *    `admin.full_access` resuelto en la base). Nunca por el nombre del rol y
 *    nunca con un valor del cliente (regla dura 6).
 *
 * El trabajo lo hace `runCampaignsForOrg`, el mismo punto que usa el cron: no hay
 * una segunda implementación del despachador (regla dura 7). Se ejecuta con el
 * cliente service-role porque el despachador escribe en `calls`,
 * `voice_agent_calls` y `comm_settings`, y la organización ya está validada.
 */

import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import { runCampaignsForOrg } from '@/lib/services/crm/voiceAgentCron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const POST = withOrg(
  async (ctx, request) => {
    // No se espera ningún dato del cuerpo: se lee solo para que una organización
    // ajena en el cuerpo o en `?organization_id=` responda 403 y quede registrada.
    await readOrgBody<unknown>(ctx, request);

    try {
      const data = await runCampaignsForOrg(
        getServiceClient(),
        ctx.organizationId,
        `panel-${Date.now().toString(36)}`
      );
      return NextResponse.json(
        { success: true, data },
        { status: 200, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      console.error('[voice-agents/campaigns/run-now]', message);
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  },
  { admin: true }
);
