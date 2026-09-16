import { NextRequest } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { deleteSalesTarget, getSalesTargetById, updateSalesTarget } from '@/lib/services/crm/salesTargetService';
import { validateQuotaPatch } from '@/lib/services/crm/quotaProgress';
import { jsonFail, jsonOk, readJson, rejectForeignOrganization, requireTeamManager, routeError } from '@/lib/services/crm/f13RouteSupport';

/**
 * PATCH /api/crm/sales-targets/[id] — edita una cuota (solo admin/manager;
 * acotado por organización). El patch parcial se valida CONTRA LA FILA
 * EXISTENTE (`validateQuotaPatch`): coherencia periodo ↔ límites naturales,
 * fecha real y entero para conteos. `achieved_amount` y `organization_id`
 * nunca vienen del cliente; un `organization_id` ajeno → 403 y registro.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext();
    requireTeamManager(ctx);
    const { id } = await params;
    const body = await readJson(request);
    rejectForeignOrganization('CRM Sales Targets PATCH', body.organization_id, ctx);
    const existing = await getSalesTargetById(id, ctx.organizationId, ctx.supabase);
    if (!existing) return jsonFail(404, 'Cuota no encontrada en esta organización');
    const v = validateQuotaPatch(body, {
      period: existing.period,
      period_start: existing.period_start,
      period_end: existing.period_end,
      target_amount: Number(existing.target_amount),
      target_type: existing.target_type,
      target_currency: existing.target_currency,
    });
    if (!v.ok) return jsonFail(400, v.message, { field: v.field });
    const target = await updateSalesTarget(id, ctx.organizationId, v.value, ctx.supabase);
    if (!target) return jsonFail(404, 'Cuota no encontrada en esta organización');
    return jsonOk(target);
  } catch (error) {
    return routeError(error, 'CRM Sales Targets PATCH');
  }
}

/** DELETE /api/crm/sales-targets/[id] — elimina una cuota (solo admin/manager; acotado por organización). */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext();
    requireTeamManager(ctx);
    const { id } = await params;
    rejectForeignOrganization('CRM Sales Targets DELETE', (await readJson(request)).organization_id, ctx);
    await deleteSalesTarget(id, ctx.organizationId, ctx.supabase);
    return jsonOk({ id });
  } catch (error) {
    return routeError(error, 'CRM Sales Targets DELETE');
  }
}
