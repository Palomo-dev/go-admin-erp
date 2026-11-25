/**
 * Avisos al cliente del anticipo pagado con el pedido vencido (Figma «05 POS y ventas»
 * 3181-202769 › 11b, 12b, 12d y 12e; base 20261125121000). SOLO servidor.
 *
 * - `anticipo_reactivado` y `anticipo_revisando`: los dispara `/api/web-orders/[id]/auto-confirm`
 *   cuando la tienda avisa el pago tardío. Solo WhatsApp: el correo lo manda la tienda con su marca
 *   (goadmin-websites lib/contraentrega/correoAnticipoTardio.ts), igual que «Pagaste hoy…».
 * - `anticipo_devuelto`: lo dispara «Devolver anticipo» del ERP. Correo y WhatsApp.
 *
 * El correo sale con la marca de la tienda: logo y color del negocio (`marcaDelNegocio`), From del
 * dominio verificado de la organización o el respaldo para compradores (`enviarAvisoEstado`), nunca
 * la marca de la plataforma. Una vez por pedido, momento y canal (`web_order_notices`). Sin canal de
 * WhatsApp queda registrado el fallo (NO_CHANNEL) y sale solo el correo. Nunca lanza.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { enviarAvisoEstado, logoPublico, marcaDelNegocio, normalizarColor, urlSeguimiento } from '@/lib/services/orderStatusEmailService';
import { leerAjustesAvisos } from '@/lib/services/avisosClienteService';
import { hostPublicoOrg } from '@/lib/website/urlPublicaOrg.server';
import { cobroEnPuerta } from '@/lib/contraentrega/reglaContraentrega';
import { metodoDePago } from '@/lib/pos/pedidosWeb/metodoDePago';
import {
  asuntoAvisoAnticipo,
  reactivadoPorAnticipoTardio,
  textoAvisoAnticipo,
  type MomentoAvisoAnticipo,
} from '@/lib/pos/pedidosWeb/anticipoVencido';

type Canal = 'email' | 'whatsapp';

function escapar(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const pesos = (n: number) => `$ ${Math.round(n).toLocaleString('es-CO')}`;

async function registrar(
  db: SupabaseClient,
  fila: { organizationId: number; orderId: string; momento: MomentoAvisoAnticipo; canal: Canal; estado: string; destinatario?: string | null; detalle?: string | null; proveedorId?: string | null; actor?: string | null },
): Promise<void> {
  const { error } = await db.from('web_order_notices').insert({
    organization_id: fila.organizationId,
    web_order_id: fila.orderId,
    moment: fila.momento,
    channel: fila.canal,
    status: fila.estado,
    recipient: fila.destinatario ?? null,
    detail: fila.detalle ? fila.detalle.slice(0, 300) : null,
    provider_message_id: fila.proveedorId ?? null,
    created_by: fila.actor ?? null,
  });
  if (error) console.warn('[avisosAnticipoVencido] no se registró el aviso', { orderId: fila.orderId, message: error.message });
}

/** Avisa al cliente un momento del anticipo vencido por los canales pedidos. Organización del pedido o de la sesión. */
export async function avisarAnticipoVencidoCliente(
  db: SupabaseClient,
  organizationId: number,
  orderId: string,
  momento: MomentoAvisoAnticipo,
  canales: readonly Canal[],
  actor: string | null = null,
): Promise<{ email: string | null; whatsapp: string | null }> {
  const resultado: { email: string | null; whatsapp: string | null } = { email: null, whatsapp: null };
  try {
    const { data: pedido } = await db
      .from('web_orders')
      .select('id, organization_id, order_number, customer_id, customer_name, customer_email, customer_phone, total, advance_amount, advance_status, advance_gateway')
      .eq('id', orderId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (!pedido) return resultado;
    const { data: previos } = await db
      .from('web_order_notices')
      .select('channel')
      .eq('organization_id', organizationId)
      .eq('web_order_id', orderId)
      .eq('moment', momento)
      .in('status', ['queued', 'sent', 'delivered']);
    const yaSalio = new Set((previos ?? []).map((p: { channel: string }) => p.channel));
    const { data: org } = await db.from('organizations').select('id, name, logo_url, primary_color').eq('id', organizationId).maybeSingle();
    const { ajustes } = await leerAjustesAvisos(db, organizationId);
    const negocio = ajustes.nombreVisible || org?.name || '';
    const anticipo = Number(pedido.advance_amount) || 0;
    const url = momento === 'anticipo_reactivado'
      ? urlSeguimiento({ id: organizationId, host: await hostPublicoOrg(db, organizationId) }, pedido)
      : null;
    const pasarela = pedido.advance_gateway ? metodoDePago({ payment_method: pedido.advance_gateway }) : null;
    const texto = textoAvisoAnticipo(momento, {
      cliente: pedido.customer_name ?? '',
      numero: pedido.order_number,
      negocio,
      anticipo: pesos(anticipo),
      alRecibir: pesos(cobroEnPuerta(pedido.total, { monto: pedido.advance_amount, estado: 'paid' })),
      medio: momento === 'anticipo_devuelto' ? (pasarela ? `reverso en ${pasarela}` : null) : null,
      url,
    });

    if (canales.includes('email') && !yaSalio.has('email')) {
      if (!pedido.customer_email) {
        resultado.email = 'no_data';
        await registrar(db, { organizationId, orderId, momento, canal: 'email', estado: 'no_data', detalle: 'sin_correo', actor });
      } else {
        const marca = org ? await marcaDelNegocio(db, organizationId, org) : { logoUrl: null, color: null };
        const color = normalizarColor(marca.color) ?? '#1E293B';
        const logo = logoPublico(marca.logoUrl);
        const asunto = asuntoAvisoAnticipo(momento, pedido.order_number);
        const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;">
<div style="background:${color}1A;border-top:4px solid ${color};padding:24px;text-align:center;border-radius:8px 8px 0 0;">
${logo ? `<img src="${escapar(logo)}" alt="${escapar(negocio || 'Logo')}" style="display:block;margin:0 auto 12px;max-height:56px;max-width:200px;height:auto;border:0;">` : ''}
<h1 style="margin:0;color:#111827;font-size:20px;">${escapar(asunto)}</h1>
</div>
<div style="padding:24px;color:#333;font-size:14px;line-height:1.5;">
${texto.split('\n\n').map((p) => `<p style="margin:0 0 12px;">${escapar(p)}</p>`).join('\n')}
</div></div>`;
        const r = await enviarAvisoEstado(db, organizationId, { nombreOrg: org?.name ?? '', nombreVisible: ajustes.nombreVisible, responderA: ajustes.responderA }, {
          to: pedido.customer_email,
          subject: asunto,
          html,
          text: texto,
        }, { orderId, estado: momento });
        resultado.email = r.ok ? 'sent' : 'failed';
        await registrar(db, { organizationId, orderId, momento, canal: 'email', estado: resultado.email, destinatario: pedido.customer_email, detalle: r.ok ? null : r.error ?? 'proveedor', proveedorId: r.id ?? null, actor });
      }
    } else {
      // Sin correo pedido (lo manda la tienda) o ya salió.
    }

    if (canales.includes('whatsapp') && !yaSalio.has('whatsapp')) {
      if (!pedido.customer_phone || !pedido.customer_id) {
        resultado.whatsapp = 'no_data';
        await registrar(db, { organizationId, orderId, momento, canal: 'whatsapp', estado: 'no_data', detalle: 'sin_telefono', actor });
      } else {
        try {
          const { sendWhatsApp } = await import('@/lib/services/crm/whatsapp/outboundService');
          const r = await sendWhatsApp(
            { orgId: organizationId, customerId: pedido.customer_id, text: texto, purpose: 'utility', source: 'platform_send', clientRequestId: `aviso:${orderId}:${momento}:${Date.now()}` },
            db,
            db,
          );
          resultado.whatsapp = 'sent';
          await registrar(db, { organizationId, orderId, momento, canal: 'whatsapp', estado: 'sent', destinatario: pedido.customer_phone, proveedorId: r.message_id, actor });
        } catch (err) {
          const codigo = (err as { code?: string })?.code ?? (err instanceof Error ? err.message : 'error');
          resultado.whatsapp = 'failed';
          await registrar(db, { organizationId, orderId, momento, canal: 'whatsapp', estado: 'failed', destinatario: pedido.customer_phone, detalle: String(codigo), actor });
        }
      }
    } else {
      // Sin WhatsApp pedido o ya salió.
    }
  } catch (err) {
    console.warn('[avisosAnticipoVencido] No se pudo avisar al cliente', { orderId, momento, err: err instanceof Error ? err.message : err });
  }
  return resultado;
}

/**
 * Después de `/auto-confirm`: con «Anticipo pagado · vencido», WhatsApp «lo estamos revisando»;
 * con el pedido reactivado por un anticipo tardío, WhatsApp «sigue en pie» en lugar del de
 * «confirmado». `true` si este aviso reemplazó al de siempre. Nunca lanza.
 */
export async function avisarTrasAutoConfirmAnticipo(
  db: SupabaseClient,
  orderId: string,
  resultado: { anticipoVencido?: boolean },
): Promise<boolean> {
  try {
    const { data: pedido } = await db.from('web_orders').select('id, organization_id, status, internal_notes').eq('id', orderId).maybeSingle();
    if (!pedido?.organization_id) return false;
    const organizationId = Number(pedido.organization_id);
    if (resultado.anticipoVencido) {
      await avisarAnticipoVencidoCliente(db, organizationId, orderId, 'anticipo_revisando', ['whatsapp']);
      return true;
    }
    if (pedido.status === 'confirmed' && reactivadoPorAnticipoTardio(pedido.internal_notes)) {
      await avisarAnticipoVencidoCliente(db, organizationId, orderId, 'anticipo_reactivado', ['whatsapp']);
      return true;
    }
    return false;
  } catch (err) {
    console.warn('[avisosAnticipoVencido] Aviso tras la confirmación', { orderId, err: err instanceof Error ? err.message : err });
    return false;
  }
}
