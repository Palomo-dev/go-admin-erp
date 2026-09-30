'use client';

import Link from 'next/link';
import { AlertTriangle, Check, Info, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Tarjeta, clasesBoton } from '@/components/kit';
import { sinMovimientos, variacionesRelevantes, type VariacionKpi } from '@/lib/services/reportes/comparativo';
import type { FiltroReporte, LecturaReporte, ReportData, ReportDefinition } from '@/lib/services/reportes/types';
import { useFormatoReporte } from './useFormatoReporte';

const FILTROS: readonly FiltroReporte[] = ['comparativo', 'sucursal', 'franja', 'centroCosto'];

const ICONO = { bien: Check, aviso: AlertTriangle, alerta: AlertTriangle, info: Info } as const;

type ItemLectura = LecturaReporte & { direccion?: 'sube' | 'baja' };

export function LecturaRapida({
  data,
  def,
  variaciones,
  periodoComparado,
}: {
  data: ReportData;
  def: Pick<ReportDefinition, 'filtros' | 'alcance'>;
  variaciones: VariacionKpi[] | null;
  periodoComparado: string | null;
}) {
  const t = useTranslations('reportes.visor');
  const tFiltro = useTranslations('reportes.filtroTipo');
  const formato = useFormatoReporte();
  const propias: ItemLectura[] = data.lectura ?? [];
  const extra: ItemLectura[] = [];
  if (sinMovimientos(data)) extra.push({ tono: 'info', texto: t('sinMovimientos') });
  else if (variaciones && periodoComparado) {
    for (const v of variacionesRelevantes(variaciones)) {
      const direccion = v.porcentaje > 0 ? 'sube' : 'baja';
      extra.push({
        tono: 'info',
        direccion,
        texto: t(direccion, { titulo: v.titulo, valor: formato.porcentaje(Math.abs(v.porcentaje)), periodo: periodoComparado }),
      });
    }
  }
  const lectura = [...propias, ...extra];

  return (
    <Tarjeta titulo={t('lectura')}>
      <ul className="flex flex-col gap-3">
        {lectura.length === 0 && <li className="text-sm text-fg-secondary">{t('sinMovimientos')}</li>}
        {lectura.map((l, i) => {
          const Icono = l.direccion === 'baja' ? TrendingDown : l.direccion === 'sube' ? TrendingUp : ICONO[l.tono];
          return (
            <li key={i} className="flex gap-2 text-sm text-fg">
              <Icono aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
              <div className="min-w-0">
                <p>{l.texto}</p>
                {l.href && l.etiquetaAccion && (
                  <Link href={l.href} className={clasesBoton({ variante: 'secundario', tamano: 'sm', className: 'mt-2' })}>
                    {l.etiquetaAccion}
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-fg-muted">{t('filtrosDeEste')}</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {FILTROS.map((f) => {
          const aplica = def.filtros.includes(f) && !(f === 'sucursal' && def.alcance === 'organizacion');
          return (
            <li key={f} className="flex items-center gap-2 text-sm">
              {aplica ? <Check aria-hidden className="size-4 text-success-text" strokeWidth={1.5} /> : <Minus aria-hidden className="size-4 text-fg-muted" strokeWidth={1.5} />}
              <span className={aplica ? 'text-fg' : 'text-fg-muted'}>
                {tFiltro(f)}
                {!aplica && ` · ${t('noAplica')}`}
              </span>
            </li>
          );
        })}
      </ul>
    </Tarjeta>
  );
}
