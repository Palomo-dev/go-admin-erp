import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();
    if (!token) {
      return NextResponse.json({ error: 'Token requerido' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Buscar el token en la BD (no expirado, no usado)
    const now = new Date().toISOString();
    const { data: tokenRecord, error: tokenError } = await supabaseAdmin
      .from('super_admin_access_tokens')
      .select('id, user_id, org_id, access_token, refresh_token, expires_at, used')
      .eq('id', token)
      .eq('used', false)
      .gt('expires_at', now)
      .single();

    if (tokenError || !tokenRecord) {
      return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 401 });
    }

    // Verificar que el user_id sea super_admin en platform_admins
    const { data: adminData, error: adminError } = await supabaseAdmin
      .from('platform_admins')
      .select('id, email, name, role, status')
      .eq('user_id', tokenRecord.user_id)
      .eq('status', 'active')
      .single();

    if (adminError || !adminData || adminData.role !== 'super_admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    // Marcar el token como usado
    await supabaseAdmin
      .from('super_admin_access_tokens')
      .update({ used: true })
      .eq('id', tokenRecord.id);

    // Obtener datos de la organización
    const { data: orgData } = await supabaseAdmin
      .from('organizations')
      .select('id, name')
      .eq('id', tokenRecord.org_id)
      .single();

    return NextResponse.json({
      access_token: tokenRecord.access_token,
      refresh_token: tokenRecord.refresh_token,
      org_id: tokenRecord.org_id,
      org_name: orgData?.name || '',
      admin_name: adminData.name,
      user_id: tokenRecord.user_id,
    });
  } catch {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
