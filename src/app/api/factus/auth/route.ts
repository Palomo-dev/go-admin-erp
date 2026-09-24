/**
 * API Route: ¿conecta Factus para esta organización?
 * POST /api/factus/auth
 *
 * Exige sesión y membresía (`getServerOrgContext`) y NUNCA devuelve el token
 * (2026-09-22: antes lo entregaba sin sesión).
 *
 * Desde 2026-09-23 prueba la cuenta de Factus DE LA ORGANIZACIÓN (credenciales
 * cifradas en Vault que carga la plataforma). Sin servicio activo → 409. Las
 * variables `FACTUS_*` del entorno ya no se usan aquí.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { obtenerAccesoFactus, FacturacionNoActivadaError } from '@/lib/services/einvoicing/accesoFactus.server';

export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    await obtenerAccesoFactus(ctx.organizationId);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    if (error instanceof FacturacionNoActivadaError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    console.error('[factus/auth] error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Factus no aceptó las credenciales de la organización' }, { status: 502 });
  }
}
