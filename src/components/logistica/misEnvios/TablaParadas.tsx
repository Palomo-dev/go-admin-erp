'use client';

/**
 * Tabla de paradas del computador (Figma «21 Logística» a/c, 3212-109460 y 3216-110925): parada ·
 * envío, dirección y municipio, ventana (hora prometida), contraentrega y acciones. La misma tabla
 * para el domiciliario y para el supervisor: lo único que cambia son las acciones de cada fila.
 *
 * Ventana: la base no guarda una franja por envío; se muestra la hora prometida del pedido de la
 * tienda, la hora de entrega o el día reprogramado.
 */
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { StatusBadge } from '@/components/kit';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { porCobrar } from '@/lib/logistica/misEnvios';
import type { EnvioApp } from '@/lib/services/logistica/misEnviosService';
import { cn } from '@/utils/Utils';
import { ChipPromesa, InsigniaEstadoApp } from './piezas';
import { useFechaCorta } from './PiezasVehiculo';

export interface TablaParadasProps {
  filas: readonly EnvioApp[];
  /** Número de parada de cada envío pendiente (null: entregado o novedad). */
  numeroDe: (e: EnvioApp) => number | null;
  zonaDe: (e: EnvioApp) => string;
  ahora: Date;
  hoy: string;
  acciones: (e: EnvioApp) => ReactNode;
  onAbrir: (e: EnvioApp) => void;
  vacio?: ReactNode;
}

export function TablaParadas({ filas, numeroDe, zonaDe, ahora, hoy, acciones, onAbrir, vacio }: TablaParadasProps) {
  const t = useTranslations('logistica.misEnvios');
  const locale = useLocaleIntl();
  const moneda = useMonedaOrganizacion();
  const fecha = useFechaCorta();
  const hora = (v: string, zona: string) => new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: zona }).format(new Date(v));
  const origen = (e: EnvioApp) => (e.source_type === 'web_order' ? t('origen.tienda') : e.source_type === 'sale' ? t('origen.pos') : t('origen.otro'));

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <table className="w-full table-fixed text-sm">
        <thead className="border-b border-line bg-subtle text-left text-[13px] text-fg-secondary">
          <tr>
            <th scope="col" className="w-[19%] px-4 py-3 font-medium">{t('escritorio.columnas.parada')}</th>
            <th scope="col" className="w-[24%] px-4 py-3 font-medium">{t('escritorio.columnas.direccion')}</th>
            <th scope="col" className="w-[17%] px-4 py-3 font-medium">{t('escritorio.columnas.ventana')}</th>
            <th scope="col" className="w-[15%] px-4 py-3 font-medium">{t('escritorio.columnas.contraentrega')}</th>
            <th scope="col" className="w-[25%] px-4 py-3 font-medium">{t('escritorio.columnas.acciones')}</th>
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-8">
                {vacio}
              </td>
            </tr>
          ) : (
            filas.map((e) => {
              const numero = numeroDe(e);
              const zona = zonaDe(e);
              const enCamino = e.status === 'out_for_delivery';
              const cobro = porCobrar(e);
              const reprogramado = e.status === 'failed_attempt' && e.expected_delivery_date && e.expected_delivery_date > hoy;
              return (
                <tr
                  key={e.id}
                  onClick={() => onAbrir(e)}
                  className={cn('cursor-pointer border-b border-line align-middle last:border-b-0 hover:bg-hover', enCamino && 'bg-brand-tint')}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {e.status === 'delivered' ? (
                        <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-success-subtle text-success-text">
                          <Check className="size-3.5" strokeWidth={2} />
                        </span>
                      ) : numero != null ? (
                        <span
                          aria-hidden="true"
                          className={cn(
                            'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                            enCamino ? 'bg-brand-action text-fg-on-brand' : 'bg-subtle text-fg-secondary',
                          )}
                        >
                          {numero}
                        </span>
                      ) : (
                        <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-subtle text-fg-muted">
                          —
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onAbrir(e);
                        }}
                        className="truncate text-left text-[15px] font-medium text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      >
                        {e.shipment_number}
                      </button>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <InsigniaEstadoApp estado={String(e.status)} />
                      {(e.failed_attempts ?? 0) > 0 && e.status !== 'delivered' && (
                        <span className="text-xs text-warning-text">{t('tarjeta.intento', { n: (e.failed_attempts ?? 0) + 1 })}</span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-fg-muted">{origen(e)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="line-clamp-2 text-[15px] text-fg">{e.delivery_address || t('sinDireccion')}</p>
                    <p className="truncate text-[13px] text-fg-secondary">{[e.delivery_city, e.barrio].filter(Boolean).join(' · ')}</p>
                  </td>
                  <td className="px-4 py-3">
                    {e.status === 'delivered' && e.delivered_at ? (
                      <p className="text-[13px] text-success-text">{t('escritorio.entregadoA', { hora: hora(e.delivered_at, zona) })}</p>
                    ) : reprogramado ? (
                      <p className="text-[13px] text-fg-muted">{t('escritorio.reprogramado', { fecha: fecha(e.expected_delivery_date) })}</p>
                    ) : e.promesa ? (
                      <ChipPromesa envio={e} zona={zona} ahora={ahora} />
                    ) : (
                      <span className="text-fg-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {Number(e.cod_amount) > 0 ? (
                      <div className="flex flex-col items-start gap-1">
                        <span className="text-[15px] font-medium text-fg">{moneda.formatear(Number(e.cod_amount))}</span>
                        {cobro > 0 ? (
                          <StatusBadge estado="pendiente" etiqueta={reprogramado ? t('escritorio.seCobraDespues') : t('escritorio.porCobrar')} tono="advertencia" apariencia="contorno" />
                        ) : (
                          <StatusBadge estado="cobrado" etiqueta={t('cobrado')} tono="exito" apariencia="contorno" />
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col">
                        <span className="text-fg-muted">—</span>
                        <span className="text-[13px] text-fg-muted">{t('pagado')}</span>
                      </div>
                    )}
                  </td>
                  {/* Las acciones no abren la fila. */}
                  <td className="px-4 py-3" onClick={(ev) => ev.stopPropagation()}>
                    <div className="flex flex-wrap items-center gap-2">{acciones(e)}</div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
