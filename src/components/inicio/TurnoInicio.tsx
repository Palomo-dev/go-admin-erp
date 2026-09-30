'use client';

/**
 * «Tu turno» (Figma «Inicio — Marcar turno», 631:21816; componente
 * `TurnoCard`, nota de comportamiento 631:385119). Aprobado por el dueño el
 * 2026-09-30.
 *
 * - `BotonTurno`: botón del encabezado del panel completo. Cambia con el
 *   estado: antes → secundario «Marcar entrada»; sin marcar → primario
 *   «Marcar entrada» + badge «N min tarde»; en turno → tinte «Marcar salida ·
 *   3 h 12 min»; cerrado → no se muestra. Sin contrato (dueño que no marca):
 *   no se dibuja (frame 10).
 * - `TurnoCard`: tarjeta del panel de empleado (frame 11) y de móvil, arriba
 *   del todo.
 *
 * Marcar NO se implementa aquí: los botones llevan al flujo existente de HRM
 * (`/marcar`, escáner QR → `QRAttendanceService`). El estado lo calcula el
 * servidor (`GET /api/inicio/turno`). Horas en la zona de la organización.
 */
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ScanLine } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { clasesBoton } from '@/components/kit/botonClases';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { partesDuracion } from '@/lib/dashboard/turno';
import type { TurnoInicio } from '@/lib/dashboard/inicio.server';
import { useLecturaInicio } from './useLecturaInicio';

export function useTurnoInicio(organizationId: number | null | undefined, version = 0) {
  const { estado } = useLecturaInicio<TurnoInicio>(organizationId ? '/api/inicio/turno' : null, organizationId, version);
  return estado.fase === 'listo' && estado.datos.visible ? estado.datos : null;
}

function useDuracion() {
  const t = useTranslations('home.turno');
  return (minutos: number) => {
    const d = partesDuracion(minutos);
    return d.horas > 0 ? t('duracion', { h: d.horas, m: d.minutos }) : t('duracionMin', { m: d.minutos });
  };
}

/** Botón del encabezado (escritorio, panel completo). */
export function BotonTurno({ turno }: { turno: TurnoInicio | null }) {
  const t = useTranslations('home.turno');
  const duracion = useDuracion();
  if (!turno || turno.estado === 'cerrado') return null;
  const icono = <ScanLine aria-hidden="true" className="size-4" strokeWidth={1.5} />;
  if (turno.estado === 'enTurno') {
    return (
      <Link href={turno.hrefMarcar} className={clasesBoton({ variante: 'tinte', tamano: 'sm' })} data-estado-turno="enTurno">
        {icono}
        {t('acciones.marcarSalidaTiempo', { duracion: duracion(turno.minutos) })}
      </Link>
    );
  }
  if (turno.estado === 'sinMarcar') {
    return (
      <span className="inline-flex items-center gap-2" data-estado-turno="sinMarcar">
        <Link href={turno.hrefMarcar} className={clasesBoton({ variante: 'primario', tamano: 'sm' })}>
          {icono}
          {t('acciones.marcarEntrada')}
        </Link>
        <StatusBadge estado="tarde" etiqueta={t('tarde', { min: turno.minutos })} tono="advertencia" apariencia="suave" />
      </span>
    );
  }
  return (
    <Link href={turno.hrefMarcar} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} data-estado-turno={turno.estado}>
      {icono}
      {turno.estado === 'antes' ? t('acciones.marcarEntrada') : t('acciones.marcarTurno')}
    </Link>
  );
}

/** Tarjeta «Tu turno» (panel de empleado y móvil). */
export function TurnoCard({ turno, compacta = false, className }: { turno: TurnoInicio; compacta?: boolean; className?: string }) {
  const t = useTranslations('home.turno');
  const { formatTime } = useFormatDate();
  const duracion = useDuracion();
  const sucursal = turno.sucursal ? ` · ${turno.sucursal}` : '';
  const hora = (v: string | null) => (v ? formatTime(v) : '');

  const badge =
    turno.estado === 'sinMarcar'
      ? { etiqueta: t('estados.sinMarcar', { min: turno.minutos }), tono: 'advertencia' as const }
      : turno.estado === 'enTurno'
        ? { etiqueta: t('estados.enTurno'), tono: 'exito' as const }
        : turno.estado === 'cerrado'
          ? { etiqueta: t('estados.cerrado'), tono: 'neutro' as const }
          : turno.estado === 'antes'
            ? { etiqueta: t('estados.antes'), tono: 'informacion' as const }
            : { etiqueta: t('estados.sinTurno'), tono: 'neutro' as const };

  const detalle =
    turno.estado === 'enTurno'
      ? t('detalle.enTurno', { hora: hora(turno.entradaMarcada), duracion: duracion(turno.minutos), fin: hora(turno.salidaProgramada) })
      : turno.estado === 'cerrado'
        ? t('detalle.cerrado', { entrada: hora(turno.entradaMarcada), salida: hora(turno.salidaMarcada), duracion: duracion(turno.minutos) })
        : turno.estado === 'sinTurno'
          ? t('detalle.sinTurno')
          : t('detalle.entrada', { hora: hora(turno.entradaProgramada), sucursal });

  const accion =
    turno.estado === 'cerrado'
      ? turno.hrefMarcaciones
        ? { etiqueta: t('acciones.verMarcaciones'), href: turno.hrefMarcaciones, variante: 'fantasma' as const }
        : null
      : turno.estado === 'enTurno'
        ? { etiqueta: t('acciones.marcarSalida'), href: turno.hrefMarcar, variante: 'tinte' as const }
        : turno.estado === 'sinTurno'
          ? { etiqueta: t('acciones.marcarTurno'), href: turno.hrefMarcar, variante: 'secundario' as const }
          : { etiqueta: t('acciones.marcarEntrada'), href: turno.hrefMarcar, variante: 'primario' as const };

  return (
    <section
      aria-labelledby="inicio-turno-titulo"
      data-estado-turno={turno.estado}
      className={cn(
        'flex gap-3 rounded-xl border border-line bg-surface p-4',
        compacta ? 'flex-col sm:flex-row sm:items-center' : 'flex-col',
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">
          <ScanLine className="size-5" strokeWidth={1.5} />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="inicio-turno-titulo" className="text-base font-semibold text-fg">
              {t('titulo')}
            </h2>
            <StatusBadge estado={turno.estado} etiqueta={badge.etiqueta} tono={badge.tono} apariencia="suave" />
          </div>
          <p className="text-sm leading-5 text-fg-secondary">{detalle}</p>
        </div>
      </div>
      {accion && (
        <Link
          href={accion.href}
          className={cn(clasesBoton({ variante: accion.variante, tamano: compacta ? 'sm' : 'md' }), !compacta && 'w-full justify-center')}
        >
          <ScanLine aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {accion.etiqueta}
        </Link>
      )}
    </section>
  );
}
