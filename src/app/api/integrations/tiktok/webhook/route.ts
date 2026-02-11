import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/integrations/tiktok/webhook
 * Verificación del webhook (TikTok envía GET para verificar el endpoint).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const verifyToken = searchParams.get('verify_token');
  const challenge = searchParams.get('challenge');

  // TikTok puede enviar un challenge para verificar el endpoint
  const expectedToken = process.env.TIKTOK_WEBHOOK_VERIFY_TOKEN || 'goadmin_tiktok_verify';

  if (verifyToken === expectedToken && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ status: 'ok' });
}

/**
 * POST /api/integrations/tiktok/webhook
 * Recibir eventos/notificaciones de TikTok.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    console.log('TikTok webhook received:', JSON.stringify(body).substring(0, 500));

    // Procesar según el tipo de evento
    // TikTok webhooks son menos maduros que Meta, por ahora solo logueamos
    return NextResponse.json({ status: 'received' });
  } catch (error) {
    console.error('Error processing TikTok webhook:', error);
    return NextResponse.json({ status: 'error' }, { status: 500 });
  }
}
