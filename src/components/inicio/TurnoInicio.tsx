'use client';

/**
 * «Tu turno» (Figma «Inicio — Marcar turno», 631:21816; componente
 * `TurnoCard`, nota de comportamiento 631:385119). Aprobado por el dueño el
 * 2026-09-30.
 *
 * - `BotonTurno`: botón del encabezado del panel completo. Cambia con el
 *   estado: antes → secundario «Marcar entrada»; sin marcar → primario
 *   «Marcar entrada» + badge «N min tarde»; en turno → tinte «Marcar salida ·
 *   3 h 12 min»; en descanso → tinte «Terminar descanso»; cerrado → no se
 *   muestra. Sin contrato (dueño que no marca):
 *   no se dibuja (frame 10).
 * - `TurnoCard`: tarjeta del panel de empleado (frame 11) y de móvil, arriba
 *   del todo. Variante «en descanso» (decisión 7, 2026-11-16; Figma 20.9.4):
 *   insignia ámbar «En descanso · 12 min», «Descanso desde 9:30 · 30 min no
 *   pagado» y «Terminar descanso».
 *
 * Marcación M0 (Figma 20.30.7 y 20.31.4): si la sede de la persona marca con
 * el QR o con la etiqueta NFC (`turno.metodo.especial`), el botón lo dice
 * («Escanear el QR de la sede», «Marcar salida con el QR», «Acercar a la
 * etiqueta NFC»), abre `/marcar?metodo=…` y, en móvil, una nota debajo explica
 * cómo se marca en esa sede. Sin método especial, todo queda como antes.
 *
 * Marcar NO se implementa aquí: los botones llevan a «Marcar turno»
 * (`/marcar`, que marca por `POST /api/hrm/marcacion`). El estado lo calcula el
 * servidor (`GET /api/inicio/turno`). Horas en la zona de la organización.
 */
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Nfc, ScanLine, ScanQrCode, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { clasesBoton } from '@/components/kit/botonClases';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { partesDuracion } from '@/lib/dashboard/turno';
import type { TurnoInicio } from '@/lib/dashboard/inicio.server';
import { useLecturaInicio } from './useLecturaInicio';
import { claveAccionMetodo, type MetodoEspecial } from '@/components/marcar/marcarMetodoLogica';

const ICONO_ESPECIAL: Record<MetodoEspecial, LucideIcon> = { qr: ScanQrCode, nfc: Nfc };

/** Icono y texto del botón según el método de la sede (`null` = los de hoy). */
function useAccionMetodo() {
  const t = useTranslations('home.turno');
  return (turno: TurnoInicio) => {
    const especial = turno.metodo?.especial ?? null;
    const clave = claveAccionMetodo(turno.estado, especial);
    return {
      Icono: especial && clave ? ICONO_ESPECIAL[especial] : ScanLine,
      etiqueta: clave ? t(`acciones.metodo.${clave}`) : null,
    };
  };
}

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
  const accionMetodo = useAccionMetodo();
  if (!turno || turno.estado === 'cerrado') return null;
  const { Icono, etiqueta: etiquetaMetodo } = accionMetodo(turno);
  const icono = <Icono aria-hidden="true" className="size-4" strokeWidth={1.5} />;
  if (turno.estado === 'enDescanso') {
    return (
      <Link href={turno.hrefMarcar} className={clasesBoton({ variante: 'tinte', tamano: 'sm' })} data-estado-turno="enDescanso">
        {icono}
        {t('acciones.terminarDescanso')}
      </Link>
    );
  }
  if (turno.estado === 'enTurno') {
    return (
      <Link href={turno.hrefMarcar} className={clasesBoton({ variante: 'tinte', tamano: 'sm' })} data-estado-turno="enTurno">
        {icono}
        {etiquetaMetodo ?? t('acciones.marcarSalidaTiempo', { duracion: duracion(turno.minutos) })}
      </Link>
    );
  }
  if (turno.estado === 'sinMarcar') {
    return (
      <span className="inline-flex items-center gap-2" data-estado-turno="sinMarcar">
        <Link href={turno.hrefMarcar} className={clasesBoton({ variante: 'primario', tamano: 'sm' })}>
          {icono}
          {etiquetaMetodo ?? t('acciones.marcarEntrada')}
        </Link>
        <StatusBadge estado="tarde" etiqueta={t('tarde', { min: turno.minutos })} tono="advertencia" apariencia="suave" />
      </span>
    );
  }
  return (
    <Link href={turno.hrefMarcar} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} data-estado-turno={turno.estado}>
      {icono}
      {etiquetaMetodo ?? (turno.estado === 'antes' ? t('acciones.marcarEntrada') : t('acciones.marcarTurno'))}
    </Link>
  );
}

