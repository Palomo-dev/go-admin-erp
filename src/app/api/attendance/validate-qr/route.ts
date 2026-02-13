import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const { qrData, geo } = await request.json();

    if (!qrData) {
      return NextResponse.json({ success: false, message: 'Datos QR requeridos' }, { status: 400 });
    }

    // Parsear QR
    let payload: { type: string; device_id: string; token: string; org: number };
    try {
      payload = JSON.parse(qrData);
    } catch {
      return NextResponse.json({ success: false, message: 'Código QR inválido' });
    }

    if (payload.type !== 'attendance') {
      return NextResponse.json({ success: false, message: 'Este QR no es para marcación de asistencia' });
    }

    // Obtener usuario autenticado
    const cookieStore = await cookies();
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, message: 'No autenticado' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();

    // Obtener info del empleado
    const { data: memberData } = await supabase
      .from('organization_members')
      .select(`
        id, organization_id,
        profiles!inner(first_name, last_name),
        employments!inner(id, employee_code, branch_id, status, branches(name))
      `)
      .eq('user_id', user.id)
      .eq('employments.status', 'active')
      .limit(1);

    if (!memberData || memberData.length === 0) {
      return NextResponse.json({ success: false, message: 'No se encontró información del empleado' });
    }

    const member = memberData[0];
    const employment = Array.isArray(member.employments) ? member.employments[0] : member.employments;
    if (!employment) {
      return NextResponse.json({ success: false, message: 'No se encontró empleo activo' });
    }

    if (member.organization_id !== payload.org) {
      return NextResponse.json({ success: false, message: 'Este QR no corresponde a tu organización' });
    }

    // Validar dispositivo y token (server-side, sin RLS)
    const { data: device, error: deviceError } = await supabase
      .from('time_clocks')
      .select('*')
      .eq('id', payload.device_id)
      .eq('organization_id', payload.org)
      .eq('is_active', true)
      .single();

    if (deviceError || !device) {
      return NextResponse.json({ success: false, message: 'Dispositivo de marcación no encontrado o inactivo' });
    }

    // Validar token
    if (device.current_qr_token !== payload.token) {
      console.log('[QR Validate] Token mismatch:', { expected: device.current_qr_token?.substring(0, 20), got: payload.token?.substring(0, 20) });
      return NextResponse.json({ success: false, message: 'Código QR no válido. Escanea el código actual.' });
    }

    // Verificar expiración usando hora del servidor (NOW())
    const { data: timeCheck } = await supabase.rpc('now');
    const serverNow = timeCheck ? new Date(timeCheck) : new Date();

    if (device.qr_token_expires_at) {
      const expiresAt = new Date(device.qr_token_expires_at);
      // Tolerancia de 15 segundos por posible latencia
      const tolerance = 15 * 1000;
      if (expiresAt.getTime() + tolerance < serverNow.getTime()) {
        console.log('[QR Validate] Token expired:', { expires: expiresAt.toISOString(), serverNow: serverNow.toISOString() });
        return NextResponse.json({ success: false, message: 'Código QR expirado. Solicita un nuevo código.' });
      }
    }

    // Determinar tipo de evento
    const today = serverNow.toISOString().split('T')[0];
    const { data: todayEvents } = await supabase
      .from('attendance_events')
      .select('id, event_type, event_at')
      .eq('employment_id', employment.id)
      .gte('event_at', `${today}T00:00:00`)
      .lte('event_at', `${today}T23:59:59`)
      .order('event_at', { ascending: false });

    const lastEvent = todayEvents?.[0];
    const eventType: 'check_in' | 'check_out' =
      !lastEvent || lastEvent.event_type === 'check_out' ? 'check_in' : 'check_out';

    // Validar geo si requerido
    if (device.require_geo_validation && device.geo_fence) {
      if (!geo) {
        return NextResponse.json({ success: false, message: 'Se requiere ubicación GPS para marcar en este dispositivo' });
      }
      const R = 6371e3;
      const φ1 = (geo.lat * Math.PI) / 180;
      const φ2 = (device.geo_fence.lat * Math.PI) / 180;
      const Δφ = ((device.geo_fence.lat - geo.lat) * Math.PI) / 180;
      const Δλ = ((device.geo_fence.lng - geo.lng) * Math.PI) / 180;
      const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
      const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      if (distance > device.geo_fence.radius) {
        return NextResponse.json({ success: false, message: `Estás fuera del rango permitido (${Math.round(distance)}m de ${device.geo_fence.radius}m)` });
      }
    }

    // Registrar evento
    const eventAt = serverNow.toISOString();
    const employeeName = member.profiles
      ? `${(member.profiles as any).first_name} ${(member.profiles as any).last_name}`
      : 'Sin nombre';

    const { data: newEvent, error: insertError } = await supabase
      .from('attendance_events')
      .insert({
        organization_id: payload.org,
        branch_id: device.branch_id || employment.branch_id,
        employment_id: employment.id,
        event_type: eventType,
        event_at: eventAt,
        source: 'qr',
        time_clock_id: device.id,
        geo: geo || null,
        geo_validated: device.require_geo_validation ? true : null,
        is_manual_entry: false,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[QR Validate] Error registrando:', insertError);
      return NextResponse.json({ success: false, message: 'Error al registrar la marcación' });
    }

    return NextResponse.json({
      success: true,
      message: eventType === 'check_in'
        ? '¡Entrada registrada correctamente!'
        : '¡Salida registrada correctamente!',
      event_type: eventType,
      event_id: newEvent.id,
      employee_name: employeeName,
      event_at: eventAt,
    });
  } catch (error) {
    console.error('[QR Validate] Error:', error);
    return NextResponse.json({ success: false, message: 'Error interno del servidor' }, { status: 500 });
  }
}
