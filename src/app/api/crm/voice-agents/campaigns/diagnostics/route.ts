/**
 * GET /api/crm/voice-agents/campaigns/diagnostics — por qué no llama nadie.
 *
 * Lectura, así que basta con ser miembro activo: la organización sale de la
 * sesión (`withOrg` → `getServerOrgContext`). El diagnóstico usa el cliente de
 * SERVICIO, como `run-now`: repite las barreras del despachador y una de ellas
 * lee `comm_settings`, que solo concede SELECT a `service_role` (guarda
 * credenciales de Twilio). Con el cliente del usuario fallaba con 42501 y el
 * panel escondía «Ejecutar ahora». Toda consulta del diagnóstico filtra por la
 * organización ya validada y no devuelve credenciales: solo códigos de motivo y
 * contadores (ver `voiceCampaignDiagnostics.ts`).
 */

import { NextResponse } from 'next/server';
import { hasOrgAdminOrPermission, withOrg } from '@/lib/utils/orgContext';
import { diagnosticarCampanasDeVoz } from '@/lib/services/crm/voiceCampaignDiagnostics';
import { getServiceClient } from '@/lib/supabase/server-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx) => {
  try {
    // `puede_ejecutar` se resuelve en el SERVIDOR con el mismo predicado que
    // exige `run-now` (`withOrg(..., { admin: true })`): así el panel no ofrece
    // un botón que va a devolver 403, y el permiso no se deduce de ningún dato
    // del cliente ni del nombre del rol (regla dura 6).
    const [data, puedeEjecutar] = await Promise.all([
      diagnosticarCampanasDeVoz(ctx.organizationId, getServiceClient()),
      hasOrgAdminOrPermission(ctx),
    ]);
    return NextResponse.json(
      { success: true, data, puede_ejecutar: puedeEjecutar },
      { status: 200, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[voice-agents/campaigns/diagnostics]', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
