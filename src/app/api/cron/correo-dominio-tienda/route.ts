/**
 * GET /api/cron/correo-dominio-tienda
 *
 * Cada 15 minutos toma la cola del correo de la tienda. El dominio raíz se
 * registra una sola vez; los reintentos esperan con backoff hasta 72 horas.
 * Lote pequeño, para no golpear al proveedor.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret, webhookErrorResponse } from '@/lib/security/webhookSignatures';
import { revisarPendientesCorreoTienda } from '@/lib/services/website/dominios/correoTienda';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    verifyCronSecret(request);
  } catch (err) {
    return webhookErrorResponse(err);
  }
  try {
    const resultado = await revisarPendientesCorreoTienda();
    return NextResponse.json({ success: true, ...resultado });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno';
    console.error('[correo-dominio-tienda]', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
