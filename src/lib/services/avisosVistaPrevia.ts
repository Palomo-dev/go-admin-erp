/**
 * Vista previa de un aviso al cliente con los datos del último pedido web de
 * la organización (o uno de ejemplo). SOLO servidor; la usan la ruta de vista
 * previa y «Enviarme una prueba».
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { asuntoAviso, textoAviso, type MomentoAviso } from '@/lib/pos/pedidosWeb/avisosCliente';
import { datosDeAviso, leerAjustesAvisos, type PedidoParaAviso } from '@/lib/services/avisosClienteService';
import { urlSeguimiento } from '@/lib/services/orderStatusEmailService';

export interface VistaPreviaAviso {
  pedido: string;
  de: string;
  para: string;
  asunto: string;
  texto: string;
  zonaHoraria: string | null | undefined;
}

export async function armarVistaPrevia(
  db: SupabaseClient,
  sesion: SupabaseClient,
  organizationId: number,
  momento: MomentoAviso,
): Promise<VistaPreviaAviso> {
  const [{ data: org }, { data: pedido }, { ajustes }] = await Promise.all([
    db.from('organizations').select('id, name, subdomain, custom_domain').eq('id', organizationId).maybeSingle(),
    db
      .from('web_orders')
      .select('id, organization_id, branch_id, order_number, status, customer_id, customer_email, customer_name, customer_phone, estimated_ready_at, estimated_delivery_at, cancellation_reason, total, payment_status')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    leerAjustesAvisos(sesion, organizationId),
  ]);
  const negocio = ajustes.nombreVisible || org?.name || '';
  const ejemplo: PedidoParaAviso = {
    id: '00000000-0000-0000-0000-000000000000',
    organization_id: organizationId,
    branch_id: null,
    order_number: 'WO-000412',
    status: 'confirmed',
    customer_id: null,
    customer_email: 'cliente@ejemplo.co',
    customer_name: 'Ana Gómez',
    customer_phone: null,
    estimated_ready_at: null,
    estimated_delivery_at: null,
    cancellation_reason: null,
    total: null,
    payment_status: 'paid',
  };
  const p = (pedido as PedidoParaAviso | null) ?? ejemplo;
  const datos = await datosDeAviso(db, organizationId, p, negocio, org && pedido ? urlSeguimiento(org, p) : null);
  if (momento === 'rechazado' && !datos.motivo) datos.motivo = 'Se agotó un producto del pedido';
  return {
    pedido: p.order_number,
    de: `${negocio} · ${ajustes.responderA || process.env.EMAIL_FROM_ADDRESS || 'notificaciones@goadmin.io'}`,
    para: [p.customer_name, p.customer_email].filter(Boolean).join(' · '),
    asunto: asuntoAviso(momento, p.order_number),
    texto: textoAviso(momento, datos),
    zonaHoraria: datos.zonaHoraria,
  };
}