/** Tarjeta «Tu turno» (panel de empleado y móvil). */
export function TurnoCard({ turno, compacta = false, className }: { turno: TurnoInicio; compacta?: boolean; className?: string }) {
  const t = useTranslations('home.turno');
  const { formatTime } = useFormatDate();
  const duracion = useDuracion();
  const accionMetodo = useAccionMetodo();
  const sucursal = turno.sucursal ? ` · ${turno.sucursal}` : '';
  const hora = (v: string | null) => (v ? formatTime(v) : '');

  const badge =
    turno.estado === 'sinMarcar'
      ? { etiqueta: t('estados.sinMarcar', { min: turno.minutos }), tono: 'advertencia' as const }
      : turno.estado === 'enTurno'
        ? { etiqueta: t('estados.enTurno'), tono: 'exito' as const }
        : turno.estado === 'enDescanso'
          ? { etiqueta: t('estados.enDescanso', { min: turno.minutos }), tono: 'advertencia' as const }
        : turno.estado === 'cerrado'
          ? { etiqueta: t('estados.cerrado'), tono: 'neutro' as const }
          : turno.estado === 'antes'
            ? { etiqueta: t('estados.antes'), tono: 'informacion' as const }
            : { etiqueta: t('estados.sinTurno'), tono: 'neutro' as const };

  const descanso = turno.descansoMin
    ? t(turno.descansoPagado ? 'detalle.descansoPagado' : 'detalle.descansoNoPagado', { min: turno.descansoMin })
    : null;
  const detalle =
    turno.estado === 'enDescanso'
      ? [t('detalle.enDescanso', { hora: hora(turno.descansoDesde ?? null) }), descanso].filter(Boolean).join(' · ')
      : turno.estado === 'enTurno'
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
        : turno.estado === 'enDescanso'
          ? { etiqueta: t('acciones.terminarDescanso'), href: turno.hrefMarcar, variante: 'tinte' as const }
        : turno.estado === 'sinTurno'
          ? { etiqueta: t('acciones.marcarTurno'), href: turno.hrefMarcar, variante: 'secundario' as const }
          : { etiqueta: t('acciones.marcarEntrada'), href: turno.hrefMarcar, variante: 'primario' as const };

  const { Icono, etiqueta: etiquetaMetodo } = accionMetodo(turno);
  const especial = turno.metodo?.especial ?? null;
  // Nota de 20.30.7: solo en móvil y solo mientras el botón abre el método de la sede.
  const nota =
    especial && etiquetaMetodo && turno.sucursal ? t(`notaMetodo.${especial}`, { sede: turno.sucursal }) : null;

  const tarjeta = (
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
          <Icono aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {etiquetaMetodo ?? accion.etiqueta}
        </Link>
      )}
    </section>
  );
  if (!nota) return tarjeta;
  return (
    <>
      {tarjeta}
      <p className={cn('text-sm leading-5 text-fg-secondary sm:hidden', className)} data-nota-metodo={especial}>
        {nota}
      </p>
    </>
  );
}
