import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { canManualSign, failResponse, foreignOrgResponse, readJson } from '@/lib/services/crm/f10RouteHelpers';
import { ContractConflictError, getContract, updateContractStatus, type ContractStatus } from '@/lib/services/crm/contractService';
import { CONTRACT_STATUSES, isContractStatus } from '@/lib/services/crm/contractStateMachine';

export const runtime = 'nodejs';

/**
 * GET /api/crm/contracts/[id] — Obtiene un contrato por ID.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const contract = await getContract(id, ctx.organizationId, ctx.supabase);
    if (!contract) return NextResponse.json({ success: false, error: 'Contrato no encontrado' }, { status: 404 });
    return NextResponse.json({ success: true, data: contract }, { status: 200 });
  } catch (error: unknown) {
    return failResponse('CRM Contracts GET [id]', error);
  }
}

/**
 * PATCH /api/crm/contracts/[id] — Actualiza el estado de un contrato.
 * Body: { status: 'pending'|'sent'|'viewed'|'signed'|'declined'|'expired' }.
 * 400 body inválido · 403 organización ajena en el body o «signed» sin rol ·
 * 404 ajeno/inexistente · 409 transición no permitida o carrera.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const body = await readJson(request);
    if (!body) return NextResponse.json({ success: false, error: 'Cuerpo JSON inválido' }, { status: 400 });
    const forbidden = foreignOrgResponse('CRM Contracts PATCH', body, ctx, request);
    if (forbidden) return forbidden;

    const status = body.status;
    if (!status) return NextResponse.json({ success: false, error: 'Falta el campo: status' }, { status: 400 });
    if (!isContractStatus(status)) {
      return NextResponse.json({ success: false, error: `Status inválido. Valores permitidos: ${CONTRACT_STATUSES.join(', ')}` }, { status: 400 });
    }
    if (status === 'signed' && !canManualSign(ctx)) {
      console.warn('[CRM Contracts PATCH] intento de marcar firmado a mano sin rol', { organization: ctx.organizationId, user: ctx.userId, role: ctx.roleId, contract: id });
      return NextResponse.json({ success: false, error: 'Marcar un contrato como firmado a mano requiere rol de administrador o manager; lo normal es que lo firme el proveedor' }, { status: 403 });
    }

    const contract = await updateContractStatus(id, ctx.organizationId, status as ContractStatus, ctx.supabase, { userId: ctx.userId });
    if (!contract) return NextResponse.json({ success: false, error: 'Contrato no encontrado' }, { status: 404 });
    return NextResponse.json({ success: true, data: contract }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof ContractConflictError || (error instanceof Error && /no permitida/.test(error.message))) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    }
    return failResponse('CRM Contracts PATCH', error);
  }
}
