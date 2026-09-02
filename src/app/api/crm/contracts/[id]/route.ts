import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getContract, updateContractStatus, type ContractStatus } from '@/lib/services/crm/contractService';

/**
 * GET /api/crm/contracts/[id] — Obtiene un contrato por ID.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;

    const contract = await getContract(id, ctx.organizationId, ctx.supabase);

    if (!contract) {
      return NextResponse.json(
        { success: false, error: 'Contrato no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: contract }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Contracts] GET [id] error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/crm/contracts/[id] — Actualiza el estado de un contrato.
 * Body: { status: 'pending'|'sent'|'viewed'|'signed'|'declined'|'expired' }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const body = await request.json();

    if (!body?.status) {
      return NextResponse.json(
        { success: false, error: 'Falta el campo: status' },
        { status: 400 }
      );
    }

    const validStatuses: ContractStatus[] = ['pending', 'sent', 'viewed', 'signed', 'declined', 'expired'];
    if (!validStatuses.includes(body.status)) {
      return NextResponse.json(
        { success: false, error: `Status inválido. Valores permitidos: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    const contract = await updateContractStatus(id, ctx.organizationId, body.status as ContractStatus, ctx.supabase);

    if (!contract) {
      return NextResponse.json(
        { success: false, error: 'Contrato no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: contract }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Contracts] PATCH error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
