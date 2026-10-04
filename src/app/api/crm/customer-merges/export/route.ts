import { NextRequest, NextResponse } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { CRM_PERMISOS, CrmHttpError, exigirPermisoCrm, respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';
import { readMergeHistoryExport } from '@/lib/services/crm/customerMergeHistory';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { formatDateTimeInTz } from '@/lib/utils/dateDisplay';
import { filasACsv } from '@/lib/utils/csv';

export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    readOrgBody(ctx, {}, { request });
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.clientesFusionar], 'GET /api/crm/customer-merges/export');
    const locale = request.nextUrl.searchParams.get('locale') ?? 'es';
    if (!['es', 'en', 'fr', 'pt'].includes(locale)) throw new CrmHttpError(400, 'idioma_invalido', 'Idioma inválido');
    const t = await getTranslations({ locale, namespace: 'crm.identidades' });
    const [rows, timezone] = await Promise.all([
      readMergeHistoryExport(ctx), getOrganizationTimezone(ctx.organizationId, ctx.supabase),
    ]);
    const date = (value: string | null) => value ? formatDateTimeInTz(value, timezone, { locale }) : '';
    const csv = filasACsv(
      ['idFusion', 'clienteSecundario', 'clientePrincipal', 'motivoFusion', 'movidos', 'quien', 'cuando', 'estado', 'fechaDeshecha'].map(key => t(key)),
      rows.map(row => [row.id, row.secundario?.full_name ?? row.secondary_customer_id,
        row.principal?.full_name ?? row.primary_customer_id,
        t(`motivosFusion.${row.reason ?? 'unknown'}`),
        row.moved_counts.filter(move => move.count > 0).map(move => `${move.count} ${t.has(`tablas.${move.table}`) ? t(`tablas.${move.table}`) : move.table}`).join(' · '),
        [row.autor?.first_name, row.autor?.last_name].filter(Boolean).join(' ') || row.merged_by,
        date(row.merged_at), t(row.undone_at ? 'deshecha' : 'fusionada'), date(row.undone_at)]),
    );
    return new NextResponse(csv, { headers: {
      'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="historial-fusiones.csv"',
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) {
    return respuestaErrorCrm(error, 'GET /api/crm/customer-merges/export');
  }
}
