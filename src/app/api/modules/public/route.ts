import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * API: Obtener módulos públicos (para signup)
 * GET /api/modules/public
 * 
 * Retorna los módulos activos sin requerir autenticación
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await supabase
      .from('modules')
      .select('code, name, icon, is_core')
      .eq('is_active', true)
      .order('is_core', { ascending: false })
      .order('name');

    if (error) {
      console.error('Error fetching modules:', error);
      return NextResponse.json({ error: 'Error fetching modules' }, { status: 500 });
    }

    // Mapear is_core a isCore para consistencia con el frontend
    const modules = (data || []).map((m: any) => ({
      code: m.code,
      name: m.name,
      icon: m.icon,
      isCore: m.is_core
    }));

    return NextResponse.json({ modules });

  } catch (error: any) {
    console.error('Error in modules API:', error);
    return NextResponse.json(
      { error: 'Error fetching modules' },
      { status: 500 }
    );
  }
}
