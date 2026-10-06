/**
 * Avisos al cliente de los pedidos web — SOLO servidor.
 *
 * Un único punto que decide qué sale en cada cambio de estado (regla 7): los
 * ajustes de la organización (`web_order_notice_settings`, Configuración › POS
 * › Avisos al cliente), el correo de estado de siempre
 * (`orderStatusEmailService`) y el WhatsApp del CRM (`sendWhatsApp`, el mismo
 * camino que el resto de mensajes salientes, con sus créditos y su ventana).
 * Cada aviso queda en `web_order_notices` con su estado, que es lo que el
 * detalle del pedido muestra como historial y lo que «Reenviar» repite.
 *
 * Si las migraciones 20261006170220/170233/170832 aún no están aplicadas
 * (no hay tablas), se comporta exactamente como antes: correo en cada estado
 * con aviso, sin WhatsApp y sin registro.
 *
 * Nunca lanza: un aviso que no sale no puede tumbar un cambio de estado. La
 * organización la pone quien llama (sesión o el propio pedido), nunca un body.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AJUSTES_POR_DEFECTO,
  asuntoAviso,
  momentoDeEstado,
  normalizarMomentos,
  textoAviso,
  type AjustesAvisos,
  type CanalAviso,
  type DatosAviso,
  type EstadoRegistroAviso,
  type MomentoAviso,
} from '@/lib/pos/pedidosWeb/avisosCliente';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { formatTimeInTz } from '@/lib/utils/dateDisplay';
import { formatCurrency } from '@/utils/Utils';

const TABLA_NO_EXISTE = /does not exist|could not find the table|schema cache/i;

function tablaAusente(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  return !!error && (error.code === '42P01' || error.code === 'PGRST205' || TABLA_NO_EXISTE.test(error.message ?? ''));
}

export async function leerAjustesAvisos(db: SupabaseClient, organizationId: number): Promise<{ ajustes: AjustesAvisos; disponible: boolean; guardados: boolean }> {
  const { data, error } = await db
    .from('web_order_notice_settings')
    .select('moments, sender_name, reply_to_email, whatsapp_number')
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) {
    return { ajustes: AJUSTES_POR_DEFECTO, disponible: !tablaAusente(error), guardados: false };
  }
  if (!data) return { ajustes: AJUSTES_POR_DEFECTO, disponible: true, guardados: false };
  return {
    disponible: true,
    guardados: true,
    ajustes: {
      momentos: normalizarMomentos(data.moments),
      nombreVisible: data.sender_name ?? null,
      responderA: data.reply_to_email ?? null,
      whatsapp: data.whatsapp_number ?? null,
    },
  };
}

export async function guardarAjustesAvisos(
  db: SupabaseClient,
  organizationId: number,
  userId: string,
  ajustes: AjustesAvisos,
): Promise<{ ok: true } | { ok: false; codigo: 'no_disponible' | 'error' }> {
  const { error } = await db.from('web_order_notice_settings').upsert(
    {
      organization_id: organizationId,
      moments: ajustes.momentos,
      sender_name: ajustes.nombreVisible,
      reply_to_email: ajustes.responderA,
      whatsapp_number: ajustes.whatsapp,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    },
    { onConflict: 'organization_id' },
  );
  if (error) return { ok: false, codigo: tablaAusente(error) ? 'no_disponible' : 'error' };
  return { ok: true };
}

export interface AvisoRegistrado {
  id: string;
  moment: MomentoAviso;
  channel: CanalAviso;
  status: EstadoRegistroAviso;
  recipient: string | null;
  detail: string | null;
  created_at: string;
}

export async function listarAvisosPedido(db: SupabaseClient, organizationId: number, orderId: string): Promise<{ avisos: AvisoRegistrado[]; disponible: boolean }> {
  const { data, error } = await db
    .from('web_order_notices')
    .select('id, moment, channel, status, recipient, detail, created_at')
    .eq('organization_id', organizationId)
    .eq('web_order_id', orderId)
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) return { avisos: [], disponible: !tablaAusente(error) };
  return { avisos: (data ?? []) as AvisoRegistrado[], disponible: true };
}

async function registrar(
  db: SupabaseClient,
  fila: { organizationId: number; orderId: string; momento: MomentoAviso; canal: CanalAviso; estado: EstadoRegistroAviso; destinatario?: string | null; detalle?: string | null; proveedorId?: string | null; actor?: string | null },
) {
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
  if (error && !tablaAusente(error)) console.warn('[avisosCliente] no se registró el aviso', { orderId: fila.orderId, message: error.message });
}

export interface PedidoParaAviso {
  id: string;
  organization_id: number;
  branch_id: number | null;
  order_number: string;
  status: string;
  customer_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  estimated_ready_at: string | null;
  estimated_delivery_at: string | null;
  cancellation_reason: string | null;
  total: number | null;
  payment_status: string | null;
}

/** Datos de la plantilla a partir del pedido real (también la vista previa). */
export async function datosDeAviso(
  db: SupabaseClient,
  organizationId: number,
  pedido: PedidoParaAviso,
  negocio: string,
  url: string | null,
): Promise<DatosAviso> {
  const zona = await getOrganizationTimezone(organizationId, db);
  const [{ data: items }, { data: sede }] = await Promise.all([
    db.from('web_order_items').select('product_name, quantity').eq('web_order_id', pedido.id).limit(30),
    pedido.branch_id
      ? db.from('branches').select('name').eq('id', pedido.branch_id).eq('organization_id', organizationId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const lineas = ((items ?? []) as Array<{ product_name: string | null; quantity: number | null }>)
    .map((i) => `${Number(i.quantity ?? 1)} × ${i.product_name ?? ''}`.trim())
    .join(' · ');
  return {
    cliente: pedido.customer_name ?? '',
    numero: pedido.order_number,
    negocio,
    sucursal: (sede as { name?: string } | null)?.name ?? null,
    listoAprox: pedido.estimated_ready_at ? formatTimeInTz(pedido.estimated_ready_at, zona) : null,
    entregaAprox: pedido.estimated_delivery_at ? formatTimeInTz(pedido.estimated_delivery_at, zona) : null,
    zonaHoraria: zona ? `hora de ${(zona.split('/').pop() ?? zona).replace(/_/g, ' ')}` : null,
    lineas: lineas || null,
    total: pedido.total != null ? formatCurrency(Number(pedido.total)) : null,
    pagado: pedido.payment_status === 'paid',
    motivo: pedido.cancellation_reason,
    url,
  };
}

export type ResultadoCanal = EstadoRegistroAviso | 'apagado' | null;

/**
 * Envía los avisos del estado ACTUAL del pedido por los canales encendidos.
 * `enviarCorreo` lo pone `orderStatusEmailService` (el correo de siempre).
 */
export async function avisarClientePedido(
  db: SupabaseClient,
  organizationId: number,
  pedido: PedidoParaAviso,
  contexto: {
    negocio: string;
    url: string | null;
    actor?: string | null;
    soloCanal?: CanalAviso | null;
    enviarCorreo: (extra: { asunto: string; texto: string; nombreVisible: string | null; responderA: string | null }) => Promise<{ ok: boolean; id?: string | null; error?: string | null }>;
    /** Legado (sin tablas): qué estados avisaban antes. */
    estadoConAvisoLegado: (estado: string) => boolean;
  },
): Promise<{ email: ResultadoCanal; whatsapp: ResultadoCanal; momento: MomentoAviso | null }> {
  const momento = momentoDeEstado(pedido.status);
  const { ajustes, disponible } = await leerAjustesAvisos(db, organizationId);

  // Sin la migración: exactamente lo de antes (solo correo, sin registro).
  if (!disponible) {
    if (!contexto.estadoConAvisoLegado(pedido.status) || !pedido.customer_email) return { email: null, whatsapp: null, momento };
    const r = await contexto.enviarCorreo({ asunto: '', texto: '', nombreVisible: null, responderA: null });
    return { email: r.ok ? 'sent' : 'failed', whatsapp: null, momento };
  }
  // `recibido` lo manda el sitio al crear el pedido; aquí solo si se reenvía.
  if (!momento) return { email: null, whatsapp: null, momento };

  const datos = await datosDeAviso(db, organizationId, pedido, ajustes.nombreVisible || contexto.negocio, contexto.url);
  const texto = textoAviso(momento, datos);
  const resultado: { email: ResultadoCanal; whatsapp: ResultadoCanal } = { email: 'apagado', whatsapp: 'apagado' };

  if (ajustes.momentos[momento].email && contexto.soloCanal !== 'whatsapp') {
    if (!pedido.customer_email) {
      resultado.email = 'no_data';
      await registrar(db, { organizationId, orderId: pedido.id, momento, canal: 'email', estado: 'no_data', detalle: 'sin_correo', actor: contexto.actor });
    } else {
      const r = await contexto.enviarCorreo({ asunto: asuntoAviso(momento, pedido.order_number), texto, nombreVisible: ajustes.nombreVisible, responderA: ajustes.responderA });
      resultado.email = r.ok ? 'sent' : 'failed';
      await registrar(db, {
        organizationId, orderId: pedido.id, momento, canal: 'email', estado: resultado.email,
        destinatario: pedido.customer_email, detalle: r.ok ? null : r.error ?? 'proveedor', proveedorId: r.id ?? null, actor: contexto.actor,
      });
    }
  }

  if (ajustes.momentos[momento].whatsapp && contexto.soloCanal !== 'email') {
    if (!pedido.customer_phone || !pedido.customer_id) {
      resultado.whatsapp = 'no_data';
      await registrar(db, { organizationId, orderId: pedido.id, momento, canal: 'whatsapp', estado: 'no_data', detalle: 'sin_telefono', actor: contexto.actor });
    } else {
      try {
        const { sendWhatsApp } = await import('@/lib/services/crm/whatsapp/outboundService');
        const r = await sendWhatsApp(
          { orgId: organizationId, customerId: pedido.customer_id, text: texto, purpose: 'utility', source: 'platform_send', clientRequestId: `aviso:${pedido.id}:${momento}:${Date.now()}` },
          db,
          db,
        );
        resultado.whatsapp = 'sent';
        await registrar(db, { organizationId, orderId: pedido.id, momento, canal: 'whatsapp', estado: 'sent', destinatario: pedido.customer_phone, proveedorId: r.message_id, actor: contexto.actor });
      } catch (err) {
        const codigo = (err as { code?: string })?.code ?? (err instanceof Error ? err.message : 'error');
        resultado.whatsapp = 'failed';
        await registrar(db, { organizationId, orderId: pedido.id, momento, canal: 'whatsapp', estado: 'failed', destinatario: pedido.customer_phone, detalle: String(codigo), actor: contexto.actor });
      }
    }
  }
  return { ...resultado, momento };
}
