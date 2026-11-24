'use client';

/**
 * Pestaña «Comisiones» de Partners (Figma 1319:94585, anotación 1319:95503):
 * año (por fecha de registro del deal), barra apilada por estado de la
 * comisión, tabla por partner con su total, tarjeta de niveles y el bloque
 * «Portal del partner», que es una PROPUESTA: hoy no hay acceso externo para
 * partners (sin auth ni vista filtrada). Solo para admin/manager: sin
 * `can_manage` la pestaña no se muestra (anotación 1411:43453).
 */

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ExternalLink, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SelectCrm } from '@/components/crm/kit/SelectCrm';
import { EmptyState } from '@/components/kit/EmptyState';
import { Dialogo } from '@/components/kit/Dialogo';
import { clasesBoton } from '@/components/kit/botonClases';
import type { PartnerTier } from '@/lib/services/crm/partnerService';
import { formatMoney, formatRate } from '@/lib/services/crm/partnerModel';
import { cn } from '@/utils/Utils';
import { NivelesLista } from './NivelesLista';
import { aniosConDeals, comisionesPorPartner, resumenComisionesAnio, type DealFila, type PartnerFila } from './redPartnersLogica';

const COLOR_TRAMO = { paid: 'bg-brand-deep', approved: 'bg-brand', pending: 'bg-brand/50', rejected: 'bg-brand-tint' } as const;

interface Props {
  partners: readonly PartnerFila[];
  deals: readonly DealFila[];
  tiers: PartnerTier[];
  zona: string;
  anioActual: number;
  moneda: string;
  cargando: boolean;
  onEditarNiveles: () => void;
  puedeGestionar: boolean;
}

