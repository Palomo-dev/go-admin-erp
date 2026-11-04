// ============================================================
// PUT /api/integrations/wompi/credentials
// Guarda las credenciales de una conexión de Wompi en el Vault.
//
// Antes las escribía el navegador en claro en `integration_credentials.secret_ref`
// (wompiService.saveCredentials). Ahora:
// - sesión validada + administración (`withOrg({ admin: true })`); organización
//   ajena en body o query → 403 y registro (readOrgBody);
// - la conexión tiene que ser de la organización y de Wompi (404);
// - cada valor va al Vault con `fn_set_provider_secret` (solo service_role);
// - un campo vacío no cambia la credencial que ya había (edición parcial);
// - como hasta hoy, la conexión queda `connected` al guardar;
// - nunca se devuelve ni se registra un secreto.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { getServiceClient } from '@/lib/supabase/server-service';
import { WOMPI_CREDENTIAL_PURPOSES } from '@/lib/services/integrations/wompi/wompiConfig';
import { CONECTORES, conexionDelProveedor, registrarError, textoDe } from '@/lib/services/integrations/accesoIntegraciones';

const RUTA = '/api/integrations/wompi/credentials';

export const PUT = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<Record<string, unknown>>(ctx, request, { route: RUTA });
    const conexion = await conexionDelProveedor(ctx, body.connectionId, CONECTORES.wompi, RUTA);

    const entradas = [
      { ...WOMPI_CREDENTIAL_PURPOSES.PUBLIC_KEY, valor: textoDe(body.publicKey) },
      { ...WOMPI_CREDENTIAL_PURPOSES.PRIVATE_KEY, valor: textoDe(body.privateKey) },
      { ...WOMPI_CREDENTIAL_PURPOSES.EVENTS_SECRET, valor: textoDe(body.eventsSecret) },
      { ...WOMPI_CREDENTIAL_PURPOSES.INTEGRITY_SECRET, valor: textoDe(body.integritySecret) },
    ].filter((e) => e.valor !== '' && e.valor.length <= 4096);
    if (entradas.length === 0) {
      return NextResponse.json({ success: false, error: 'No llegó ninguna credencial' }, { status: 400 });
    }

    const db = getServiceClient();
    for (const e of entradas) {
      const { error } = await db.rpc('fn_set_provider_secret', {
        p_connection_id: conexion.id,
        p_purpose: e.purpose,
        p_value: e.valor,
        p_credential_type: e.credential_type,
      });
      if (error) {
        // Solo el propósito y el mensaje de Postgres: nunca el valor.
        registrarError(RUTA, new Error(`fn_set_provider_secret(${e.purpose}): ${error.message}`));
        return NextResponse.json({ success: false, error: 'No se pudieron guardar las credenciales' }, { status: 500 });
      }
    }

    const ahora = new Date().toISOString();
    const { error: errEstado } = await db
      .from('integration_connections')
      .update({ status: 'connected', connected_at: ahora, updated_at: ahora })
      .eq('id', conexion.id)
      .eq('organization_id', ctx.organizationId);
    if (errEstado) registrarError(RUTA, new Error(`estado de la conexión: ${errEstado.message}`));

    return NextResponse.json({ success: true, guardadas: entradas.map((e) => e.purpose) });
  } catch (err) {
    if (err instanceof OrgContextError) throw err;
    registrarError(RUTA, err);
    return NextResponse.json({ success: false, error: 'Error interno del servidor' }, { status: 500 });
  }
}, { admin: true });
