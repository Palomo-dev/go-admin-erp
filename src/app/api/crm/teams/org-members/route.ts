import { NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';

/**
 * GET /api/crm/teams/org-members — Lista los miembros activos de la organización
 * con sus perfiles, para usar en el selector al añadir miembros a equipos.
 */
export async function GET() {
  try {
    const ctx = await getServerOrgContext();
    const { data, error } = await ctx.supabase
      .from('organization_members')
      .select(`
        user_id,
        profiles:user_id(id, first_name, last_name, email)
      `)
      .eq('organization_id', ctx.organizationId)
      .eq('is_active', true)
      .order('user_id');

    if (error) {
      console.error('[CRM Teams] org-members GET error:', error.message);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // Normalizar: devolver { id, name, email }
    // Supabase devuelve arrays para los joins, así que profiles es un array
    type OrgMemberRow = {
      user_id: string;
      profiles: { id: string; first_name: string | null; last_name: string | null; email: string | null }[];
    };
    const members = (data || [] as OrgMemberRow[]).map((m: OrgMemberRow) => {
      const p = m.profiles?.[0] || null;
      const full = p ? [p.first_name, p.last_name].filter(Boolean).join(' ') : '';
      return {
        id: m.user_id,
        name: full || p?.email || m.user_id.slice(0, 8),
        email: p?.email || null,
      };
    });

    return NextResponse.json({ success: true, data: members }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Teams] org-members GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
