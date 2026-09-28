// ============================================================
// POST /api/integrations/google-ads/upload-audience
// Sube una audiencia (Customer Match) a la cuenta de Google Ads de la
// organización.
//
// SEGURIDAD (GO-sec, 2026-09-24): antes NO tenía autenticación en el handler:
// cualquiera subía listas a la cuenta de anuncios de otra organización con
// solo conocer el id de su conexión. Ahora sesión validada (`withOrg`),
// organización ajena en body o query → 403 y registro, permiso
// `integrations.edit` y la conexión tiene que ser `google_ads` de la
// organización (404 si no).
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { googleAdsService } from '@/lib/services/integrations/google-ads';
import {
  CONECTORES,
  conexionDelProveedor,
  exigirPermiso,
  PERMISO_INTEGRACIONES_EDITAR,
  registrarError,
  textoDe,
} from '@/lib/services/integrations/accesoIntegraciones';

const RUTA = '/api/integrations/google-ads/upload-audience';
const MAX_MIEMBROS = 100_000;

type Miembro = { hashedEmail?: string; hashedPhoneNumber?: string };

export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<Record<string, unknown>>(ctx, request, { route: RUTA });
    await exigirPermiso(ctx, PERMISO_INTEGRACIONES_EDITAR, RUTA);

    const listName = textoDe(body.list_name);
    if (!listName) {
      return NextResponse.json({ error: 'list_name es requerido' }, { status: 400 });
    }
    const members = body.members;
    if (!Array.isArray(members) || members.length === 0 || members.length > MAX_MIEMBROS) {
      return NextResponse.json({ error: `members debe ser un array con 1 a ${MAX_MIEMBROS} miembros` }, { status: 400 });
    }
    // Cada miembro con al menos un identificador (SHA-256)
    const invalidos = (members as Miembro[]).filter((m) => !m || (!m.hashedEmail && !m.hashedPhoneNumber));
    if (invalidos.length > 0) {
      return NextResponse.json(
        { error: 'Cada miembro debe tener hashedEmail o hashedPhoneNumber (SHA-256)' },
        { status: 400 }
      );
    }

    const conexion = await conexionDelProveedor(ctx, body.connection_id, CONECTORES.googleAds, RUTA);
    const result = await googleAdsService.uploadAudience(conexion.id, listName, textoDe(body.description), members as Miembro[]);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, userListResourceName: result.userListResourceName },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      userListResourceName: result.userListResourceName,
      membersCount: members.length,
    });
  } catch (err) {
    if (err instanceof OrgContextError) throw err;
    registrarError(RUTA, err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
});
