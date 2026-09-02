import { NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';

/**
 * GET /api/crm/roles/job-positions — Lista los cargos (job_positions) de HRM
 * de la organización actual, para mapearlos a sales_roles.
 */
export async function GET() {
  try {
    const ctx = await getServerOrgContext();
    const { data, error } = await ctx.supabase
      .from('job_positions')
      .select('id, name, is_active')
      .eq('organization_id', ctx.organizationId)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      console.error('[CRM Roles] job-positions GET error:', error.message);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: data || [] }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Roles] job-positions GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
