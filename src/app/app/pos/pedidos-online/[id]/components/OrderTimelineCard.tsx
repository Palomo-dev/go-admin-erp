'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { History } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { OrderTimeline } from '@/components/pos/pedidos-online';
import type { PasoEnvioHistorial } from '@/components/pos/pedidos-online/OrderTimeline';
import { ChipsAvisos, useAvisosPedido } from '@/components/pos/pedidos-online/avisos/AvisosPedidoPanel';
import type { AvisoDePedido } from '@/components/pos/pedidos-online/avisos/avisosClienteApi';
import type { WebOrder } from '@/lib/services/webOrdersService';
import type { EnvioDePedido } from '@/lib/services/logistica/despachoService';
import { esTransportadora, hitosDelEnvio, momentoAvisoDeHito } from '@/lib/pos/pedidosWeb/entregaEnvio';
import { vehiculoDelEnvio } from '@/lib/logistica/vehiculoAsignacion';
import { formatTimeInTz } from '@/lib/utils/dateDisplay';
import { IconoCabecera } from './IconoCabecera';

interface OrderTimelineCardProps {
  order: WebOrder;
  /** Zona horaria de la organización. */
  timezone: string;
  /** Envío del pedido: sus hitos entran en la misma línea de tiempo (Figma 3239-355997). */
  envio?: EnvioDePedido | null;
}

/**
 * «Historial del pedido» (Figma 1981:175699): cada paso con su hora en la zona
 * de la organización y, debajo, los avisos al cliente que disparó (465:85608)
 * con «Reenviar» cuando fallaron. Con envío, UNA sola línea: los hitos de
 * Logística (o de la transportadora) con su hora real y su etiqueta de fuente.
 */
export function OrderTimelineCard({ order, timezone, envio }: OrderTimelineCardProps) {
  const t = useTranslations('posAvisosCliente.historial');
  const tE = useTranslations('pedidoWebEntrega.historial');
  const tMotivo = useTranslations('logistica.envio.motivos');
  const { avisos, reenviando, reenviar } = useAvisosPedido(order.id, `${order.status}-${order.updated_at ?? ''}`);

  const pasosEnvio = useMemo<PasoEnvioHistorial[] | undefined>(() => {
    if (!envio) return undefined;
    const e = envio.envio;
    const tercero = esTransportadora({ modo: e.fulfillment_mode, deliveryType: order.delivery_type });
    const transportadora = envio.extra.carrier?.name?.trim() || order.delivery_partner?.trim() || null;
    const hitos = hitosDelEnvio(envio.eventos, { status: e.status, modo: e.fulfillment_mode, ...envio.extra, assigned_at: e.assigned_at }, order.delivery_type);
    const domiciliario = envio.fila.domiciliario ?? envio.domiciliario?.full_name ?? null;
    const vehiculo = vehiculoDelEnvio(e.metadata, envio.vehiculo);
    const placa = vehiculo?.tipo === 'vehiculo' ? vehiculo.placa : null;
    const paquetes = Math.max(1, Number(envio.extra.package_count) || 1);
    const sede = order.branch?.name ?? null;
    const ultimoAsignado = [...hitos].reverse().find((h) => h.canonico === 'assigned' && h.estado !== 'pendiente')?.clave;
    const avisosPuestos = new Set<string>();
    return hitos.map((h) => {
      const motivo = h.motivo && tMotivo.has(h.motivo) ? tMotivo(h.motivo) : null;
      let etiqueta: string;
      let detalle: string | null = null;
      switch (h.canonico) {
        case 'ready_for_pickup':
          etiqueta = tE('listo');
          detalle = [tE('guia', { numero: envio.fila.numero }), paquetes > 1 ? tE('paquetes', { count: paquetes }) : null].filter(Boolean).join(' · ');
          break;
        case 'assigned':
          etiqueta = tE('asignado');
          detalle = h.clave === ultimoAsignado ? [domiciliario, placa].filter(Boolean).join(' · ') || null : null;
          break;
        case 'picked':
          etiqueta = tercero ? tE('entregadoTransportadora') : tE('recogido');
          break;
        case 'in_transit':
          etiqueta = tE('enTransito');
          break;
        case 'out_for_delivery':
          etiqueta = h.intento && h.intento > 1 ? tE('enCaminoIntento', { n: h.intento }) : tercero ? tE('enReparto') : tE('enCamino');
          detalle = h.estado !== 'pendiente' && !tercero && sede && !h.intento ? tE('salioDe', { sede }) : null;
          break;
        case 'failed_attempt':
        case 'exception':
          etiqueta = motivo ? tE('novedadMotivo', { motivo }) : tE('novedad');
          break;
        case 'delivered':
          etiqueta = tE('entregado');
          detalle = h.estado !== 'pendiente' && envio.prueba ? tE('recibio', { nombre: envio.prueba.recipient_name }) : null;
          break;
        case 'returned':
          etiqueta = tE('devuelto');
          break;
        case 'cancelled':
          etiqueta = tE('cancelado');
          break;
        default:
          etiqueta = h.canonico;
      }
      // El aviso al cliente va bajo el primer hito de su momento (no en cada reintento).
      const momento = momentoAvisoDeHito(h.canonico);
      const momentoAviso = momento && h.estado !== 'pendiente' && !avisosPuestos.has(momento) ? (avisosPuestos.add(momento), momento) : null;
      const horaPendiente =
        h.estado === 'pendiente' && h.canonico === 'delivered' && order.estimated_delivery_at
          ? tE('aprox', { hora: formatTimeInTz(order.estimated_delivery_at, timezone) })
          : null;
      return {
        clave: h.clave,
        canonico: h.canonico,
        estado: h.estado,
        hora: h.hora,
        etiqueta,
        detalle,
        fuente: h.fuente === 'transportadora' ? transportadora ?? tE('transportadora') : tE('logistica'),
        horaPendiente,
        momentoAviso,
      };
    });
  }, [envio, order.delivery_type, order.delivery_partner, order.branch?.name, order.estimated_delivery_at, timezone, tE, tMotivo]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <IconoCabecera icono={History} />
          {t('historialPedido')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <OrderTimeline<AvisoDePedido>
          order={order}
          timezone={timezone}
          avisos={avisos}
          pasosEnvio={pasosEnvio}
          renderAvisos={(lista) => <ChipsAvisos avisos={lista} timezone={timezone} reenviando={reenviando} onReenviar={(c) => void reenviar(c)} />}
        />
      </CardContent>
    </Card>
  );
}
