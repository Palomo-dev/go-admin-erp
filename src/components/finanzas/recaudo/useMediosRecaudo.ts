'use client';

/**
 * Catálogo de medios del selector «Medio de pago» (Figma 3306-209013): sale de Finanzas › Métodos
 * de pago de la organización (activos e inactivos), nunca de una lista cableada. Varios códigos
 * de la misma pasarela (`bold_link`, `bold_qr`) son UN medio («Bold»). Un medio sin activar se
 * ofrece apagado («No conectada»). Los medios que aparecen en los pagos y no están en el catálogo
 * se agregan con su conteo (`opcionesMedio`).
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ConfiguracionService } from '@/components/pos/configuracion/configuracionService';
import { nombreVisibleMetodo } from '@/lib/finanzas/metodosPagoOrganizacion';
import { NOMBRE_PASARELA } from '@/lib/pos/pedidosWeb/pagosDelPedido';
import { esMedioPasarela, medioDeCodigo, type ClaveMedio, type TotalMedio } from '@/lib/finanzas/recaudo/recaudoPorMedio';
import type { OpcionConteo } from './FiltroConteo';

export interface MedioCatalogo {
  medio: ClaveMedio;
  etiqueta: string;
  activo: boolean;
}

const SIN_PASARELA = ['efectivo', 'datafono', 'transferencia'] as const;

export function useMediosRecaudo() {
  const t = useTranslations('recaudoMedio.medios');
  const [catalogo, setCatalogo] = useState<MedioCatalogo[]>([]);

  const nombreBase = useCallback(
    (medio: ClaveMedio): string | null => {
      if (esMedioPasarela(medio)) return NOMBRE_PASARELA[medio];
      if ((SIN_PASARELA as readonly string[]).includes(medio)) return t(medio as (typeof SIN_PASARELA)[number]);
      return null;
    },
    [t],
  );

  useEffect(() => {
    let vigente = true;
    ConfiguracionService.getPaymentMethods()
      .then((filas) => {
        if (!vigente) return;
        const mapa = new Map<ClaveMedio, MedioCatalogo>();
        for (const f of filas) {
          const medio = medioDeCodigo(f.payment_method_code);
          const pm = (Array.isArray(f.payment_methods) ? f.payment_methods[0] : f.payment_methods) as { name?: string | null } | undefined;
          const previo = mapa.get(medio);
          mapa.set(medio, {
            medio,
            etiqueta: previo?.etiqueta ?? nombreBase(medio) ?? nombreVisibleMetodo(f.settings, pm?.name, f.payment_method_code),
            activo: (previo?.activo ?? false) || !!f.is_active,
          });
        }
        setCatalogo([...mapa.values()]);
      })
      .catch(() => vigente && setCatalogo([]));
    return () => {
      vigente = false;
    };
  }, [nombreBase]);

  /** Nombre visible de un medio (catálogo, nombre propio de la pasarela o el código). */
  const nombre = useCallback(
    (medio: ClaveMedio) => catalogo.find((c) => c.medio === medio)?.etiqueta ?? nombreBase(medio) ?? medio,
    [catalogo, nombreBase],
  );

  /**
   * Opciones del selector: el catálogo y los medios con pagos, con «n · $ valor» (o «No
   * conectada» si el medio está inactivo y sin pagos). Pasarelas en un grupo, el resto en otro.
   */
  const opcionesMedio = useCallback(
    (totales: readonly TotalMedio[], formatear: (n: number) => string, elegidos: readonly string[] = []): OpcionConteo[] => {
      const medios = new Map<ClaveMedio, MedioCatalogo>();
      for (const c of catalogo) medios.set(c.medio, c);
      for (const tm of totales) if (!medios.has(tm.medio)) medios.set(tm.medio, { medio: tm.medio, etiqueta: nombre(tm.medio), activo: true });
      for (const e of elegidos) if (!medios.has(e)) medios.set(e, { medio: e, etiqueta: nombre(e), activo: true });
      return [...medios.values()]
        .map((m) => {
          const tm = totales.find((x) => x.medio === m.medio);
          const apagado = !m.activo && !tm;
          return {
            valor: String(m.medio),
            etiqueta: m.etiqueta,
            grupo: esMedioPasarela(m.medio) ? 'pasarelas' : 'otros',
            detalle: apagado ? t('noConectada') : `${tm?.pagos ?? 0} · ${formatear(tm?.monto ?? 0)}`,
            deshabilitada: apagado && !elegidos.includes(String(m.medio)),
            orden: tm?.monto ?? -1,
          };
        })
        .sort((a, b) => b.orden - a.orden || a.etiqueta.localeCompare(b.etiqueta))
        .map((o): OpcionConteo => ({ valor: o.valor, etiqueta: o.etiqueta, grupo: o.grupo, detalle: o.detalle, deshabilitada: o.deshabilitada }));
    },
    [catalogo, nombre, t],
  );

  return { catalogo, nombre, opcionesMedio };
}
