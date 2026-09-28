// ============================================================
// POST /api/integrations/sendgrid/health-check
// Verifica credenciales de SendGrid.
//
// Body: { connectionId } — conexión guardada de la organización de la sesión.
// Body: { api_key } — prueba de una API Key todavía SIN guardar (asistente de
//   nueva conexión). Solo se prueba contra SendGrid: no se guarda ni se usa
//   para nada más.
//
// SEGURIDAD (GO-sec, 2026-09-24): antes bastaba `auth.getSession()` y
// cualquier sesión probaba (y marcaba en error) la conexión de otra
// organización. Ahora sesión validada + administración
// (`withOrg({ admin: true })`), organización ajena en body o query → 403 y
// registro, y una conexión ajena → 404.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { getServiceClient } from '@/lib/supabase/server-service';
import { sendgridService } from '@/lib/services/integrations/sendgrid/sendgridService';
import { CONECTORES, conexionDelProveedor, registrarError, textoDe } from '@/lib/services/integrations/accesoIntegraciones';

const RUTA = '/api/integrations/sendgrid/health-check';

export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<Record<string, unknown>>(ctx, request, { route: RUTA });

    // Modo 1: conexión ya guardada
    if (body.connectionId != null && body.connectionId !== '') {
      const db = getServiceClient();
      const conexion = await conexionDelProveedor(ctx, body.connectionId, CONECTORES.sendgrid, RUTA, db);
      const result = await sendgridService.healthCheck(conexion.id, db);
      return NextResponse.json({ valid: result.ok, message: result.message, scopes: result.scopes });
    }

    // Modo 2: API Key sin guardar (asistente)
    const apiKey = textoDe(body.api_key);
    if (apiKey) {
      const verification = await sendgridService.verifyApiKey(apiKey);
      return NextResponse.json({
        valid: verification.valid,
        message: verification.valid
          ? `API Key válida: ${verification.scopes.length} permisos (${verification.hasMailSend ? 'Mail Send ✓' : '⚠️ Sin Mail Send'})`
          : 'API Key inválida o expirada',
        scopes: verification.scopes,
        hasMailSend: verification.hasMailSend,
      });
    }

    return NextResponse.json({ error: 'Se requiere connectionId o api_key' }, { status: 400 });
  } catch (err) {
    if (err instanceof OrgContextError) throw err;
    registrarError(RUTA, err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}, { admin: true });
