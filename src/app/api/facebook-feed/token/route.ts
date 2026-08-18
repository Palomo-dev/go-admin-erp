import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateFeedToken, regenerateFeedToken } from '@/lib/services/facebookFeedService';

/**
 * POST /api/facebook-feed/token
 * Body: { organization_id: number, action: 'get' | 'regenerate' }
 *
 * Obtiene el token existente o lo regenera.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { organization_id, action } = body;

    if (!organization_id) {
      return NextResponse.json(
        { error: 'organization_id es requerido' },
        { status: 400 }
      );
    }

    const orgId = parseInt(organization_id, 10);
    if (isNaN(orgId)) {
      return NextResponse.json(
        { error: 'organization_id debe ser un número válido' },
        { status: 400 }
      );
    }

    if (action === 'regenerate') {
      const token = await regenerateFeedToken(orgId);
      return NextResponse.json({ success: true, token });
    }

    // action === 'get' (default)
    const token = await getOrCreateFeedToken(orgId);
    return NextResponse.json({ success: true, token });
  } catch (error: any) {
    console.error('Error in POST /api/facebook-feed/token:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error?.message },
      { status: 500 }
    );
  }
}
