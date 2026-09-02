import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import {
  getICPProfiles,
  createICPProfile,
} from '@/lib/services/crm/icpService';

/**
 * GET /api/crm/icp — Lista los icp_profiles con sus criteria.
 */
export async function GET() {
  try {
    const ctx = await getServerOrgContext();
    const profiles = await getICPProfiles(ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true, data: profiles }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM ICP] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/crm/icp — Crea un nuevo icp_profile (con criteria opcionales).
 * Body: { name, band, description?, priority?, color?, sla_first_contact_hours?, is_active?, criteria? }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const body = await request.json();

    if (!body?.name || !body?.band) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos obligatorios: name, band' },
        { status: 400 }
      );
    }

    const profile = await createICPProfile(
      ctx.organizationId,
      {
        name: body.name,
        band: body.band,
        description: body.description,
        priority: body.priority,
        color: body.color,
        sla_first_contact_hours: body.sla_first_contact_hours,
        is_active: body.is_active,
        criteria: body.criteria,
      },
      ctx.supabase
    );

    return NextResponse.json({ success: true, data: profile }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM ICP] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
