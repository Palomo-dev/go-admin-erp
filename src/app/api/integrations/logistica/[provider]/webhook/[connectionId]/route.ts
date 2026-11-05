/**
 * POST /api/integrations/logistica/[provider]/webhook/[connectionId] — avisos de transportadoras,
 * Effi y Dropi. URL única por conexión (organización + proveedor).
 *
 * Cerrado por defecto (`verificarWebhookLogistica`): sin verificación de firma del adaptador no se
 * procesa nada; responde 501 sin leer el cuerpo ni escribir en la base. Conexión inexistente, de
 * otro proveedor o revocada: 404. Nunca se usa una organización que venga en el payload.
 */
import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server-service';
import { verificarWebhookLogistica } from '@/lib/services/transporte/webhookLogistica.server';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'no-store' } as const;

export async function POST(_request: Request, ctx: { params: Promise<{ provider: string; connectionId: string }> }) {
  const { provider, connectionId } = await ctx.params;
  try {
    const v = await verificarWebhookLogistica(getServiceClient(), provider, connectionId);
    return NextResponse.json({ ok: false, codigo: v.codigo, error: v.mensaje }, { status: v.status, headers: SIN_CACHE });
  } catch (err) {
    console.error('[webhook logística]', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, codigo: 'INTERNAL' }, { status: 500, headers: SIN_CACHE });
  }
}
