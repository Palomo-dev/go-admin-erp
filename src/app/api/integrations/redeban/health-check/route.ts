// ============================================================
// POST /api/integrations/redeban/health-check
// Verifica que las credenciales de Redeban sean validas.
//
// SEGURIDAD (GO-sec, 2026-09-24): sesion + administracion de la organizacion
// (`withOrg({ admin: true })`); organizacion ajena en body o query → 403 y
// registro. La conexion debe ser de la organizacion de la sesion y de este
// proveedor (404 si no): antes, cualquier sesion probaba las credenciales de
// una conexion ajena con solo conocer su id.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { getServiceClient } from '@/lib/supabase/server-service';
import { redebanService } from '@/lib/services/integrations/redeban';
import { conexionDeLaOrganizacion } from '@/lib/services/integrations/qrShared/cobroQrServidor';

const RUTA = '/api/integrations/redeban/health-check';
const CONECTORES = ['redeban_qr'] as const;

export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<Record<string, unknown>>(ctx, request, { route: RUTA });
    const connectionId = typeof body.connectionId === 'string' ? body.connectionId.trim() : '';
    if (!connectionId) {
      return NextResponse.json({ error: 'connectionId es requerido' }, { status: 400 });
    }

    const conexion = await conexionDeLaOrganizacion(getServiceClient(), ctx.organizationId, connectionId, CONECTORES);
    const result = await redebanService.healthCheck(conexion.id);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof OrgContextError) throw err;
    console.error('[API Redeban Health] Error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}, { admin: true });
