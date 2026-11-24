'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { EmptyState } from '@/components/kit/EmptyState';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import type { OportunidadDetalleApi } from './apiOportunidades';
import { conteoFiltros, FILTROS_LINEAS, lineasDesdeApi, totalesLineas, type FiltroLineas } from './lineasLogica';
import { LineaOportunidad } from './lineas/LineaOportunidad';
import { TotalesLineas } from './lineas/TotalesLineas';
import { useFilasLineas } from './lineas/useFilasLineas';

/**
 * Pestaña «Líneas» del detalle (Figma 1785:897367 «Detalle de la
 * oportunidad: líneas con variante, modificadores, servicio y hospedaje»):
 * la misma fila `LineaOportunidad` y los mismos totales con impuestos que el
 * formulario, con filtro por tipo. Se editan en «Editar».
 */
export function LineasResumen({ op, editarHref }: { op: OportunidadDetalleApi; editarHref?: string }) {
  const t = useTranslations('crm.oportunidad.lineas');
  const moneda = useMonedaOrganizacion().paraDocumento(op.currency);
  const l = useMemo(() => lineasDesdeApi(op), [op]);
  const filas = useFilasLineas(l, moneda);
  const [filtro, setFiltro] = useState<FiltroLineas>('todas');
  const conteo = conteoFiltros(l);
  if (conteo.todas === 0) {
    return <EmptyState variante="empty" titulo={t('sinLineasTitulo')} descripcion={t('sinLineas')} accion={editarHref ? { etiqueta: t('agregarLineas'), href: editarHref } : undefined} compacto />;
  }
  const visibles = filas.filter(({ fila }) => filtro === 'todas' || (filtro === 'productos' ? fila.clase === 'producto' : filtro === 'servicios' ? fila.clase === 'servicio' : filtro === 'hospedaje' ? fila.clase === 'hospedaje' : fila.clase === 'concepto'));
  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label={t('filtrar')} className="flex flex-wrap gap-2">
        {FILTROS_LINEAS.filter((f) => f === 'todas' || conteo[f] > 0).map((f) => (
          <button key={f} type="button" aria-pressed={filtro === f} onClick={() => setFiltro(f)} className={cn('flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium', filtro === f ? 'border-brand bg-brand-tint text-brand-deep' : 'border-line text-fg-secondary hover:bg-hover')}>
            {filtro === f && <Check aria-hidden="true" className="size-3.5" />}
            {t(`filtros.${f}`, { n: conteo[f] })}
          </button>
        ))}
      </div>
      <ul className="flex flex-col gap-2">
        {visibles.map(({ fila }) => (
          <LineaOportunidad key={fila.clave} fila={fila} moneda={moneda} compacta />
        ))}
      </ul>
      <div className="flex justify-end">
        <TotalesLineas totales={totalesLineas(l)} moneda={moneda} />
      </div>
    </div>
  );
}
