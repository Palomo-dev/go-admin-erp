'use client';

/**
 * «Salud del cliente» en la columna derecha de la ficha (Figma 06 Clientes,
 * «Salud» 331:113288; sin datos 772:20971): puntaje en badge, barra «N / 100»
 * con la banda y una línea de alertas (cartera vencida, días sin compras o
 * sin actividad).
 *
 * El cálculo es el de siempre (`healthScoreService.getCustomerHealthScore`,
 * `fn_customer_health` con la config de la organización); aquí solo se pinta.
 * Sin puntaje, el aviso honesto: la salud se mide solo para clientes, y a un
 * lead con facturas se le dice cuántas tiene y que lo pase a cliente.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BarraProgreso, type TonoProgreso } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { healthScoreService, type HealthScoreResult } from '@/lib/services/crm/healthScoreService';
import { tonoSalud } from './fichaLogica';

interface SaludClienteCardProps {
  customerId: string;
  /** `customers.lifecycle_stage`: la RPC solo mide `customer`. */
  lifecycleStage?: string | null;
}

const TONO_BARRA: Record<string, TonoProgreso> = { green: 'marca', yellow: 'advertencia', red: 'peligro' };

export function SaludClienteCard({ customerId, lifecycleStage }: SaludClienteCardProps) {
  const t = useTranslations('clientes.ficha.salud');
  const [puntaje, setPuntaje] = useState<HealthScoreResult | null>(null);
  const [facturas, setFacturas] = useState(0);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      setCargando(true);
      try {
        const r = await healthScoreService.getCustomerHealthScore(customerId);
        const n = !r && lifecycleStage && lifecycleStage !== 'customer' ? await healthScoreService.countInvoices(customerId) : 0;
        if (cancelado) return;
        setPuntaje(r);
        setFacturas(n);
      } catch (err) {
        console.error('Error cargando la salud del cliente:', err);
        if (!cancelado) setPuntaje(null);
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [customerId, lifecycleStage]);

  const contenedor = 'flex flex-col gap-2 rounded-xl border border-line bg-surface px-3.5 py-3';
  const cabecera = (valor?: number) => (
    <div className="flex items-center gap-1.5">
      <h3 className="text-[13px] font-semibold leading-[19px] text-fg">{t('titulo')}</h3>
      {valor !== undefined && (
        <Badge tono={tonoSalud(valor)} tamano="sm">
          {valor}
        </Badge>
      )}
    </div>
  );

  if (cargando) {
    return (
      <section aria-label={t('titulo')} aria-busy="true" className={contenedor}>
        {cabecera()}
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-2 w-full rounded-full" />
      </section>
    );
  }

  if (!puntaje) {
    const etapa = lifecycleStage && lifecycleStage !== 'customer' ? lifecycleStage : null;
    const nombreEtapa = etapa ? (t.has(`etapas.${etapa}`) ? t(`etapas.${etapa}`) : t('etapas.otra', { etapa })) : '';
    return (
      <section aria-label={t('titulo')} className={contenedor}>
        {cabecera()}
        <p className="text-[11px] leading-4 text-fg-muted">
          {etapa
            ? facturas > 0
              ? t('etapaConFacturas', { etapa: nombreEtapa, count: facturas })
              : t('etapaSinFacturas', { etapa: nombreEtapa })
            : t('sinDatos')}
        </p>
      </section>
    );
  }

  const valor = Math.round(puntaje.score);
  const raw = puntaje.raw;
  const alertas = (puntaje.alerts ?? []).map((a) => {
    if (a.code === 'overdue') return t('alertas.overdue');
    if (a.code === 'no_invoice') return raw?.days_since_last_invoice != null ? t('alertas.noInvoice', { dias: raw.days_since_last_invoice }) : t('alertas.noInvoiceNunca');
    return raw?.days_since_last_activity != null ? t('alertas.noActivity', { dias: raw.days_since_last_activity }) : t('alertas.noActivityNunca');
  });

  return (
    <section aria-label={t('titulo')} className={contenedor}>
      {cabecera(valor)}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] leading-[18px] text-fg-secondary">{t(`bandas.${puntaje.band}`)}</span>
          <span className="text-xs font-medium leading-4 text-fg tabular-nums">{t('puntaje', { n: valor })}</span>
        </div>
        <BarraProgreso valor={valor} etiqueta={t('titulo')} textoValor={t('puntaje', { n: valor })} tono={TONO_BARRA[puntaje.band] ?? 'marca'} />
      </div>
      {alertas.length > 0 && <p className="text-[11px] leading-4 text-fg-secondary">{t('alertasLinea', { lista: alertas.join(' · ') })}</p>}
    </section>
  );
}
