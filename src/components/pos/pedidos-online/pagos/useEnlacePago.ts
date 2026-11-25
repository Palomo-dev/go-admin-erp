'use client';

/**
 * Enlace de pago del pedido (la página del pedido en la tienda, con su token) para «Reenviar
 * enlace por WhatsApp», «Copiar enlace» y la vista previa del mensaje. Reutiliza
 * `enlacePagoPedido` (GET `/api/web-orders/[id]/enlace-pago`, la misma ruta de la contraentrega):
 * no se crea otro pedido ni otra ruta. Una sola petición por pedido aunque la tarjeta se pinte
 * dos veces (celular y escritorio) y la barra fija también lo pida.
 */
import { useEffect, useState } from 'react';
import { enlacePagoPedido } from '@/lib/services/contraentregaPedidoService';

const pedidos = new Map<string, Promise<string | null>>();

/** Enlace del pedido (una sola petición por pedido; un fallo se puede reintentar). */
export function obtenerEnlacePago(orderId: string): Promise<string | null> {
  let p = pedidos.get(orderId);
  if (!p) {
    p = enlacePagoPedido(orderId).then((url) => {
      if (!url) pedidos.delete(orderId);
      return url;
    });
    pedidos.set(orderId, p);
  }
  return p;
}

export function useEnlacePago(orderId: string, activo: boolean): { url: string | null; cargando: boolean } {
  const [estado, setEstado] = useState<{ id: string | null; url: string | null; cargando: boolean }>({ id: null, url: null, cargando: false });
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    setEstado({ id: orderId, url: null, cargando: true });
    void obtenerEnlacePago(orderId).then((url) => {
      if (vivo) setEstado({ id: orderId, url, cargando: false });
    });
    return () => {
      vivo = false;
    };
  }, [orderId, activo]);
  const propio = estado.id === orderId;
  return { url: propio ? estado.url : null, cargando: activo && (!propio || estado.cargando) };
}
