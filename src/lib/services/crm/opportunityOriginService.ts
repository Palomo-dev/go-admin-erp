/** Orígenes de oportunidad: lectura con sesión; el guardado y el vínculo viven en crm_create_opportunity. */
import { hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { CrmHttpError, exigirUuid, type CrmSesion } from './crmRouteSupport';

export const TIPOS_ORIGEN_OPORTUNIDAD = ['factura', 'cotizacion', 'conversacion'] as const;
export type TipoOrigenOportunidad = (typeof TIPOS_ORIGEN_OPORTUNIDAD)[number];
export interface OrigenOportunidad {
  tipo: TipoOrigenOportunidad;
  id: string;
  updated_at: string;
  customer_id: string;
  cliente_nombre: string | null;
  numero: string | null;
  amount: number;
  currency: string | null;
  canal: string | null;
  occurred_at: string | null;
  opportunity_id: string | null;
  lineas: { concepto: string; cantidad: number; total: number }[];
}

export async function leerOrigenOportunidad(ctx: CrmSesion, tipo: TipoOrigenOportunidad, id: string): Promise<OrigenOportunidad> {
  exigirUuid(id, 'origen');
  if (tipo !== 'conversacion' && !(await hasOrgAdminOrPermission(ctx, 'finance.view'))) {
    throw new CrmHttpError(403, 'sin_permiso', 'No tienes permiso para esta acción');
  }
  const tabla = tipo === 'factura' ? 'invoice_sales' : tipo === 'cotizacion' ? 'quotations' : 'conversations';
  const columnas = tipo === 'conversacion'
    ? 'id, customer_id, branch_id, channel_id, created_at, updated_at, metadata'
    : 'id, customer_id, branch_id, number, total, currency, updated_at, opportunity_id';
  const { data, error } = await ctx.supabase.from(tabla).select(columnas).eq('organization_id', ctx.organizationId).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new CrmHttpError(404, 'origen_no_encontrado', 'Origen no encontrado');
  const doc = data as unknown as { id: string; customer_id: string | null; branch_id?: number | null; updated_at: string; number?: string | null; total?: number; currency?: string | null; opportunity_id?: string | null; channel_id?: string; created_at?: string; metadata?: Record<string, unknown> | null };
  const accesoSucursal = await ctx.supabase.rpc('app_branch_access', { p_branch_id: doc.branch_id ?? null });
  if (accesoSucursal.error) throw accesoSucursal.error;
  if (accesoSucursal.data !== true) throw new CrmHttpError(403, 'sin_permiso', 'No tienes acceso a la sucursal del origen');
  if (tipo !== 'conversacion' && (doc.total == null || !Number.isFinite(Number(doc.total)) || Number(doc.total) < 0 || !/^[A-Za-z]{3}$/.test(doc.currency?.trim() ?? ''))) {
    throw new CrmHttpError(409, 'origen_importes_invalidos', 'Los importes del origen requieren revisión');
  }
  if (!doc.customer_id) throw new CrmHttpError(409, 'origen_sin_cliente', 'El origen requiere un cliente vinculado');
  const cliente = await ctx.supabase.from('customers').select('id, full_name').eq('organization_id', ctx.organizationId).eq('id', doc.customer_id).maybeSingle();
  if (cliente.error) throw cliente.error;
  if (!cliente.data) throw new CrmHttpError(404, 'cliente_no_encontrado', 'Cliente no encontrado');
  let canal: string | null = null;
  let lineas: OrigenOportunidad['lineas'] = [];
  if (tipo === 'conversacion') {
    const channel = await ctx.supabase.from('channels').select('id, type').eq('organization_id', ctx.organizationId).eq('id', doc.channel_id!).maybeSingle();
    if (channel.error) throw channel.error;
    if (!channel.data) throw new CrmHttpError(404, 'canal_no_encontrado', 'Canal no encontrado');
    canal = channel.data.type;
  } else {
    const items = await ctx.supabase.from(tipo === 'factura' ? 'invoice_items' : 'quotation_items')
      .select('id, description, qty, total_line').eq(tipo === 'factura' ? 'invoice_sales_id' : 'quotation_id', id).order('id').limit(201);
    if (items.error) throw items.error;
    if ((items.data?.length ?? 0) > 200) throw new CrmHttpError(409, 'origen_demasiadas_lineas', 'El origen tiene demasiadas líneas');
    if ((items.data ?? []).some(l => l.qty == null || !Number.isFinite(Number(l.qty)) || Number(l.qty) <= 0 || l.total_line == null || !Number.isFinite(Number(l.total_line)) || Number(l.total_line) < 0)) {
      throw new CrmHttpError(409, 'origen_lineas_invalidas', 'Las líneas del origen requieren revisión');
    }
    lineas = (items.data ?? []).map(l => ({ concepto: l.description ?? '', cantidad: Number(l.qty), total: Number(l.total_line) }));
  }
  const vinculada = tipo === 'conversacion' ? doc.metadata?.opportunity_id : doc.opportunity_id;
  if (vinculada != null) {
    if (typeof vinculada !== 'string') throw new CrmHttpError(409, 'origen_vinculo_incoherente', 'El vínculo del origen requiere revisión');
    exigirUuid(vinculada, 'oportunidad');
    const opp = await ctx.supabase.from('opportunities').select('id, customer_id').eq('organization_id', ctx.organizationId).eq('id', vinculada).maybeSingle();
    if (opp.error) throw opp.error;
    if (!opp.data || opp.data.customer_id !== doc.customer_id) throw new CrmHttpError(409, 'origen_vinculo_incoherente', 'El vínculo del origen requiere revisión');
  }
  return { tipo, id, updated_at: doc.updated_at, customer_id: doc.customer_id, cliente_nombre: cliente.data.full_name,
    numero: doc.number ?? null, amount: Number(doc.total ?? 0), currency: doc.currency?.trim() ?? null,
    canal, occurred_at: doc.created_at ?? null, opportunity_id: typeof vinculada === 'string' ? vinculada : null, lineas };
}
