'use client';

/**
 * Tarjeta de una parada (Figma Envío/TarjetaParada, 3231-16580): número de parada, guía, estado,
 * dirección grande, municipio · barrio · cliente, promesa con el tiempo que falta, cobro y
 * llamar / cómo llegar. Una sola pieza para la lista del celular, «Entrega confirmada» (siguiente
 * parada), el mapa de la ruta y la vista del supervisor (que cambia llamar / cómo llegar por
 * Reasignar / Novedad con `acciones`).
 *
 * Ventana horaria: la base no guarda una franja «11:00 – 11:30» por envío; se muestra la hora
 * prometida del pedido de la tienda (`web_orders.estimated_delivery_at`), como hasta hoy.
 */
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { EnvioApp } from '@/lib/services/logistica/misEnviosService';
import { BotonesRapidos, ChipCobro, ChipPromesa, InsigniaEstadoApp, enlacesDe } from './piezas';

export interface TarjetaParadaProps {
  envio: EnvioApp;
  /** Número de parada en la ruta del día (null en entregados y novedades: va el ✓ o nada). */
  numero: number | null;
  zona: string;
  ahora: Date;
  /** Tocar la tarjeta abre la parada (sin esto la tarjeta no es un enlace). */
  onAbrir?: () => void;
  /** Acciones propias (supervisor: Reasignar · Novedad) en lugar de llamar / cómo llegar. */
  acciones?: ReactNode;
  /** `li` en las listas; `div` suelta (siguiente parada, hoja del mapa). */
  como?: 'li' | 'div';
}

export function TarjetaParada({ envio, numero, zona, ahora, onAbrir, acciones, como = 'li' }: TarjetaParadaProps) {
  const t = useTranslations('logistica.misEnvios');
  const nombre = envio.delivery_contact_name || envio.customer?.full_name || t('cliente');
  const enlaces = enlacesDe(envio);
  const destacada = envio.status === 'out_for_delivery';
  const entregado = envio.status === 'delivered';
  const intento = (envio.failed_attempts ?? 0) > 0 && !entregado ? (envio.failed_attempts ?? 0) + 1 : null;
  const Contenedor = como;

  const cuerpo = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          {entregado ? (
            <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-success-subtle text-success-text">
              <Check className="size-4" strokeWidth={2} />
            </span>
          ) : numero != null ? (
            <span
              aria-hidden="true"
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold',
                destacada ? 'bg-brand-action text-fg-on-brand' : 'bg-subtle text-fg-secondary',
              )}
            >
              {numero}
            </span>
          ) : null}
          <span className="truncate text-[15px] font-medium text-fg">{envio.shipment_number}</span>
        </span>
        <InsigniaEstadoApp estado={String(envio.status)} />
      </div>
      <p className="text-lg font-semibold leading-snug text-fg">{envio.delivery_address || t('sinDireccion')}</p>
      <p className="text-sm text-fg-secondary">{[envio.delivery_city, envio.barrio, nombre].filter(Boolean).join(' · ')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <ChipPromesa envio={envio} zona={zona} ahora={ahora} />
        {intento && (
          <span className="inline-flex items-center rounded-full bg-warning-subtle px-2 py-0.5 text-xs font-medium text-warning-text">{t('tarjeta.intento', { n: intento })}</span>
        )}
      </div>
      {acciones ? (
        <>
          <div className="flex items-center gap-2">
            <ChipCobro envio={envio} />
          </div>
          <div className="grid grid-cols-2 gap-2" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            {acciones}
          </div>
        </>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <ChipCobro envio={envio} />
          <BotonesRapidos enlaces={enlaces} nombre={nombre} />
        </div>
      )}
    </>
  );

  const clases = cn(
    'flex flex-col gap-2 rounded-xl border bg-surface p-4',
    destacada ? 'border-line-brand shadow-sm' : 'border-line',
    entregado && 'bg-subtle',
  );

  return (
    <Contenedor>
      {onAbrir ? (
        <div
          role="link"
          tabIndex={0}
          onClick={onAbrir}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onAbrir();
            }
          }}
          aria-label={t('tarjeta.abrir', { numero: envio.shipment_number, nombre })}
          className={cn(clases, 'cursor-pointer hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand')}
        >
          {cuerpo}
        </div>
      ) : (
        <div className={clases}>{cuerpo}</div>
      )}
    </Contenedor>
  );
}
