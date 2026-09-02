import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getContracts, createContract } from '@/lib/services/crm/contractService';

/**
 * GET /api/crm/contracts — Lista contratos con filtros opcionales.
 * Query: opportunity_id, status, limit
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const { searchParams } = new URL(request.url);

    const filters: Record<string, unknown> = {};
    if (searchParams.get('opportunity_id')) filters.opportunity_id = searchParams.get('opportunity_id');
    if (searchParams.get('status')) filters.status = searchParams.get('status');
    if (searchParams.get('limit')) filters.limit = parseInt(searchParams.get('limit')!, 10);

    const contracts = await getContracts(ctx.organizationId, ctx.supabase, filters);

    return NextResponse.json({ success: true, data: contracts }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Contracts] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/crm/contracts — Crea un contrato y lo envía a Documenso.
 * Body: { opportunity_id, quotation_id?, signers, expires_at?, document_url?, document_title?, document_html? }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const body = await request.json();

    if (!body?.opportunity_id || !body?.signers || !Array.isArray(body.signers) || body.signers.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos obligatorios: opportunity_id, signers (array no vacío)' },
        { status: 400 }
      );
    }

    const contract = await createContract(
      ctx.organizationId,
      {
        opportunity_id: body.opportunity_id,
        quotation_id: body.quotation_id ?? null,
        signers: body.signers,
        expires_at: body.expires_at ?? null,
        document_url: body.document_url,
        document_title: body.document_title,
        document_html: body.document_html,
      },
      ctx.supabase
    );

    return NextResponse.json({ success: true, data: contract }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Contracts] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
