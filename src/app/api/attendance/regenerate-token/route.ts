import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const { deviceId } = await request.json();

    if (!deviceId) {
      return NextResponse.json({ error: 'deviceId es requerido' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // Verificar que el dispositivo existe y está activo
    const { data: device, error: deviceError } = await supabase
      .from('time_clocks')
      .select('id, organization_id, is_active')
      .eq('id', deviceId)
      .single();

    if (deviceError || !device) {
      return NextResponse.json({ error: 'Dispositivo no encontrado' }, { status: 404 });
    }

    if (!device.is_active) {
      return NextResponse.json({ error: 'Dispositivo inactivo' }, { status: 403 });
    }

    // Generar nuevo token
    const token = `QR-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 5);

    const { data, error } = await supabase
      .from('time_clocks')
      .update({
        current_qr_token: token,
        qr_token_expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', deviceId)
      .select('current_qr_token, qr_token_expires_at')
      .single();

    if (error || !data) {
      console.error('Error regenerando token QR:', error);
      return NextResponse.json({ error: 'Error al regenerar token' }, { status: 500 });
    }

    return NextResponse.json({
      token: data.current_qr_token,
      expires_at: data.qr_token_expires_at,
    });
  } catch (error) {
    console.error('Error en regenerate-token:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
