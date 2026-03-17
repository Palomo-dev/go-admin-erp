import { NextRequest, NextResponse } from 'next/server';
import { googleAdsService } from '@/lib/services/integrations/google-ads';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { connection_id, list_name, description, members } = body;

    if (!connection_id) {
      return NextResponse.json(
        { error: 'connection_id es requerido' },
        { status: 400 }
      );
    }

    if (!list_name) {
      return NextResponse.json(
        { error: 'list_name es requerido' },
        { status: 400 }
      );
    }

    if (!members || !Array.isArray(members) || members.length === 0) {
      return NextResponse.json(
        { error: 'members debe ser un array con al menos un miembro' },
        { status: 400 }
      );
    }

    // Validar que cada miembro tenga al menos un identificador
    const invalidMembers = members.filter(
      (m: any) => !m.hashedEmail && !m.hashedPhoneNumber
    );
    if (invalidMembers.length > 0) {
      return NextResponse.json(
        { error: 'Cada miembro debe tener hashedEmail o hashedPhoneNumber (SHA-256)' },
        { status: 400 }
      );
    }

    const result = await googleAdsService.uploadAudience(
      connection_id,
      list_name,
      description || '',
      members
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, userListResourceName: result.userListResourceName },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      userListResourceName: result.userListResourceName,
      membersCount: members.length,
    });
  } catch (error) {
    console.error('[GoogleAds] Error subiendo audiencia:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    );
  }
}
