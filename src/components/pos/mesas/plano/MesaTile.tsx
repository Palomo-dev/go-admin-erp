'use client';

import { forwardRef, type ButtonHTMLAttributes, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { Bell, CalendarClock, Check, CircleCheck, ConciergeBell, Receipt, Sparkles, TriangleAlert, Users, type LucideIcon } from 'lucide-react';
import { AvatarIniciales } from '@/components/kit';
import { cn } from '@/utils/Utils';
import { textoDuracion } from '../cuenta/cuentaMesaLogica';
import type { ResumenSolicitudesMesa } from '../solicitudes/solicitudesMesaLogica';
import { useTextosCartaQr } from '../solicitudes/textosCartaQr';
import { CLASES_ESTADO, nombreCorto, tamanoEnPlanoBase, type EstadoMesaPlano, type VistaMesaPlano } from './estadoMesaPlano';

/**
 * La mesa en sus tres densidades (Figma `MesaCard` 868:31742 y `MesaPlano`
 * 680:410764; `MesaTile` 448:207968):
 * - `compacta`: número y una línea (personas, minutos, importe, hora de la
 *   reserva o «Limpiar»). Cuadrícula compacta, móvil y destino de «Mover».
 * - `comoda`: «Mesa 19» con su estado, comensales y tiempo, importe y mesero.
 * - `plano`: la forma de la mesa en el plano (cuadrada, redonda, larga, barra).
 * Encima: campana (plato listo) y triángulo (abierta sin movimiento). Una
 * solicitud de la Carta QR («Llamar al mesero», «Pedir la cuenta») gana a los
 * dos: insignia ámbar que late mientras nadie dijo «Voy».
 */
export type DensidadMesa = 'compacta' | 'comoda' | 'plano';

const ICONO_ESTADO: Record<EstadoMesaPlano, LucideIcon> = {
  libre: CircleCheck,
  ocupada: Users,
  por_cobrar: Receipt,
  reservada: CalendarClock,
  por_limpiar: Sparkles,
};

export interface MesaTileProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  vista: VistaMesaPlano;
  densidad: DensidadMesa;
  formatear: (valor: number) => string;
  seleccionada?: boolean;
  /** Plano: tamaño en px ya escalado (lo calcula el plano). */
  estiloPlano?: CSSProperties;
  /** Solicitudes pendientes de la Carta QR sobre esta mesa. */
  solicitud?: ResumenSolicitudesMesa | null;
}

/** Línea corta del estado («8 min», «2 pers.», «$ 161.100», «20:30», «Limpiar»). */
export function useLineaEstado() {
  const t = useTranslations('posMesasPlano.mesa');
  return (v: VistaMesaPlano, formatear: (n: number) => string, larga = false): string => {
    switch (v.estado) {
      case 'libre':
        return t('personas', { n: v.capacidad });
      case 'reservada':
        return v.reservaHora ?? t('reservada');
      case 'por_limpiar':
        return larga ? t('porLimpiar') : t('limpiar');
      case 'por_cobrar':
        return larga ? t('comensalesTiempo', { n: v.comensales, cap: v.capacidad, tiempo: textoDuracion(v.minutos) }) : formatear(v.importe);
      default:
        return larga ? t('comensalesTiempo', { n: v.comensales, cap: v.capacidad, tiempo: textoDuracion(v.minutos) }) : textoDuracion(v.minutos);
    }
  };
}

function AvisoSolicitud({ vista, solicitud, plano }: { vista: VistaMesaPlano; solicitud: ResumenSolicitudesMesa; plano?: boolean }) {
  const t = useTextosCartaQr();
  const Icono = solicitud.cuenta ? Receipt : ConciergeBell;
  const n = solicitud.mesero + (solicitud.cuenta ? 1 : 0);
  return (
    <span
      role="img"
      aria-label={t('solicitudes.etiquetaAviso', { mesa: vista.nombre, n })}
      className={cn(
        'flex size-5 items-center justify-center rounded-full bg-warning text-white ring-2 ring-surface',
        plano && 'absolute -left-2 -top-2',
        solicitud.sinVer && 'motion-safe:animate-pulse',
      )}
    >
      <Icono aria-hidden="true" className="size-3" strokeWidth={2} />
    </span>
  );
}

function Aviso({ vista, plano, solicitud }: { vista: VistaMesaPlano; plano?: boolean; solicitud?: ResumenSolicitudesMesa | null }) {
  const t = useTranslations('posMesasPlano.mesa');
  if (solicitud) return <AvisoSolicitud vista={vista} solicitud={solicitud} plano={plano} />;
  if (vista.abandonada && vista.estado !== 'libre' && vista.estado !== 'reservada') {
    return plano ? null : <TriangleAlert aria-label={t('abandonada')} className="size-4 text-danger-text" strokeWidth={1.5} />;
  }
  if (vista.platosListos > 0) {
    return plano ? (
      <span aria-label={t('platoListo', { n: vista.platosListos })} className="absolute -right-2 -top-2 flex size-5 items-center justify-center rounded-full bg-success text-white ring-2 ring-surface">
        <Bell aria-hidden="true" className="size-3" strokeWidth={2} />
      </span>
    ) : (
      <Bell aria-label={t('platoListo', { n: vista.platosListos })} className="size-4 text-brand" strokeWidth={1.5} />
    );
  }
  return null;
}

