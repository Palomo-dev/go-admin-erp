import { NextRequest, NextResponse } from 'next/server';
import { googleAdsService } from '@/lib/services/integrations/google-ads';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const connectionId = searchParams.get('connection_id');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');

    if (!connectionId) {
      return NextResponse.json(
        { error: 'connection_id es requerido' },
        { status: 400 }
      );
    }

    // Fechas por defecto: últimos 30 días
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const from = dateFrom || thirtyDaysAgo.toISOString().split('T')[0];
    const to = dateTo || today.toISOString().split('T')[0];

    const campaigns = await googleAdsService.getCampaignMetrics(connectionId, from, to);

    return NextResponse.json({
      campaigns,
      dateFrom: from,
      dateTo: to,
      count: campaigns.length,
    });
  } catch (error) {
    console.error('[GoogleAds] Error obteniendo campañas:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    );
  }
}
