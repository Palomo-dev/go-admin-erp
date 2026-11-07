'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AvisoTonal, EmptyState, Skeleton, StatusBadge } from '@/components/kit';
import { HojaDetalle } from '@/components/kit/HojaDetalle';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { crearFormateadorMoneda } from '@/lib/utils/moneda';
import { importesDispersion, importesItem, pedirApi, type Dispersion } from './cobrosLogica';

interface Props {
  dispersion: Dispersion | null;
  onCerrar: () => void;
  onRevisarCuenta: () => void;
  etiquetaEstado: (estado: string) => string;
  etiquetaMedio: (medio: string) => string;
}

/**
 * Panel de detalle de una dispersión (A8, captura 82-finanzas-r2-08): cifras,
 * motivo del fallo y cobros incluidos. Muestra lo que liquidó la plataforma;
 * la contabilización de la comisión queda fuera de esta ronda.
 */
export function DetalleDispersionHoja({ dispersion, onCerrar, onRevisarCuenta, etiquetaEstado, etiquetaMedio }: Props) {
  const t = useTranslations('finanzasCobrosR2');
  const { formatDate } = useFormatDate();
  const [detalle, setDetalle] = useState<Dispersion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  const id = dispersion?.id;
  useEffect(() => {
    if (!id) {
      setDetalle(null);
      return;
    }
    let vigente = true;
    setCargando(true);
    setError(null);
    pedirApi<Dispersion>(`/api/integrations/payfac/payouts/${encodeURIComponent(id)}`)
      .then((d) => vigente && setDetalle(d))
      .catch((e: unknown) => vigente && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [id, intento]);

  if (!dispersion) return null;
  const d = detalle ?? dispersion;
  const formatear = crearFormateadorMoneda(d.currency);
  const { bruto, comision, neto } = importesDispersion(d);
  const items = detalle?.items ?? [];

  return (
    <HojaDetalle
      abierto={Boolean(dispersion)}
      onAbiertoChange={(a) => !a && onCerrar()}
      titulo={d.payout_reference}
      insignia={<StatusBadge estado={d.status} etiqueta={etiquetaEstado(d.status)} tamano="sm" />}
      subtitulo={`${formatDate(d.period_start)} – ${formatDate(d.period_end)} · ${etiquetaMedio(d.payout_method)}`}
      ancho={560}
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            [t('detalle.recaudado'), bruto],
            [t('detalle.comision'), comision],
            [t('detalle.neto'), neto],
          ].map(([etiqueta, valor]) => (
            <div key={String(etiqueta)} className="rounded-lg border border-line bg-surface p-3">
              <p className="text-[13px] leading-[18px] text-fg-secondary">{etiqueta}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-fg">{formatear(valor as number)}</p>
            </div>
          ))}
        </div>

        {d.status === 'failed' && (
          <AvisoTonal
            tono="peligro"
            rol="alert"
            titulo={t('detalle.fallo.titulo')}
            descripcion={d.failure_reason ?? t('detalle.fallo.sinMotivo')}
            accion={{ etiqueta: t('detalle.fallo.revisarCuenta'), onClick: onRevisarCuenta }}
          />
        )}
        {d.status === 'cancelled' && d.failure_reason && (
          <AvisoTonal tono="neutro" titulo={t('detalle.cancelada')} descripcion={d.failure_reason} />
        )}

        <section className="flex flex-col gap-2" aria-labelledby="cobros-incluidos">
          <h3 id="cobros-incluidos" className="text-sm font-semibold text-fg">
            {t('detalle.cobros')}
          </h3>
          {cargando ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : error ? (
            <EmptyState variante="error" compacto titulo={t('detalle.errorCobros')} descripcion={error} onReintentar={() => setIntento((n) => n + 1)} />
          ) : items.length === 0 ? (
            <p className="text-sm text-fg-secondary">{t('detalle.sinCobros')}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-sm">
                <thead className="bg-subtle text-left text-[13px] text-fg-secondary">
                  <tr>
                    <th className="px-3 py-2 font-medium">{t('detalle.columnas.cobro')}</th>
                    <th className="px-3 py-2 text-right font-medium">{t('detalle.columnas.bruto')}</th>
                    <th className="px-3 py-2 text-right font-medium">{t('detalle.columnas.comision')}</th>
                    <th className="px-3 py-2 text-right font-medium">{t('detalle.columnas.neto')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => {
                    const m = importesItem(i);
                    return (
                      <tr key={i.id} className="border-t border-line">
                        <td className="px-3 py-2 text-fg">{i.reference ?? `${i.payment_id.slice(0, 8)}…`}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-fg">{formatear(m.bruto)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-fg-secondary">{formatear(m.comision)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-fg">{formatear(m.neto)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="text-[13px] leading-[18px] text-fg-secondary">{t('detalle.nota')}</p>
      </div>
    </HojaDetalle>
  );
}
