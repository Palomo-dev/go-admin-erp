import { NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { pickEmbedded, profileDisplayName, type EmbeddedProfile } from '@/lib/utils/embeddedProfile';

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

    // El embebido es a-uno: PostgREST devuelve un OBJETO, no un array. Leerlo
    // como `profiles[0]` daba siempre null y el nombre acababa siendo el
    // identificador del usuario recortado.
    type OrgMemberRow = {
      user_id: string;
      profiles: EmbeddedProfile | EmbeddedProfile[] | null;
    };
    const members = ((data || []) as OrgMemberRow[]).map((m) => {
      const p = pickEmbedded(m.profiles);
      return {
        id: m.user_id,
        name: profileDisplayName(m.profiles),
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
