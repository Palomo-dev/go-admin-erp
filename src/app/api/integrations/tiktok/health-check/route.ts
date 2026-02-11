import { NextRequest, NextResponse } from 'next/server';
import { tiktokMarketingService } from '@/lib/services/integrations/tiktok';

/**
 * POST /api/integrations/tiktok/health-check
 * Verificar que el access_token y advertiser_id son válidos.
 */
export async function POST(request: NextRequest) {
  try {
    const { access_token, advertiser_id } = await request.json();

    if (!access_token || !advertiser_id) {
      return NextResponse.json(
        { error: 'Se requieren access_token y advertiser_id' },
        { status: 400 }
      );
    }

    const result = await tiktokMarketingService.healthCheck(access_token, advertiser_id);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in TikTok health check:', error);
    return NextResponse.json(
      { valid: false, message: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    );
  }
}
