/**
 * GET /api/pos/hora-servidor — hora oficial del servidor, para medir el desfase
 * del reloj del equipo al abrir el POS o la caja (`src/lib/pos/reloj/desfaseReloj.ts`).
 *
 * Ligera y sin datos de negocio: no lee la base. Exige sesión y organización
 * (`getServerOrgContext`) como toda ruta del ERP, para no ser un servicio
 * público de hora. Sin caché: cada respuesta es la hora del momento.
 */

import { NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError, jsonError } from '@/lib/utils/orgContext';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await getServerOrgContext(request);
    return NextResponse.json(
      { ahora: new Date().toISOString() },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (err) {
    if (err instanceof OrgContextError) return jsonError(err.statusCode, err.code, err.message);
    return jsonError(500, 'hora_no_disponible');
  }
}
