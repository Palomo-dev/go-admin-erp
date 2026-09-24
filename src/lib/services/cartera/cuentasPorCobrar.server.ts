/**
 * Cuentas por cobrar — servicio de servidor. Lecturas por RPC
 * (`fn_cxc_listado`) o con el cliente de la SESIÓN (RLS) filtradas por la
 * organización de la sesión. Nada aquí escribe saldos: los pagos van por
 * `fn_registrar_pago` y los disparadores recalculan.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import type { ConsultaCartera, FilaCartera, RespuestaListadoCartera } from '@/lib/finanzas/cartera/listadoCartera';
import type { DetalleCuentaPorCobrar } from '@/lib/finanzas/cartera/contratoCartera';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'userId' | 'supabase'>;

export class ErrorCarteraServidor extends Error {
  constructor(public readonly codigo: 'cuenta_no_encontrada' | 'sin_permiso' | 'error_desconocido') {
    super(codigo);
  }
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export async function listadoCartera(ctx: Ctx, consulta: ConsultaCartera): Promise<RespuestaListadoCartera> {
  const { data, error } = await ctx.supabase.rpc('fn_cxc_listado', {
    p_org: ctx.organizationId,
    p_filtros: consulta.filtros,
    p_orden: consulta.orden,
    p_pagina: consulta.pagina,
    p_tamano: consulta.tamano,
  });
  if (error) {
    if (error.message.startsWith('sin_permiso')) throw new ErrorCarteraServidor('sin_permiso');
    console.error('[cartera] fn_cxc_listado', { organizationId: ctx.organizationId, message: error.message });
    throw new ErrorCarteraServidor('error_desconocido');
  }
  const r = (data ?? {}) as Partial<RespuestaListadoCartera>;
  const res = r.resumen;
  return {
    total: num(r.total),
    filas: ((r.filas ?? []) as FilaCartera[]).map((f) => ({
      ...f,
      monto: num(f.monto),
      saldo: num(f.saldo),
      dias: num(f.dias),
      cuotas: num(f.cuotas),
      cuotas_pendientes: num(f.cuotas_pendientes),
    })),
    resumen: {
      monedas: res?.monedas ?? [],
      por_cobrar: num(res?.por_cobrar),
      al_dia: num(res?.al_dia),
      vencida: num(res?.vencida),
      cuentas_abiertas: num(res?.cuentas_abiertas),
      cuentas_vencidas: num(res?.cuentas_vencidas),
      promedio_cobro_dias: res?.promedio_cobro_dias == null ? null : num(res.promedio_cobro_dias),
      tramos: (res?.tramos ?? []).map((t) => ({ tramo: t.tramo, saldo: num(t.saldo), cuentas: num(t.cuentas) })),
    },
  };
}

interface FilaCuenta {
  id: string;
  invoice_id: string | null;
  sale_id: string | null;
  customer_id: string | null;
  branch_id: number | null;
  amount: number | string | null;
  balance: number | string | null;
  due_date: string | null;
  status: string | null;
  created_at: string | null;
  last_reminder_date: string | null;
  invoice_sales: {
    id: string;
    number: string | null;
    total: number | string | null;
    balance: number | string | null;
    issue_date: string | null;
    due_date: string | null;
    currency: string | null;
    status: string | null;
    sale_id: string | null;
  } | null;
  customers: { id: string; full_name: string | null; doc_type: string | null; doc_number: string | null; email: string | null; phone: string | null } | null;
  branches: { name: string | null } | null;
}

export async function detalleCuenta(ctx: Ctx, id: string): Promise<DetalleCuentaPorCobrar> {
  const db = ctx.supabase;
  const org = ctx.organizationId;
  const { data, error } = await db
    .from('accounts_receivable')
    .select(
      'id, invoice_id, sale_id, customer_id, branch_id, amount, balance, due_date, status, created_at, last_reminder_date, ' +
        'invoice_sales:invoice_id (id, number, total, balance, issue_date, due_date, currency, status, sale_id), ' +
        'customers:customer_id (id, full_name, doc_type, doc_number, email, phone), branches:branch_id (name)',
    )
    .eq('id', id)
    .eq('organization_id', org)
    .maybeSingle();
  if (error) {
    console.error('[cartera] detalle', { organizationId: org, message: error.message });
    throw new ErrorCarteraServidor('error_desconocido');
  }
  if (!data) throw new ErrorCarteraServidor('cuenta_no_encontrada');
  const c = data as unknown as FilaCuenta;
  const inv = c.invoice_sales;
  const saleId = c.sale_id ?? inv?.sale_id ?? null;

  const fuentes: string[] = [`and(source.eq.account_receivable,source_id.eq.${c.id})`];
  if (c.invoice_id) fuentes.push(`and(source.eq.invoice_sales,source_id.eq.${c.invoice_id})`);
  if (saleId) fuentes.push(`and(source.eq.sale,source_id.eq.${saleId})`);

  const [cuotasRes, pagosRes, vivoRes, carteraClienteRes, monedaRes, recordatoriosRes] = await Promise.all([
    db
      .from('ar_installments')
      .select('id, installment_number, due_date, amount, paid_amount, balance, status, days_overdue')
      .eq('account_receivable_id', c.id)
      .order('installment_number', { ascending: true }),
    db
      .from('payments')
      .select('id, payment_date, created_at, method, amount, change_amount, reference, status, source, voided_at, void_reason, installment_id, payment_groups:payment_group_id (receipt_number), payment_methods:method (name)')
      .eq('organization_id', org)
      .or(fuentes.join(','))
      .order('payment_date', { ascending: true }),
    db.rpc('fn_cxc_estado_vivo', { p_org: org }),
    c.customer_id
      ? db.from('accounts_receivable').select('balance').eq('organization_id', org).eq('customer_id', c.customer_id).gt('balance', 0).neq('status', 'cancelled')
      : Promise.resolve({ data: [] }),
    db.rpc('fn_moneda_base_organizacion', { p_org: org }),
    db
      .from('ar_reminders')
      .select('created_at, channel, status, destination, error')
      .eq('organization_id', org)
      .eq('account_receivable_id', c.id)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const vivo = ((vivoRes.data ?? []) as { account_id: string; dias_vencida: number; estado_efectivo: string }[]).find((v) => v.account_id === c.id);
  type FilaCuota = { id: string; installment_number: number; due_date: string; amount: number | string; paid_amount: number | string; balance: number | string; status: string; days_overdue: number | null };
  type FilaPago = {
    id: string;
    payment_date: string | null;
    created_at: string | null;
    method: string | null;
    amount: number | string | null;
    change_amount: number | string | null;
    reference: string | null;
    status: string | null;
    source: string | null;
    voided_at: string | null;
    void_reason: string | null;
    installment_id: string | null;
    payment_groups: { receipt_number: string | null } | null;
    payment_methods: { name: string | null } | null;
  };

  const monedaBase = typeof monedaRes.data === 'string' ? monedaRes.data.trim().toUpperCase() : null;

  return {
    cuenta: {
      id: c.id,
      estado: c.status === 'cancelled' ? 'cancelled' : vivo?.estado_efectivo ?? c.status ?? 'current',
      dias: vivo?.dias_vencida ?? 0,
      monto: inv ? num(inv.total) : num(c.amount),
      saldo: num(c.balance),
      vencimiento: inv?.due_date ?? c.due_date,
      creada: c.created_at,
      ultimoRecordatorio: c.last_reminder_date,
      branchId: c.branch_id,
      sucursal: c.branches?.name ?? null,
      moneda: (inv?.currency ?? monedaBase ?? '').trim().toUpperCase() || null,
    },
    factura: inv
      ? { id: inv.id, numero: inv.number, emision: inv.issue_date, total: num(inv.total), estado: inv.status ?? 'issued' }
      : null,
    saleId,
    cliente: c.customers
      ? {
          id: c.customers.id,
          nombre: c.customers.full_name,
          documento: [c.customers.doc_type, c.customers.doc_number].filter(Boolean).join(' ') || null,
          email: c.customers.email,
          telefono: c.customers.phone,
          carteraTotal: ((carteraClienteRes.data ?? []) as { balance: number | string | null }[]).reduce((s, r) => s + num(r.balance), 0),
        }
      : null,
    cuotas: ((cuotasRes.data ?? []) as FilaCuota[]).map((q) => ({
      id: q.id,
      numero: q.installment_number,
      vencimiento: q.due_date,
      monto: num(q.amount),
      pagado: num(q.paid_amount),
      saldo: num(q.balance),
      estado: q.status,
      dias: q.days_overdue ?? 0,
    })),
    pagos: ((pagosRes.data ?? []) as unknown as FilaPago[]).map((p) => ({
      id: p.id,
      fecha: p.payment_date ?? p.created_at,
      metodo: p.method,
      metodoNombre: p.payment_methods?.name ?? null,
      monto: num(p.amount),
      cambio: num(p.change_amount),
      referencia: p.reference,
      estado: p.status ?? 'completed',
      recibo: p.payment_groups?.receipt_number ?? null,
      origen: p.source,
      cuotaId: p.installment_id,
      anuladoEn: p.voided_at,
      motivoAnulacion: p.void_reason,
    })),
    recordatorios: ((recordatoriosRes.data ?? []) as { created_at: string; channel: string; status: string; destination: string | null; error: string | null }[]).map(
      (r) => ({ fecha: r.created_at, canal: r.channel, estado: r.status, destino: r.destination, error: r.error }),
    ),
  };
}

// ─── Plan de cuotas (fn_cxc_crear_plan_cuotas / fn_cxc_eliminar_plan_cuotas) ─

export type ErrorCuotas = 'cuenta_no_encontrada' | 'sin_permiso' | 'sin_acceso_sucursal' | 'cuenta_sin_saldo' | 'plan_con_abonos' | 'cuotas_invalidas' | 'plan_no_cuadra' | 'error_desconocido';

export class ErrorCuotasServidor extends Error {
  constructor(public readonly codigo: ErrorCuotas) {
    super(codigo);
  }
}

const ERRORES_CUOTAS: readonly ErrorCuotas[] = ['cuenta_no_encontrada', 'sin_permiso', 'sin_acceso_sucursal', 'cuenta_sin_saldo', 'plan_con_abonos', 'cuotas_invalidas', 'plan_no_cuadra'];

function errorCuotas(etiqueta: string, ctx: Ctx, mensaje: string): never {
  const primero = mensaje.trim().split(/[\s:]/)[0] as ErrorCuotas;
  if (ERRORES_CUOTAS.includes(primero)) throw new ErrorCuotasServidor(primero);
  console.error(`[cartera] ${etiqueta}`, { organizationId: ctx.organizationId, message: mensaje });
  throw new ErrorCuotasServidor('error_desconocido');
}

export async function crearPlanCuotas(ctx: Ctx, id: string, cuotas: { vence: string; capital: number; interes?: number; valor: number }[]): Promise<number> {
  const { data, error } = await ctx.supabase.rpc('fn_cxc_crear_plan_cuotas', { p_ar_id: id, p_cuotas: cuotas });
  if (error) errorCuotas('fn_cxc_crear_plan_cuotas', ctx, error.message);
  return Number(data) || 0;
}

export async function eliminarPlanCuotas(ctx: Ctx, id: string): Promise<number> {
  const { data, error } = await ctx.supabase.rpc('fn_cxc_eliminar_plan_cuotas', { p_ar_id: id });
  if (error) errorCuotas('fn_cxc_eliminar_plan_cuotas', ctx, error.message);
  return Number(data) || 0;
}

// ─── Recordatorio registrado (fn_cxc_registrar_recordatorio) ─────────────────

export async function registrarRecordatorio(
  ctx: Ctx,
  entrada: { id: string; estado: 'enviado' | 'fallido'; destino: string | null; mensaje: string | null; emailMessageId: string | null; error: string | null },
): Promise<void> {
  const { error } = await ctx.supabase.rpc('fn_cxc_registrar_recordatorio', {
    p_ar_id: entrada.id,
    p_canal: 'correo',
    p_estado: entrada.estado,
    p_destino: entrada.destino,
    p_mensaje: entrada.mensaje,
    p_email_message_id: entrada.emailMessageId,
    p_error: entrada.error,
    p_plantilla: 'recordatorio_cobro',
  });
  if (error) console.error('[cartera] fn_cxc_registrar_recordatorio', { organizationId: ctx.organizationId, message: error.message });
}