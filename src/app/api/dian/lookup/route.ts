/**
 * API Route: Consulta DIAN/RUES
 * POST /api/dian/lookup
 *
 * Body: { documentType: string, documentNumber: string, dv?: string, organizationId?: number }
 * Response: { success: boolean, provider: string, fromCache: boolean, data: DianNormalizedData }
 *
 * Variables de entorno (server-side, nunca expuestas al cliente):
 * - DIAN_PROVIDER: "verifik" | "coresoft" (default: "verifik")
 * - VERIFIK_TOKEN: Bearer token de Verifik
 * - CORESOFT_API_KEY: API key de CoreSoft
 *
 * Seguridad: las API keys viven solo en el server. El cliente llama a esta ruta.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/config';
import { consultarDian, type DianLookupRequest } from '@/lib/services/dianLookupService';
import { mapearTipoDocADian, calcularDv } from '@/lib/utils/nitDv';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { documentType, documentNumber, dv, organizationId } = body;

    if (!documentNumber || typeof documentNumber !== 'string') {
      return NextResponse.json(
        { success: false, error: 'documentNumber es requerido' },
        { status: 400 }
      );
    }

    if (!documentType || typeof documentType !== 'string') {
      return NextResponse.json(
        { success: false, error: 'documentType es requerido' },
        { status: 400 }
      );
    }

    // Mapear tipo de documento interno a codigo DIAN
    const tipoDocDian = mapearTipoDocADian(documentType);
    const numeroLimpio = String(documentNumber).replace(/[^0-9]/g, '');

    if (!numeroLimpio) {
      return NextResponse.json(
        { success: false, error: 'Numero de documento invalido' },
        { status: 400 }
      );
    }

    // Validar DV localmente para NIT (ahorra consultas API si es invalido)
    let dvFinal = dv;
    if (tipoDocDian === '31' && !dvFinal) {
      const dvCalculado = calcularDv(numeroLimpio);
      if (dvCalculado !== null) dvFinal = String(dvCalculado);
    }

    // Obtener usuario autenticado (para auditoria de cache / Habeas Data)
    let userId: string | undefined;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id;
    } catch {
      // Sin usuario autenticado, continuar sin auditoria
    }

    const req: DianLookupRequest = {
      documentType: tipoDocDian,
      documentNumber: numeroLimpio,
      dv: dvFinal,
      organizationId,
      userId,
    };

    const resultado = await consultarDian(req);

    if (!resultado.success) {
      return NextResponse.json(resultado, { status: 502 });
    }

    return NextResponse.json(resultado);
  } catch (error: unknown) {
    console.error('Error en /api/dian/lookup:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/dian/lookup?documentType=31&documentNumber=900123456
 * Variante GET para consultas simples.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const documentType = searchParams.get('documentType') || '31';
  const documentNumber = searchParams.get('documentNumber') || '';
  const dv = searchParams.get('dv') || undefined;
  const organizationId = searchParams.get('organizationId')
    ? Number(searchParams.get('organizationId'))
    : undefined;

  if (!documentNumber) {
    return NextResponse.json(
      { success: false, error: 'documentNumber es requerido' },
      { status: 400 }
    );
  }

  const tipoDocDian = mapearTipoDocADian(documentType);
  const numeroLimpio = String(documentNumber).replace(/[^0-9]/g, '');

  let userId: string | undefined;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id;
  } catch {
    // sin usuario
  }

  const resultado = await consultarDian({
    documentType: tipoDocDian,
    documentNumber: numeroLimpio,
    dv,
    organizationId,
    userId,
  });

  if (!resultado.success) {
    return NextResponse.json(resultado, { status: 502 });
  }

  return NextResponse.json(resultado);
}
