'use client';

/**
 * «Reenviar enlace por WhatsApp», «Copiar enlace» y «Escribir al cliente» de la tarjeta «Pagos».
 * Reutiliza `enlaceWhatsApp` (teléfono → wa.me) y el enlace de pago del pedido
 * (`/api/web-orders/[id]/enlace-pago`): no se crea otro pedido ni otra ruta. Lo usan la tarjeta y
 * la barra fija del celular, con el mismo mensaje.
 */
import { useState } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { enlaceWhatsApp } from '@/lib/services/contraentregaPedidoService';
import { formatTimeInTz } from '@/lib/utils/dateDisplay';
import {
  claveMensajeWhatsApp,
  motivoDelIntento,
  raizTienda,
  ultimoRechazo,
  type EstadoTarjetaPagos,
} from '@/lib/pos/pedidosWeb/intentosPago';
import type { WebOrder } from '@/lib/services/webOrdersService';
import type { DatosIntentosPago } from './useIntentosPago';
import { obtenerEnlacePago, useEnlacePago } from './useEnlacePago';
import { useTextosPago } from './useTextosPago';

export function useAccionesPago(order: WebOrder, estado: EstadoTarjetaPagos | null, datos: DatosIntentosPago, timezone: string) {
  const textos = useTextosPago();
  const { t } = textos;
  const { toast } = useToast();
  const [ocupado, setOcupado] = useState(false);
  const conMensaje = claveMensajeWhatsApp(estado) !== null;
  const enlace = useEnlacePago(order.id, conMensaje);

  const rechazo = estado === 'C' ? ultimoRechazo(datos.intentos, 'order') : null;
  const motivo = rechazo ? motivoDelIntento(rechazo) : null;
  const telefono = order.customer_phone || order.customer?.phone || null;
  const nombre = order.customer_name || order.customer?.full_name || null;

  /** Texto del mensaje con el enlace dado (el de la tienda si el pedido venció). */
  const armar = (url: string | null): string | null =>
    textos.mensaje(estado, {
      nombre,
      numero: order.order_number,
      motivo: motivo ? textos.motivo(motivo) : null,
      hora: datos.venceAt ? formatTimeInTz(datos.venceAt, timezone) : null,
      url: estado === 'E' ? raizTienda(url) : url,
    });

  /** Abre WhatsApp con el mensaje del estado (A, C, C2: con el enlace; E: invitación a un pedido nuevo). */
  const enviar = async () => {
    setOcupado(true);
    try {
      const url = enlace.url ?? (await obtenerEnlacePago(order.id));
      if (!url && estado !== 'E') {
        toast({ title: t('acciones.sinEnlace'), variant: 'destructive' });
        return;
      }
      const texto = armar(url);
      const wa = texto ? enlaceWhatsApp(telefono, texto) : null;
      if (!wa) {
        toast({ title: t('acciones.sinTelefono'), variant: 'destructive' });
        return;
      }
      window.open(wa, '_blank', 'noopener,noreferrer');
    } finally {
      setOcupado(false);
    }
  };

  const copiar = async () => {
    const url = enlace.url ?? (await obtenerEnlacePago(order.id));
    if (!url) {
      toast({ title: t('acciones.sinEnlace'), variant: 'destructive' });
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: t('acciones.copiado') });
    } catch {
      toast({ title: t('acciones.noCopiado'), variant: 'destructive' });
    }
  };

  return {
    /** Vista previa del mensaje (sin enlace mientras carga). */
    vistaPrevia: conMensaje ? armar(enlace.url ?? (enlace.cargando ? '…' : null)) : null,
    cargandoEnlace: enlace.cargando,
    ocupado,
    enviar: () => void enviar(),
    copiar: () => void copiar(),
  };
}
