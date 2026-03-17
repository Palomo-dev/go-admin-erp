import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateICalFeed } from '@/lib/services/icalService';

/**
 * GET /api/pms/ical/[token]
 * 
 * Endpoint público que genera un feed iCal (.ics) para un espacio.
 * Airbnb, Booking.com y otros OTAs se suscriben a esta URL.
 * 
 * El token es único por conexión de canal y se genera automáticamente.
 * No requiere autenticación — solo el token secreto.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token || token.length < 32) {
      return NextResponse.json(
        { error: 'Token inválido' },
        { status: 400 }
      );
    }

    // Usar service role para acceder sin RLS (endpoint público por token)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Buscar conexión por token
    const { data: connection, error: connError } = await supabaseAdmin
      .from('channel_connections')
      .select(`
        id,
        organization_id,
        space_id,
        channel,
        is_active,
        spaces (
          id,
          label,
          space_types ( name )
        )
      `)
      .eq('ical_export_token', token)
      .eq('is_active', true)
      .maybeSingle();

    if (connError || !connection) {
      return NextResponse.json(
        { error: 'Calendario no encontrado' },
        { status: 404 }
      );
    }

    // Obtener nombre de la organización
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('name')
      .eq('id', connection.organization_id)
      .single();

    // Obtener reservas activas del espacio
    const today = new Date().toISOString().split('T')[0];
    const { data: reservations } = await supabaseAdmin
      .from('reservations')
      .select('id, checkin, checkout, status, channel, notes')
      .eq('space_id', connection.space_id)
      .eq('organization_id', connection.organization_id)
      .in('status', ['tentative', 'confirmed', 'checked_in'])
      .gte('checkout', today);

    // Obtener bloqueos de otros canales (para que Airbnb vea las fechas de Booking, etc.)
    const { data: channelBlocks } = await supabaseAdmin
      .from('channel_blocks')
      .select('id, start_date, end_date, summary, channel')
      .eq('space_id', connection.space_id)
      .neq('channel', connection.channel) // Excluir bloqueos del mismo canal
      .gte('end_date', today);

    // Obtener bloqueos manuales (si existe la tabla)
    let manualBlocks: Array<{ id: string; start_date: string; end_date: string; reason?: string }> = [];
    const { data: spaceBlocks, error: sbError } = await supabaseAdmin
      .from('space_blocks')
      .select('id, start_date, end_date, reason')
      .eq('space_id', connection.space_id)
      .gte('end_date', today);

    if (!sbError && spaceBlocks) {
      manualBlocks = spaceBlocks;
    }

    // Combinar bloqueos de canales y manuales
    const allBlocks = [
      ...(channelBlocks || []).map(b => ({
        id: b.id,
        start_date: b.start_date,
        end_date: b.end_date,
        summary: b.summary || `Reservado (${b.channel})`,
      })),
      ...manualBlocks.map(b => ({
        id: b.id,
        start_date: b.start_date,
        end_date: b.end_date,
        summary: b.reason || 'No disponible',
      })),
    ];

    const spaceData = Array.isArray(connection.spaces) ? connection.spaces[0] : connection.spaces;
    const spaceName = spaceData?.label || 'Espacio';
    const orgName = org?.name || 'GO Admin ERP';

    const icalContent = generateICalFeed(
      spaceName,
      orgName,
      reservations || [],
      allBlocks
    );

    // Responder con content-type iCal
    return new NextResponse(icalContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `inline; filename="${spaceName.replace(/[^a-zA-Z0-9]/g, '_')}.ics"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error: any) {
    console.error('Error generando feed iCal:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
