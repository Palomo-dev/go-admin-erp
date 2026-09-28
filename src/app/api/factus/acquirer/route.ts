/**
 * API Route: Consulta de adquiriente en DIAN via Factus
 * GET /api/factus/acquirer?documentType=13&documentNumber=123456789
 *
 * Devuelve nombre y email del adquiriente desde la base oficial de DIAN.
 * No devuelve telefono, direccion, responsabilidades fiscales, etc.
 *
 * Rate limit: 80 req/min por usuario (gestionado por Factus).
 *
 * Credenciales: las de la cuenta de Factus de la organización (Vault, las carga
 * la plataforma). Las `FACTUS_*` del entorno solo sirven en desarrollo.
 */

import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { NextRequest, NextResponse } from 'next/server';
import factusService from '@/lib/services/factusService';
import { obtenerAccesoFactus, FacturacionNoActivadaError } from '@/lib/services/einvoicing/accesoFactus.server';
import { PERMISOS_FINANZAS, requireOrgPermission } from '@/lib/security/orgGuards';

export async function GET(request: NextRequest) {
  try {
    // /api/factus está fuera del middleware: sin esta guarda, cualquiera en
    // internet usaba la cuenta de Factus de la plataforma. Además, `finance.view`
    // resuelto en el servidor: consultar la DIAN gasta la cuenta de la organización.
    let ctx;
    try {
      ctx = await getServerOrgContext(request);
      await requireOrgPermission(ctx, PERMISOS_FINANZAS.VER, 'factus/acquirer');
    } catch (err) {
      if (err instanceof OrgContextError) {
        return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
      }
      throw err;
    }
    const { searchParams } = new URL(request.url);
    const documentType = searchParams.get('documentType');
    const documentNumber = searchParams.get('documentNumber');

    if (!documentType || typeof documentType !== 'string') {
      return NextResponse.json(
        { success: false, error: 'documentType es requerido (codigo DIAN: 13, 31, 41, etc.)' },
        { status: 400 }
      );
    }

    if (!documentNumber || typeof documentNumber !== 'string') {
      return NextResponse.json(
        { success: false, error: 'documentNumber es requerido' },
        { status: 400 }
      );
    }

    const numeroLimpio = String(documentNumber).replace(/[^0-9]/g, '');
    if (!numeroLimpio || numeroLimpio.length < 4) {
      return NextResponse.json(
        { success: false, error: 'Numero de documento invalido (minimo 4 digitos)' },
        { status: 400 }
      );
    }

    // Cuenta de Factus de la organización; la demo del entorno solo en desarrollo.
    let acceso;
    try {
      acceso = await obtenerAccesoFactus(ctx.organizationId, { permitirDemoDesarrollo: true });
    } catch (err) {
      if (err instanceof FacturacionNoActivadaError) {
        return NextResponse.json(
          { success: false, error: 'La facturación electrónica no está activa para esta organización', code: err.code },
          { status: 409 }
        );
      }
      throw err;
    }

    const data = await factusService.getAcquirer(
      acceso.environment,
      acceso.accessToken,
      documentType,
      numeroLimpio
    );

    return NextResponse.json({
      success: true,
      provider: 'factus',
      fromCache: false,
      data,
    });
  } catch (error: unknown) {
    console.error('Error en /api/factus/acquirer:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';

    // 404 = adquiriente no encontrado, devolver como respuesta normal (no error 500)
    if (message.includes('no encontrado') || message.includes('404')) {
      return NextResponse.json(
        { success: false, error: 'Adquiriente no encontrado en DIAN', provider: 'factus' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