export function PartnersComisiones({ partners, deals, tiers, zona, anioActual, moneda, cargando, onEditarNiveles, puedeGestionar }: Props) {
  const t = useTranslations('crm.redPartners.comisiones');
  const tr = useTranslations('crm.redPartners');
  const idioma = useLocale();
  const [anio, setAnio] = useState(anioActual);
  const [propuesta, setPropuesta] = useState(false);
  const anios = useMemo(() => aniosConDeals(deals, zona, anioActual), [deals, zona, anioActual]);
  const resumen = useMemo(() => resumenComisionesAnio(deals, anio, zona), [deals, anio, zona]);
  const tabla = useMemo(() => comisionesPorPartner(partners, deals, anio, zona), [partners, deals, anio, zona]);
  const dinero = (v: number) => formatMoney(v, moneda);
  const anioTexto = String(anio);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <SelectCrm
          aria-label={t('anio')}
          className="sm:w-80"
          valor={anioTexto}
          onValorChange={(v) => setAnio(Number(v))}
          opciones={anios.map((a) => ({ valor: String(a), etiqueta: t('anioOpcion', { anio: String(a) }) }))}
        />
        <p className="text-[13px] text-fg-secondary">{t('porFechaRegistro')}</p>
      </div>

      <section aria-labelledby="comisiones-resumen" className="flex flex-col gap-3 rounded-xl border border-line bg-subtle p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="comisiones-resumen" className="text-[13px] font-semibold text-fg">{t('resumenTitulo', { anio: anioTexto })}</h2>
          <span className="text-sm font-semibold tabular-nums text-fg">{cargando ? <Skeleton className="h-4 w-24" /> : dinero(resumen.total)}</span>
        </div>
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-line" role="img" aria-label={t('barraAria')}>
          {resumen.tramos.map((x) => (x.monto > 0 ? <div key={x.estado} className={COLOR_TRAMO[x.estado]} style={{ width: `${(x.monto / Math.max(resumen.total, 1)) * 100}%` }} /> : null))}
        </div>
        <ul className="flex flex-col gap-1.5">
          {resumen.tramos.map((x) => (
            <li key={x.estado} className="flex items-center justify-between gap-3 text-[13px]">
              <span className="flex items-center gap-2 text-fg-secondary">
                <span aria-hidden="true" className={cn('size-2 rounded-full', COLOR_TRAMO[x.estado])} />
                {t(`tramos.${x.estado}`)}
              </span>
              <span className="tabular-nums text-fg">{t('montoPct', { monto: dinero(x.monto), pct: new Intl.NumberFormat(idioma).format(x.pct) })}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          {cargando ? (
            <div className="flex flex-col gap-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : tabla.filas.length === 0 ? (
            <EmptyState variante="empty" compacto titulo={t('sinMovimiento', { anio: anioTexto })} descripcion={t('sinMovimientoDescripcion')} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <caption className="sr-only">{t('tablaEtiqueta', { anio: anioTexto })}</caption>
                <thead className="bg-subtle">
                  <tr className="text-left text-xs font-semibold text-fg-secondary">
                    <th scope="col" className="px-3 py-3">{t('col.partner')}</th>
                    <th scope="col" className="px-3 py-3 text-right">{t('col.pendiente')}</th>
                    <th scope="col" className="px-3 py-3 text-right">{t('col.aprobada')}</th>
                    <th scope="col" className="px-3 py-3 text-right">{t('col.pagada')}</th>
                    <th scope="col" className="px-3 py-3 text-right">{t('col.total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {tabla.filas.map((f) => (
                    <tr key={f.partnerId} className="border-t border-line">
                      <th scope="row" className="px-3 py-3 text-left font-normal">
                        <span className="block text-sm text-fg">{f.nombre}</span>
                        <span className="block text-xs text-fg-secondary">
                          {[f.nivel ?? tr('nivel.sinNivel'), `${formatRate(f.tasa)}${f.propia ? ` ${tr('tasa.propia')}` : ''}`].join(' · ')}
                        </span>
                      </th>
                      <td className="px-3 py-3 text-right tabular-nums text-fg">{dinero(f.pendiente)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-fg">{dinero(f.aprobada)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-fg">{dinero(f.pagada)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-fg">{dinero(f.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-subtle">
                  <tr className="border-t border-line">
                    <th scope="row" className="px-3 py-3 text-left font-normal">
                      <span className="block text-sm text-fg">{t('total')}</span>
                      <span className="block text-xs text-fg-secondary">{t('conMovimiento', { n: tabla.filas.length })}</span>
                    </th>
                    <td className="px-3 py-3 text-right tabular-nums text-fg">{dinero(tabla.total.pendiente)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-fg">{dinero(tabla.total.aprobada)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-fg">{dinero(tabla.total.pagada)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-fg">{dinero(tabla.total.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        <section aria-labelledby="comisiones-niveles" className="flex h-fit flex-col gap-4 rounded-xl border border-line bg-surface p-5">
          <div className="flex items-center justify-between">
            <h2 id="comisiones-niveles" className="text-base font-semibold text-fg">{tr('tabs.niveles')}</h2>
            {puedeGestionar && (
              <button type="button" onClick={onEditarNiveles} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
                <Pencil aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('editarNiveles')}
              </button>
            )}
          </div>
          <NivelesLista tiers={tiers} partners={partners} moneda={moneda} cargando={cargando} />
        </section>
      </div>

      <section aria-labelledby="portal-partner" className="flex flex-col gap-3 rounded-xl border border-line-brand bg-brand-tint/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="portal-partner" className="text-sm font-semibold text-fg">{t('portal.titulo')}</h2>
            <Badge tono="marca" apariencia="contorno" tamano="sm">{t('portal.insignia')}</Badge>
          </div>
          <p className="text-[13px] text-fg-secondary">{t('portal.descripcion')}</p>
        </div>
        <button type="button" onClick={() => setPropuesta(true)} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
          <ExternalLink aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('portal.verPropuesta')}
        </button>
      </section>

      <Dialogo
        abierto={propuesta}
        onAbiertoChange={setPropuesta}
        titulo={t('portal.titulo')}
        descripcion={t('portal.insignia')}
        primario={{ etiqueta: t('portal.entendido'), onClick: () => setPropuesta(false) }}
        textoCancelar={t('portal.cerrar')}
        ancho={520}
      >
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-fg">
          <li>{t('portal.punto1')}</li>
          <li>{t('portal.punto2')}</li>
          <li>{t('portal.punto3')}</li>
          <li>{t('portal.punto4')}</li>
        </ul>
      </Dialogo>
    </div>
  );
}
