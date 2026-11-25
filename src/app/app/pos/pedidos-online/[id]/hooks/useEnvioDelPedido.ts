'use client';

/**
 * El envío real del pedido (tarjeta «Entrega», Figma 3236-223013, e historial sincronizado
 * 3239-355997). Lee con `envioDePedidoWeb` (sesión del usuario, RLS de Logística, organización
 * de la sesión) y se vuelve a leer cuando el pedido cambia de estado o de `updated_at`: la
 * sincronización pedido ⇄ envío vive en la base, así que lo que cambie uno se ve en el otro.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import { envioDePedidoWeb, type EnvioDePedido } from '@/lib/services/logistica/despachoService';
import { esDomicilio } from '@/lib/pos/pedidosWeb/tipoEntrega';
import type { WebOrder } from '@/lib/services/webOrdersService';

export interface EnvioDelPedido {
  envio: EnvioDePedido | null;
  cargando: boolean;
  /** No se pudo leer (red o permisos): la tarjeta no ofrece crear otro envío. */
  error: boolean;
  recargar: () => void;
}

export function useEnvioDelPedido(order: WebOrder | null, organizationId: number | null | undefined): EnvioDelPedido {
  const [envio, setEnvio] = useState<EnvioDePedido | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);
  const [vuelta, setVuelta] = useState(0);
  const recargar = useCallback(() => setVuelta((n) => n + 1), []);

  const id = order?.id ?? null;
  // Comer aquí no tiene envío; recoger en tienda tampoco suele tenerlo, pero si lo tiene se muestra.
  const aplica = !!order && (esDomicilio(order.delivery_type) || order.delivery_type === 'pickup');
  const version = `${order?.status ?? ''}-${order?.updated_at ?? ''}`;

  useEffect(() => {
    if (!id || !organizationId || !aplica) {
      setEnvio(null);
      return;
    }
    let vigente = true;
    setCargando(true);
    setError(false);
    envioDePedidoWeb(supabase, organizationId, id)
      .then((e) => vigente && setEnvio(e))
      .catch((e) => {
        console.warn('[pedido online] no se pudo leer el envío del pedido:', e);
        if (vigente) setError(true);
      })
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [id, organizationId, aplica, version, vuelta]);

  return { envio, cargando, error, recargar };
}
