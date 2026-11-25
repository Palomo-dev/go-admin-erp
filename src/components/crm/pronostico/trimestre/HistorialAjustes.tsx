'use client';

/**
 * «Historial de ajustes» (botón del PageHeader, Figma CRM 1431:19; anotación
 * de 1434:1185): lista cronológica de los ajustes del trimestre, filtrable por
 * vendedor. Los ajustes no se borran: una reversión es otro ajuste. Viene en
 * la misma foto del servidor (`adjustments`), que ya respeta quién ve a quién.
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { HojaDetalle } from '@/components/kit/HojaDetalle';
import { EmptyState } from '@/components/kit/EmptyState';
import { SelectCrm } from '@/components/crm/kit/SelectCrm';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import type { ForecastAdjustment } from '@/lib/services/crm/forecastLogica';

interface Props {
  abierto: boolean;
  onAbiertoChange: (a: boolean) => void;
  ajustes: ForecastAdjustment[];
  nombre: (userId: string | null) => string;
  moneda: ContextoMoneda;
  periodo: string;
}

export function HistorialAjustes({ abierto, onAbiertoChange, ajustes, nombre, moneda, periodo }: Props) {
  const t = useTranslations('crm.pronosticoTrimestre.historial');
  const tm = useTranslations('crm.pronosticoTrimestre.ajuste.motivos');
  const { formatDateTime } = useFormatDate();
  const [vendedor, setVendedor] = useState('');
  const vendedores = [...new Set(ajustes.map((a) => a.user_id))];
  const visibles = ajustes.filter((a) => !vendedor || a.user_id === vendedor).slice().reverse();
  const m = (n: number | string, moneda_: string) => formatMoneda(Number(n), moneda_ === moneda.code ? moneda : moneda_);

  return (
    <HojaDetalle abierto={abierto} onAbiertoChange={onAbiertoChange} titulo={t('titulo')} subtitulo={periodo} ancho={560}>
      <div className="space-y-4">
        {vendedores.length > 1 && (
          <SelectCrm aria-label={t('filtro')} valor={vendedor} opcionVacia={t('todos')} onValorChange={setVendedor} opciones={vendedores.map((id) => ({ valor: id, etiqueta: nombre(id) }))} />
        )}
        {visibles.length === 0 ? (
          <EmptyState compacto titulo={t('vacio.titulo')} descripcion={t('vacio.descripcion')} />
        ) : (
          <ol className="divide-y divide-line rounded-xl border border-line bg-surface">
            {visibles.map((a) => {
              const delta = Number(a.amount_after) - Number(a.amount_before);
              return (
                <li key={a.id} className="space-y-1 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-fg">{nombre(a.user_id)}</p>
                    <time dateTime={a.created_at} className="text-xs text-fg-muted">{formatDateTime(a.created_at)}</time>
                  </div>
                  <p className="text-[13px] text-fg tabular-nums">
                    {t('cambio', { antes: m(a.amount_before, a.currency), despues: m(a.amount_after, a.currency), delta: `${delta >= 0 ? '+' : '−'}${m(Math.abs(delta), a.currency)}` })}
                  </p>
                  <p className="text-[13px] text-fg-secondary">
                    <span className="font-medium">{tm(a.reason_code)}</span> · {a.reason_text}
                  </p>
                  <p className="text-xs text-fg-muted">{t('autor', { autor: a.author?.trim() || t('sinAutor') })}</p>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </HojaDetalle>
  );
}
