// ============================================================
// POST /api/integrations/meta/send-event
// Envía eventos a la Conversions API (CAPI) con el píxel de la conexión.
//
// SEGURIDAD (GO-sec, 2026-09-24): antes bastaba `auth.getSession()` y el
// token y el píxel salían de cualquier `connection_id`: una sesión podía
// ensuciar las conversiones del píxel de otra organización. Ahora sesión
// validada (`withOrg`), organización ajena en body o query → 403 y registro,
// permiso `integrations.edit` resuelto en el servidor y la conexión tiene que
// ser `meta_marketing` de la organización (404 si no).
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { getServiceClient } from '@/lib/supabase/server-service';
import { metaMarketingService } from '@/lib/services/integrations/meta';
import type { CAPIEventData } from '@/lib/services/integrations/meta';
import {
  CONECTORES,
  conexionDelProveedor,
  exigirPermiso,
  PERMISO_INTEGRACIONES_EDITAR,
  registrarError,
} from '@/lib/services/integrations/accesoIntegraciones';

const RUTA = '/api/integrations/meta/send-event';
const MAX_EVENTOS = 1000;

export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<Record<string, unknown>>(ctx, request, { route: RUTA });
    await exigirPermiso(ctx, PERMISO_INTEGRACIONES_EDITAR, RUTA);

    const events = body.events;
    if (!Array.isArray(events) || events.length === 0 || events.length > MAX_EVENTOS) {
      return NextResponse.json({ error: `events es requerido (1 a ${MAX_EVENTOS})` }, { status: 400 });
    }

    const db = getServiceClient();
    const conexion = await conexionDelProveedor(ctx, body.connection_id, CONECTORES.meta, RUTA, db);
    const credentials = await metaMarketingService.getCredentials(conexion.id, db);
    if (!credentials?.accessToken || !credentials?.pixelId) {
      return NextResponse.json(
        { error: 'La conexión de Meta Marketing no tiene access_token y pixel_id', code: 'CREDENCIALES_NO_CONFIGURADAS' },
        { status: 412 },
      );
    }

    const result = await metaMarketingService.sendEvent(credentials.accessToken, credentials.pixelId, events as CAPIEventData[]);
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof OrgContextError) throw err;
    registrarError(RUTA, err);
    return NextResponse.json({ error: 'Error al enviar evento' }, { status: 500 });
  }
});
