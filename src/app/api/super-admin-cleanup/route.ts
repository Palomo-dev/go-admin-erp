import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const { user_id, org_id } = await request.json();
    if (!user_id || !org_id) {
      return NextResponse.json({ error: 'user_id y org_id requeridos' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Eliminar el organization_members temporal
    const { error } = await supabaseAdmin
      .from('organization_members')
      .delete()
      .eq('user_id', user_id)
      .eq('organization_id', org_id)
      .eq('is_temporary', true);

    if (error) {
      console.error('Error cleaning up temporary member:', error);
      return NextResponse.json({ error: 'Error al limpiar acceso temporal' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
