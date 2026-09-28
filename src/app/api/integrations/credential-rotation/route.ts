// ============================================================
// GET /api/integrations/credential-rotation
// Estado de rotación de las credenciales QR de la organización de la sesión.
//
// SEGURIDAD (GO-sec, 2026-09-24): antes bastaba `auth.getSession()` y la
// organización salía de `?organizationId=` (cualquier organización veía el
// inventario de conexiones y credenciales de otra). Ahora sesión validada +
// administración (`withOrg({ admin: true })`); un `organizationId` ajeno en la
// query → 403 y registro (`readOrgBody`). El cliente puede seguir mandando la
// suya: no se usa, la organización es la de la sesión.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { OrgContextError } from '@/lib/utils/orgContextError';
import {
  checkAllCredentialsExpiry,
  generateRotationAlert,
  type CredentialExpiry,
  type RotationAlert,
} from '@/lib/services/integrations/qrShared/credentialRotation';

const RUTA = '/api/integrations/credential-rotation';

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });

    const credentials: CredentialExpiry[] = await checkAllCredentialsExpiry(ctx.organizationId);

    // Alertas para credenciales que requieren atención
    const alerts: RotationAlert[] = [];
    for (const cred of credentials) {
      if (cred.severity === 'none') continue;
      const daysOverdue = cred.needsRotation ? Math.abs(cred.daysUntilRotation) : -cred.daysUntilRotation;
      alerts.push(generateRotationAlert(cred.provider, cred.connectionId, daysOverdue));
    }

    return NextResponse.json({
      credentials,
      alerts,
      summary: {
        total: credentials.length,
        needsRotation: credentials.filter((c) => c.needsRotation).length,
        upcoming: credentials.filter((c) => c.severity === 'medium' && !c.needsRotation).length,
        healthy: credentials.filter((c) => c.severity === 'none').length,
      },
    });
  } catch (err) {
    if (err instanceof OrgContextError) throw err;
    console.error('[API Credential Rotation] Error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}, { admin: true });
