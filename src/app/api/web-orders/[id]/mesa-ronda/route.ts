import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyWebOrdersSecret, webhookErrorResponse } from '@/lib/security/webhookSignatures';
import { getServiceClient } from '@/lib/supabase/server-service';
import { entrarRondaQrALaMesa } from '@/lib/services/rondaQrMesa';

/**
 * POST /api/web-orders/[id]/mesa-ronda — la ronda de la Carta QR entra sola a
 * la cuenta de la mesa y a cocina cuando la sede lo activó
 * (`qr_rounds_auto_confirm`) y la mesa ya tiene una sesión abierta por el
 * equipo. Si no, responde `{ auto: false, motivo }` y la ronda sigue en POS ›
 * Pedidos online para que el equipo la confirme (lo de siempre).
 *
 * Solo servidor a servidor: el sitio la llama justo después de crear la ronda
 * en /api/orders, con `x-webhook-secret` (fail-closed). La organización sale
 * del pedido; el body no trae nada.
 */
export const dynamic = 'force-dynamic';

const idSchema = z.string().uuid();

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    verifyWebOrdersSecret(request);
  } catch (err) {
    return webhookErrorResponse(err);
  }
  const { id } = await params;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return NextResponse.json({ auto: false, error: 'id_invalido' }, { status: 400 });
  try {
    const r = await entrarRondaQrALaMesa(getServiceClient(), parsed.data);
    return NextResponse.json(r, { status: r.motivo === 'pedido_no_encontrado' ? 404 : 200 });
  } catch (error: unknown) {
    console.error('[POST /api/web-orders/[id]/mesa-ronda]', { orderId: parsed.data, message: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ auto: false, error: 'error_interno' }, { status: 500 });
  }
}
