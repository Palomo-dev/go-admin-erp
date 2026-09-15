import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { getContracts, createContract, EsignNotConfiguredError, ContractSendError, type ContractFilters } from '@/lib/services/crm/contractService';
import { isContractStatus } from '@/lib/services/crm/contractStateMachine';
import { failResponse, foreignOrgResponse, isSafeId, readJson } from '@/lib/services/crm/f10RouteHelpers';

export const runtime = 'nodejs';

const MAX_SIGNERS = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * GET /api/crm/contracts — Lista contratos con filtros opcionales.
 * Query: opportunity_id, status, limit
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const { searchParams } = new URL(request.url);
    const filters: ContractFilters = {};
    const opp = searchParams.get('opportunity_id');
    if (isSafeId(opp)) filters.opportunity_id = opp;
    const status = searchParams.get('status');
    if (isContractStatus(status)) filters.status = status;
    const limit = Number.parseInt(searchParams.get('limit') ?? '', 10);
    if (Number.isFinite(limit) && limit > 0) filters.limit = Math.min(limit, 200);
    const contracts = await getContracts(ctx.organizationId, ctx.supabase, filters);
    return NextResponse.json({ success: true, data: contracts }, { status: 200 });
  } catch (error) {
    return failResponse('CRM Contracts GET', error);
  }
}

function sanitizeSigners(raw: unknown): Array<{ name: string; email: string }> | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_SIGNERS) return null;
  const out: Array<{ name: string; email: string }> = [];
  for (const s of raw) {
    if (!s || typeof s !== 'object') return null;
    const r = s as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name.trim().slice(0, 120) : '';
    const email = typeof r.email === 'string' ? r.email.trim().toLowerCase() : '';
    if (!name || !EMAIL_RE.test(email) || email.length > 254) return null;
    out.push({ name, email });
  }
  return out;
}

/**
 * POST /api/crm/contracts — Crea un contrato y lo envía a firma.
 * Body: { opportunity_id, quotation_id?, signers[], expires_at?, document_url?, document_title?, document_html? }
 * 409 `{ configured:false, missing[] }` si no hay proveedor de firma (sin escribir nada).
 * 502 `{ contract_id }` si el proveedor rechazó el documento (la fila queda `pending`).
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const body = await readJson(request);
    const forbidden = foreignOrgResponse('CRM Contracts POST', body, ctx.organizationId);
    if (forbidden) return forbidden;
    const signers = sanitizeSigners(body?.signers);
    if (!isSafeId(body?.opportunity_id) || !signers) {
      return NextResponse.json({ success: false, error: 'Faltan campos obligatorios: opportunity_id, signers (nombre y email válidos, máx. 10)' }, { status: 400 });
    }
    const quotationId = body?.quotation_id == null ? null : isSafeId(body.quotation_id) ? body.quotation_id : undefined;
    if (quotationId === undefined) return NextResponse.json({ success: false, error: 'quotation_id inválido' }, { status: 400 });
    const expiresAt = typeof body?.expires_at === 'string' && !Number.isNaN(Date.parse(body.expires_at)) ? new Date(body.expires_at).toISOString() : null;
    const docUrl = typeof body?.document_url === 'string' && /^https:\/\//i.test(body.document_url) ? body.document_url.slice(0, 2048) : undefined;
    const docHtml = typeof body?.document_html === 'string' ? body.document_html.slice(0, 200_000) : undefined;
    const docTitle = typeof body?.document_title === 'string' ? body.document_title.trim().slice(0, 200) : undefined;

    const contract = await createContract(
      ctx.organizationId,
      { opportunity_id: body!.opportunity_id as string, quotation_id: quotationId, signers, expires_at: expiresAt, document_url: docUrl, document_title: docTitle, document_html: docHtml },
      ctx.supabase,
    );
    if (!contract) return NextResponse.json({ success: false, error: 'Oportunidad o cotización no encontrada' }, { status: 404 });
    return NextResponse.json({ success: true, data: contract }, { status: 201 });
  } catch (error) {
    if (error instanceof EsignNotConfiguredError) {
      return NextResponse.json({ success: false, error: error.message, configured: false, missing: error.missing }, { status: 409 });
    }
    if (error instanceof ContractSendError) {
      return NextResponse.json({ success: false, error: error.message, contract_id: error.contractId }, { status: 502 });
    }
    return failResponse('CRM Contracts POST', error);
  }
}
