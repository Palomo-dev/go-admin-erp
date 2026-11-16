'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { clasesBoton } from '@/components/kit/botonClases';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import type { EventoPrivadoLead } from '@/lib/crm/eventoPrivadoLead';

/**
 * Tarjeta «EVENTO PRIVADO» del detalle rápido del lead (Figma 1951:941568):
 * sede, tipo, fecha, invitados, presupuesto por persona y mensaje de la última
 * solicitud del formulario «Eventos privados» del sitio, y el botón «Crear
 * reserva de grupo en <sede>».
 *
 * Estados: sin evento la tarjeta no se pinta (lo decide quien la usa); sin sede,
 * «Sin sede elegida» y sin botón; la sede se resuelve en el servidor, así que
 * mientras carga se ve un marcador y, si falla, el aviso en su fila.
 */
export interface EventoPrivadoTarjetaProps {
  evento: EventoPrivadoLead;
  /** Nombre de la sede (null: sin sede o aún sin resolver). */
  sede: string | null;
  estadoSede: 'cargando' | 'listo' | 'error';
  /** Formatea el presupuesto numérico en la moneda de la organización. */
  formatearMonto: (valor: number) => string;
  /** Sin función, no hay botón (sin sede o sin acceso a Reservas de mesas). */
  onCrearReserva?: () => void;
}

/** «sábado, 24 de octubre de 2026» → «Sábado 24 de octubre de 2026» (Figma). */
export function fechaEvento(fecha: string): string {
  const t = formatPlainDate(fecha, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(',', '');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

export function EventoPrivadoTarjeta({ evento, sede, estadoSede, formatearMonto, onCrearReserva }: EventoPrivadoTarjetaProps) {
  const t = useTranslations('crm.pantallaLeads.detalle.evento');
  const presupuesto = evento.presupuestoTexto ?? (evento.presupuestoNumero != null ? formatearMonto(evento.presupuestoNumero) : null);
  const valorSede =
    evento.branchId == null ? (
      <span className="text-fg-muted">{t('sinSede')}</span>
    ) : estadoSede === 'cargando' ? (
      <span aria-busy="true" aria-label={t('cargandoSede')} className="inline-block h-4 w-24 animate-pulse rounded bg-hover align-middle" />
    ) : sede ? (
      sede
    ) : (
      <span className="text-fg-muted">{estadoSede === 'error' ? t('sedeError') : t('sedeNoDisponible')}</span>
    );
  const filas: { clave: string; etiqueta: string; valor: ReactNode }[] = [
    { clave: 'sede', etiqueta: t('sede'), valor: valorSede },
    ...(evento.tipo ? [{ clave: 'tipo', etiqueta: t('tipo'), valor: evento.tipo }] : []),
    ...(evento.fecha ? [{ clave: 'fecha', etiqueta: t('fecha'), valor: fechaEvento(evento.fecha) }] : []),
    ...(evento.invitados ? [{ clave: 'invitados', etiqueta: t('invitados'), valor: String(evento.invitados) }] : []),
    ...(evento.lugar ? [{ clave: 'lugar', etiqueta: t('lugar'), valor: evento.lugar }] : []),
    ...(presupuesto ? [{ clave: 'presupuesto', etiqueta: t('presupuesto'), valor: presupuesto }] : []),
    ...(evento.mensaje ? [{ clave: 'mensaje', etiqueta: t('mensaje'), valor: <span className="whitespace-pre-line break-words">{evento.mensaje}</span> }] : []),
  ];

  return (
    <section aria-labelledby="lead-evento-privado" className="flex flex-col gap-2 rounded-xl border border-line bg-subtle p-3">
      <h3 id="lead-evento-privado" className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
        {t('titulo')}
      </h3>
      <dl className="flex flex-col gap-1.5">
        {filas.map((f) => (
          <div key={f.clave} className="grid grid-cols-[120px_1fr] gap-2 text-[13px]">
            <dt className="text-fg-muted">{f.etiqueta}</dt>
            <dd className="min-w-0 text-fg">{f.valor}</dd>
          </div>
        ))}
      </dl>
      {onCrearReserva && sede && (
        <button type="button" onClick={onCrearReserva} className={clasesBoton({ variante: 'secundario', tamano: 'sm', className: 'mt-1 self-start' })}>
          {t('crearReserva', { sede })}
        </button>
      )}
    </section>
  );
}
