/**
 * Datos del correo al equipo por el pago de un pedido online. Solo servidor (clave de servicio,
 * desde el despacho de avisos): el aviso ya trae la organización y el pedido se busca con ella.
 * El saldo en puerta sale de `cobrarAlEntregar` (la misma regla de Pedidos online y del envío).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolverContextoMoneda } from '@/lib/services/monedaOrganizacion';
import { formatMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { formatDateTimeInTz } from '@/lib/utils/dateDisplay';
import { metodoDePago } from '@/lib/pos/pedidosWeb/metodoDePago';
import { cobrarAlEntregar } from '@/lib/pos/pedidosWeb/contraentregaPedido';
import { urlAbsoluta } from './correo';
import {
  direccionResumida,
  franquiciaDeRespuesta,
  tipoEntrega,
  varianteDe,
  type DatosCorreoPago,
} from './correoPagoPedido';

interface PedidoCorreo {
  id: string;
  organization_id: number;
  branch_id: number | null;
  order_number: string | null;
  status: string | null;
  total: number | string | null;
  delivery_fee: number | string | null;
  delivery_type: string | null;
  delivery_address: unknown;
  payment_status: string | null;
  payment_method: string | null;
  payment_method_detail: string | null;
  payment_reference: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  advance_amount: number | string | null;
  advance_status: string | null;
  advance_reference: string | null;
  advance_gateway: string | null;
}

interface PagoFila {
  method: string | null;
  amount: number | string | null;
  reference: string | null;
  processor_response: Record<string, unknown> | null;
}

export interface AvisoPago {
  organization_id: number;
  event: string;
  entity_id: string;
  href: string;
  created_at?: string | null;
}

const monedas = new Map<number, ContextoMoneda>();

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Nombre del método con la misma tabla de Pedidos online. */
function etiqueta(metodo: string | null | undefined, detalle: string | null | undefined = null): string {
  return metodoDePago({ payment_method: metodo ?? undefined, payment_method_detail: detalle ?? undefined });
}

/** «Nequi · Wompi»: medio y pasarela sin repetir. */
function medioYPasarela(medio: string | null, pasarela: string | null): string | null {
  const m = medio ? etiqueta(medio) : null;
  const p = pasarela ? etiqueta(pasarela) : null;
  const partes = [m, p && p !== m ? p : null].filter((x): x is string => !!x && x !== '—');
  return partes.length ? partes.join(' · ') : null;
}

export async function datosCorreoPago(
  db: SupabaseClient,
  aviso: AvisoPago,
  contexto: { zona: string; tienda: string },
): Promise<DatosCorreoPago | null> {
  const org = Number(aviso.organization_id);
  const { data: pedido, error } = await db
    .from('web_orders')
    .select('id, organization_id, branch_id, order_number, status, total, delivery_fee, delivery_type, delivery_address, payment_status, payment_method, payment_method_detail, payment_reference, customer_name, customer_email, customer_phone, advance_amount, advance_status, advance_reference, advance_gateway')
    .eq('id', aviso.entity_id)
    .eq('organization_id', org)
    .maybeSingle();
  if (error) {
    console.error('[avisos] pedido', error.message);
    return null;
  }
  if (!pedido) return null;
  const o = pedido as PedidoCorreo;
  const variante = varianteDe(aviso.event, o.status);
  if (!variante) return null;

  let ctx = monedas.get(org);
  if (!ctx) {
    ctx = await resolverContextoMoneda(db, org);
    monedas.set(org, ctx);
  }
  const dinero = (n: number) => formatMoneda(n, ctx as ContextoMoneda);

  let sede: string | null = null;
  if (o.branch_id) {
    const { data: sucursal } = await db.from('branches').select('name').eq('id', o.branch_id).eq('organization_id', org).maybeSingle();
    sede = texto((sucursal as { name?: unknown } | null)?.name);
  }

  const { data: pagos } = await db
    .from('payments')
    .select('method, amount, reference, processor_response')
    .eq('organization_id', org)
    .eq('source', 'web_order')
    .eq('source_id', o.id)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(5);
  const lista = (pagos ?? []) as PagoFila[];
  const esAnticipo = (p: PagoFila) => p.processor_response?.concepto === 'anticipo_contraentrega';
  const anticipoVariante = variante === 'anticipo' || variante === 'anticipo_reactivado' || variante === 'anticipo_revisar';

  const total = Number(o.total) || 0;
  const anticipo = Number(o.advance_amount) || 0;
  let monto = total;
  let medio: string | null = null;
  let referencia: string | null = null;
  let franquicia: string | null = null;
  let queSePago: string | null = null;
  let porCobrar: number | null = null;

  if (variante === 'linea') {
    const pago = lista.find((p) => !esAnticipo(p)) ?? null;
    medio = etiqueta(o.payment_method, o.payment_method_detail);
    referencia = texto(o.payment_reference) ?? texto(pago?.reference);
    franquicia = franquiciaDeRespuesta(pago?.processor_response, o.payment_method_detail, pago?.method);
  } else if (variante === 'contraentrega') {
    monto = 0;
    medio = 'Contraentrega · paga al recibir';
    porCobrar = cobrarAlEntregar(o);
  } else if (anticipoVariante) {
    const pago = lista.find(esAnticipo) ?? null;
    monto = Number(pago?.amount) || anticipo;
    medio = medioYPasarela(texto(pago?.method), texto(pago?.processor_response?.gateway) ?? texto(o.advance_gateway));
    referencia = texto(o.advance_reference) ?? texto(pago?.reference);
    franquicia = franquiciaDeRespuesta(pago?.processor_response, pago?.method);
    const envio = Number(o.delivery_fee) || 0;
    queSePago = envio > 0 && Math.abs(envio - monto) < 1
      ? 'El envío (anticipo de la contraentrega)'
      : total > 0
        ? `Pago condicionado: ${Math.round((monto / total) * 100)} % del pedido`
        : 'Anticipo de la contraentrega';
    porCobrar = cobrarAlEntregar(o);
  } else {
    const { data: devolucion } = await db
      .from('web_order_refunds')
      .select('amount, reference')
      .eq('organization_id', org)
      .eq('web_order_id', o.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const d = devolucion as { amount?: number | string | null; reference?: string | null } | null;
    monto = Number(d?.amount) || (o.advance_status === 'paid' && o.payment_status !== 'paid' ? anticipo : total);
    referencia = texto(d?.reference);
    medio = etiqueta(o.advance_status === 'paid' ? o.advance_gateway : o.payment_method);
    if (medio === '—') medio = null;
  }

  return {
    variante,
    numero: o.order_number ?? '',
    tienda: contexto.tienda,
    sede,
    cuando: formatDateTimeInTz(aviso.created_at ?? new Date(), contexto.zona, {
      locale: 'es-CO', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
    }),
    total: dinero(total),
    monto: dinero(monto),
    porCobrar: porCobrar == null ? null : dinero(porCobrar),
    queSePago,
    medio,
    franquicia,
    referencia,
    cliente: { nombre: texto(o.customer_name), telefono: texto(o.customer_phone), correo: texto(o.customer_email) },
    entrega: { tipo: tipoEntrega(o.delivery_type), direccion: direccionResumida(o.delivery_address) },
    enlace: urlAbsoluta(aviso.href),
  };
}

/** Para pruebas. */
export function limpiarMonedasPagoPedido(): void {
  monedas.clear();
}
