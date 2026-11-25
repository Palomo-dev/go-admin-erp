import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { avisarAnticipoVencidoCliente } from '@/lib/services/avisosAnticipoVencido';
import { codigoErrorDevolucion, MEDIOS_DEVOLUCION, type MedioDevolucion } from '@/lib/pos/pedidosWeb/anticipoVencido';

/**
 * POST /api/web-orders/[id]/anticipo-devolver
 *
 * «Devolver anticipo» de un pedido «Anticipo pagado · vencido» (Figma «05 POS y ventas» › 07;
 * base 20261125121000). La devolución la registra la base con la SESIÓN del usuario
 * (`fn_web_order_anticipo_devolver`: organización, sede y permiso `pos.refund` o `pos.void` se
 * comprueban allí; completa; asiento Dr 2805 / Cr 138020xx o banco; idempotente por referencia).
 * Esta ruta no mueve dinero: la persona ya hizo el reverso en la pasarela o la transferencia y aquí
 * deja el comprobante. Después, si lo pidió, avisa al cliente por correo y WhatsApp con la marca de
 * la tienda.
 *
 * La organización sale de la sesión (`withOrg`); el body solo trae medio, referencia, motivo, cuenta
 * bancaria y si se avisa. Un pedido de otra organización: la base responde que no existe o sin acceso.
 */
export const POST = withOrg(async (ctx, request, routeParams) => {
  const body = await readOrgBody<{
    medio?: unknown;
    referencia?: unknown;
    motivo?: unknown;
    cuentaBancaria?: unknown;
    monto?: unknown;
    avisar?: unknown;
  }>(ctx, request, { route: 'web-orders/anticipo-devolver' });
  const params = (await routeParams?.params) ?? {};
  const orderId = typeof params.id === 'string' ? params.id : '';
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });
  }
  const medio = typeof body?.medio === 'string' && (MEDIOS_DEVOLUCION as readonly string[]).includes(body.medio)
    ? (body.medio as MedioDevolucion)
    : null;
  const referencia = typeof body?.referencia === 'string' ? body.referencia.trim().slice(0, 120) : '';
  if (!medio) return NextResponse.json({ error: 'MEDIO_INVALIDO' }, { status: 400 });
  if (!referencia) return NextResponse.json({ error: 'COMPROBANTE_REQUERIDO' }, { status: 400 });
  const motivo = typeof body?.motivo === 'string' ? body.motivo.trim().slice(0, 300) : null;
  const cuenta = typeof body?.cuentaBancaria === 'number' && Number.isInteger(body.cuentaBancaria) ? body.cuentaBancaria : null;
  const monto = typeof body?.monto === 'number' && Number.isFinite(body.monto) ? body.monto : null;

  // El pedido debe ser de la organización de la sesión (la RPC lo vuelve a comprobar).
  const { data: pedido } = await ctx.supabase
    .from('web_orders')
    .select('id')
    .eq('id', orderId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (!pedido) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });

  const { data, error } = await ctx.supabase.rpc('fn_web_order_anticipo_devolver', {
    p_order_id: orderId,
    p_medio: medio,
    p_referencia: referencia,
    p_motivo: motivo,
    p_bank_account_id: cuenta,
    p_monto: monto,
  });
  if (error) {
    const codigo = codigoErrorDevolucion(error.message);
    const status = codigo === 'SIN_PERMISO' || error.code === '42501' ? 403 : 422;
    return NextResponse.json({ error: codigo, detalle: error.message }, { status });
  }
  const r = (data ?? {}) as { ya_registrado?: boolean; refund_id?: string; monto?: number; cuenta?: string; journal_entry_id?: number };

  let aviso: { email: string | null; whatsapp: string | null } | null = null;
  if (body?.avisar === true && !r.ya_registrado) {
    // Service role solo después de que la base validó la devolución con la sesión.
    aviso = await avisarAnticipoVencidoCliente(getSupabaseAdmin(), ctx.organizationId, orderId, 'anticipo_devuelto', ['email', 'whatsapp'], ctx.userId);
  } else {
    // Sin aviso pedido, o reintento de una devolución ya registrada.
  }
  return NextResponse.json({ ok: true, ...r, aviso });
});
