import { NextRequest, NextResponse } from 'next/server';
import { googleAdsService } from '@/lib/services/integrations/google-ads';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { connection_id } = body;

    if (!connection_id) {
      return NextResponse.json(
        { error: 'connection_id es requerido' },
        { status: 400 }
      );
    }

    const result = await googleAdsService.healthCheck(connection_id);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[GoogleAds] Error en health-check:', error);
    return NextResponse.json(
      { valid: false, message: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    );
  }
}
