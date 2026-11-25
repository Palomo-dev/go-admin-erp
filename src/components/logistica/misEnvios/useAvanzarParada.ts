'use client';

/**
 * El siguiente paso de una parada que es un simple cambio de estado: «Recogí el paquete» (picked)
 * e «Iniciar ruta» (out_for_delivery). Una sola pieza para la parada, «Entrega confirmada» y la
 * tabla del computador: la RPC `logistica_cambiar_estado` (deliveryIntegrationService.changeStatus)
 * con la ubicación del celular si la hay, y el aviso al cliente que devuelve la base.
 *
 * Sin señal no se intenta (la cola sin conexión va en otra fase).
 */
import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { deliveryIntegrationService, EnvioError } from '@/lib/services/deliveryIntegrationService';
import type { EnvioDomiciliario } from '@/lib/logistica/misEnvios';
import { avisarCliente } from '../logisticaApi';
import { ubicacionActual } from './ubicacion';

export function useAvanzarParada() {
  const t = useTranslations('logistica.misEnvios');
  /** id del envío que se está guardando (para deshabilitar solo esa fila). */
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);

  const avanzar = useCallback(
    async (envio: Pick<EnvioDomiciliario, 'id' | 'source_type' | 'source_id'>, destino: 'picked' | 'out_for_delivery'): Promise<boolean> => {
      setOcupadoId(envio.id);
      try {
        const ubicacion = await ubicacionActual(3000);
        const r = await deliveryIntegrationService.changeStatus(envio.id, destino, ubicacion ?? {});
        void avisarCliente(envio, r.aviso);
        toastSuccess(t(`pasos.hecho.${destino}`));
        return true;
      } catch (err) {
        const codigo = err instanceof EnvioError ? err.codigo : 'ERROR';
        toastError(t('errores.titulo'), t.has(`errores.${codigo}`) ? t(`errores.${codigo}`) : t('errores.ERROR'));
        return false;
      } finally {
        setOcupadoId(null);
      }
    },
    [t],
  );

  return { avanzar, ocupadoId };
}
