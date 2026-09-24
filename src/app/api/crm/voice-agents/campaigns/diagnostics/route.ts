/**
 * GET /api/crm/voice-agents/campaigns/diagnostics — por qué no llama nadie.
 *
 * Lectura, así que basta con ser miembro activo: la organización sale de la
 * sesión (`withOrg` → `getServerOrgContext`) y el diagnóstico se hace con el
 * cliente del usuario, bajo RLS. No devuelve ninguna credencial: solo códigos de
 * motivo y contadores (ver `voiceCampaignDiagnostics.ts`).
 */

import { NextResponse } from 'next/server';
import { hasOrgAdminOrPermission, withOrg } from '@/lib/utils/orgContext';
import { diagnosticarCampanasDeVoz } from '@/lib/services/crm/voiceCampaignDiagnostics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx) => {
  try {
    // `puede_ejecutar` se resuelve en el SERVIDOR con el mismo predicado que
    // exige `run-now` (`withOrg(..., { admin: true })`): así el panel no ofrece
    // un botón que va a devolver 403, y el permiso no se deduce de ningún dato
    // del cliente ni del nombre del rol (regla dura 6).
    const [data, puedeEjecutar] = await Promise.all([
      diagnosticarCampanasDeVoz(ctx.organizationId, ctx.supabase),
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
