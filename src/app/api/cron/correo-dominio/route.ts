/** Reintenta la verificación de correo de los dominios comprados. */
import { NextRequest, NextResponse } from 'next/server';
import { activarCorreosComprados } from '@/lib/services/website/dominios/activarCorreoDominio';
import { verifyCronSecret, webhookErrorResponse } from '@/lib/security/webhookSignatures';
import { getServiceClient } from '@/lib/supabase/server-service';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    verifyCronSecret(request);
  } catch (err) {
    return webhookErrorResponse(err);
  }
  try {
    const resultado = await activarCorreosComprados(getServiceClient(), 5);
    return NextResponse.json({ ok: true, ...resultado });
  } catch (error) {
    console.error('[cron/correo-dominio]', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
