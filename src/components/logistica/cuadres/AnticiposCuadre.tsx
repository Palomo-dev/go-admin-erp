'use client';

/**
 * «Ya pagado en línea» del cuadre del domiciliario (Figma 3014:194407 › 07): los anticipos de
 * contraentrega que ya entraron por la pasarela, aparte de lo esperado en la puerta, con la nota
 * «no se cobra en la puerta» por pedido. «Esperado» sigue siendo solo `cod_amount`. Sin anticipos
 * no pinta nada.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Globe } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { metodoDePago } from '@/lib/pos/pedidosWeb/metodoDePago';
import { anticiposDelCuadre, type AnticipoEnCuadre } from '@/lib/pos/pedidosWeb/contraentregaPedido';

export function AnticiposCuadre({ organizationId, shipmentIds }: { organizationId: number; shipmentIds: readonly string[] }) {
  const t = useTranslations('contraentregaPedidos');
  const { formatear } = useMonedaOrganizacion();
  const [resumen, setResumen] = useState<{ total: number; items: AnticipoEnCuadre[] }>({ total: 0, items: [] });
  const clave = [...shipmentIds].sort().join(',');

  useEffect(() => {
    let vivo = true;
    const ids = clave ? clave.split(',') : [];
    if (ids.length === 0) {
      setResumen({ total: 0, items: [] });
      return;
    }
    void (async () => {
      try {
        const { data: envios } = await supabase
          .from('shipments')
          .select('source_id')
          .eq('organization_id', organizationId)
          .eq('source_type', 'web_order')
          .in('id', ids);
        const pedidosIds = ((envios ?? []) as Array<{ source_id: string | null }>).map((e) => e.source_id).filter((x): x is string => !!x);
        if (pedidosIds.length === 0) {
          if (vivo) setResumen({ total: 0, items: [] });
          return;
        }
        const { data: pedidos } = await supabase
          .from('web_orders')
          .select('order_number, advance_amount, advance_status, advance_gateway')
          .eq('organization_id', organizationId)
          .in('id', pedidosIds);
        if (vivo) setResumen(anticiposDelCuadre((pedidos ?? []) as Parameters<typeof anticiposDelCuadre>[0]));
      } catch {
        // Sin la lectura, el cuadre se ve como antes (sin «Ya pagado en línea»).
        if (vivo) setResumen({ total: 0, items: [] });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [organizationId, clave]);

  if (resumen.items.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-label={t('cuadre.yaPagado')}>
      <div className="flex items-center justify-between rounded-xl border border-line px-4 py-3">
        <span className="text-sm text-fg-secondary">{t('cuadre.yaPagado')}</span>
        <span className="text-base font-semibold text-link">{formatear(resumen.total)}</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {resumen.items.map((a) => (
          <li key={a.numero} className="flex items-start gap-2 rounded-lg bg-info-subtle px-3 py-2 text-xs text-info-text">
            <Globe aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} />
            <span>
              {t('cuadre.nota', {
                numero: a.numero,
                monto: formatear(a.monto),
                pasarela: a.pasarela ? metodoDePago({ payment_method: a.pasarela }) : t('cuadre.enLinea'),
              })}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-fg-muted">{t('cuadre.explicacion')}</p>
    </section>
  );
}