export const MesaTile = forwardRef<HTMLButtonElement, MesaTileProps>(function MesaTile(
  { vista, densidad, formatear, seleccionada, estiloPlano, solicitud, className, ...props },
  ref,
) {
  const t = useTranslations('posMesasPlano.mesa');
  const linea = useLineaEstado();
  const clases = CLASES_ESTADO[vista.estado];
  const Icono = ICONO_ESTADO[vista.estado];
  const etiqueta = t('etiqueta', { mesa: vista.nombre, estado: t(`estados.${vista.estado}`) });

  if (densidad === 'compacta') {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={etiqueta}
        aria-pressed={seleccionada}
        {...props}
        className={cn(
          'relative flex h-[72px] min-w-0 flex-col justify-between rounded-lg border p-3 text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
          clases.caja,
          seleccionada && 'ring-2 ring-brand ring-offset-2 ring-offset-canvas',
          className,
        )}
      >
        <span className="flex items-start justify-between gap-1">
          <span className="truncate text-lg font-semibold leading-6 text-fg">{vista.numero}</span>
          <Aviso vista={vista} solicitud={solicitud} />
        </span>
        <span className={cn('flex min-w-0 items-center gap-1 text-[13px] leading-4 tabular-nums', clases.texto)}>
          <Icono aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.5} />
          <span className="truncate">{linea(vista, formatear)}</span>
        </span>
      </button>
    );
  }

  if (densidad === 'comoda') {
    const ocupada = vista.estado === 'ocupada' || vista.estado === 'por_cobrar';
    return (
      <button
        ref={ref}
        type="button"
        aria-label={etiqueta}
        aria-pressed={seleccionada}
        {...props}
        className={cn(
          'relative flex min-h-[136px] min-w-0 flex-col gap-1.5 rounded-xl border p-3 text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
          clases.caja,
          seleccionada && 'ring-2 ring-brand ring-offset-2 ring-offset-canvas',
          className,
        )}
      >
        <span className="flex items-center justify-between gap-1.5">
          <span className="min-w-0 truncate text-[17px] font-semibold leading-6 text-fg">{vista.nombre}</span>
          <span className={cn('inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border bg-surface px-1.5 text-[11px] font-semibold', clases.borde, clases.texto)}>
            {vista.estado === 'ocupada' && <span aria-hidden="true" className="size-1.5 rounded-full bg-brand" />}
            {t(`estados.${vista.estado}`)}
          </span>
        </span>
        <span className="flex items-center gap-1 text-[13px] text-fg-secondary tabular-nums">
          <Icono aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.5} />
          {ocupada ? t('comensalesTiempo', { n: vista.comensales, cap: vista.capacidad, tiempo: textoDuracion(vista.minutos) }) : linea(vista, formatear, true)}
        </span>
        {ocupada && <span className="text-base font-medium tabular-nums text-fg">{formatear(vista.importe)}</span>}
        {vista.reservaNombre && <span className="truncate text-[13px] text-fg-secondary">{vista.reservaNombre}</span>}
        <span className="mt-auto flex items-center gap-2">
          {vista.mesero && ocupada && (
            <>
              <AvatarIniciales nombre={vista.mesero} tamano="sm" />
              <span className="truncate text-[13px] text-fg-secondary">{nombreCorto(vista.mesero)}</span>
            </>
          )}
          <span className="ml-auto">
            <Aviso vista={vista} solicitud={solicitud} />
          </span>
        </span>
      </button>
    );
  }

  // Plano (la libre lleva un visto, no el círculo: 870:103527)
  const redonda = vista.forma === 'redonda';
  const IconoPlano = vista.estado === 'libre' ? Check : Icono;
  return (
    <button
      ref={ref}
      type="button"
      aria-label={etiqueta}
      aria-pressed={seleccionada}
      {...props}
      style={estiloPlano}
      className={cn(
        'absolute flex flex-col items-center justify-center gap-0.5 border-2 px-2 text-center transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        redonda ? 'rounded-full' : 'rounded-xl',
        clases.caja,
        vista.estado === 'por_limpiar' && 'border-2',
        seleccionada && 'outline outline-2 outline-offset-4 outline-brand',
        className,
      )}
    >
      <span className="flex items-center gap-1">
        <IconoPlano aria-hidden="true" className={cn('size-4 shrink-0', clases.texto)} strokeWidth={1.5} />
        <span className="whitespace-nowrap text-[15px] font-semibold leading-5 text-fg">{vista.nombre}</span>
      </span>
      <span className="whitespace-nowrap text-[11px] leading-4 text-fg-secondary tabular-nums">
        {vista.estado === 'ocupada' || vista.estado === 'por_cobrar'
          ? t('comensalesTiempoCorto', { n: vista.comensales, cap: vista.capacidad, tiempo: textoDuracion(vista.minutos) })
          : linea(vista, formatear, true)}
      </span>
      {(vista.estado === 'ocupada' || vista.estado === 'por_cobrar') && (
        <span className="text-xs font-semibold tabular-nums text-fg">{formatear(vista.importe)}</span>
      )}
      <Aviso vista={vista} plano solicitud={solicitud} />
    </button>
  );
});

/** Tamaño de la mesa en el plano (px a escala 1). */
export const tamanoEnPlano = tamanoEnPlanoBase;
