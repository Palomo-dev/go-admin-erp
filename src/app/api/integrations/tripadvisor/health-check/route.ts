import { NextRequest, NextResponse } from 'next/server';
import { tripadvisorContentService } from '@/lib/services/integrations/tripadvisor';
import type { TripAdvisorHealthCheckResult } from '@/lib/services/integrations/tripadvisor';

/**
 * POST /api/integrations/tripadvisor/health-check
 * Verificar que la API Key de TripAdvisor es válida.
 * Body (opcional): { apiKey?: string }
 */
export async function POST(request: NextRequest) {
  try {
    let apiKey: string | undefined;

    try {
      const body = await request.json();
      apiKey = body?.apiKey;
    } catch {
      // Body vacío o no JSON — usar env var
    }

    const result: TripAdvisorHealthCheckResult = await tripadvisorContentService.healthCheck(apiKey);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[API TripAdvisor HealthCheck] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
