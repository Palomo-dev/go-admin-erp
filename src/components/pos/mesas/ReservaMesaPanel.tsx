'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { CalendarClock, UtensilsCrossed, ArrowLeftRight, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge, FilaDato, ListaDatos } from '@/components/kit';
import { HojaDetalle } from '@/components/kit/HojaDetalle';
import { horaDeReserva, type ReservaActivaMesa } from './reservasProximas';
import type { TableWithSession } from './types';

interface ReservaMesaPanelProps {
  mesa: TableWithSession | null;
  activa: ReservaActivaMesa | undefined;
  onAbiertoChange: (abierto: boolean) => void;
  onSentar: () => void;
  onCambiarMesa: () => void;
  onNoSePresento: () => void;
  /** Una acción en curso: bloquea botones y cierre. */
  ocupado?: boolean;
}

/**
 * Panel resumen de una mesa reservada (storyboard de reserva, paso 6:
 * Figma 1809:907677; móvil 1831:20). Panel lateral en escritorio y hoja
 * inferior en móvil (`HojaDetalle`). No hay pantalla nueva: las acciones
 * reutilizan el flujo de siempre (abrir sesión de mesa, cambiar estado de
 * la reserva) desde la página de Mesas.
 */
export function ReservaMesaPanel({
  mesa,
  activa,
  onAbiertoChange,
  onSentar,
  onCambiarMesa,
  onNoSePresento,
  ocupado = false,
}: ReservaMesaPanelProps) {
  const t = useTranslations('posMesas');
  const abierto = !!mesa && !!activa;
  const reserva = activa?.reserva;

  const titulo = mesa ? (mesa.zone ? `${mesa.name} · ${mesa.zone}` : mesa.name) : '';
  const fuente = reserva ? t(`reserva.fuentes.${reserva.source}`) : '';

  const llegada = activa
    ? activa.minutosParaInicio > 0
      ? t('reserva.llegaEn', { m: activa.minutosParaInicio })
      : activa.minutosParaInicio < 0
        ? t('reserva.tarde', { m: -activa.minutosParaInicio })
        : t('reserva.ahora')
    : '';

  return (
    <HojaDetalle
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={titulo}
      ocupado={ocupado}
      insignia={
        <StatusBadge estado="reserved" etiqueta={t('estadosCorto.reserved')} tono="informacion" icono={CalendarClock} tamano="sm" />
      }
      subtitulo={reserva ? t('reserva.subtitulo', { fuente }) : undefined}
      pie={
        <>
          {/* flex-col-reverse en móvil: el primario queda arriba, «No se presentó» abajo (1831:20) */}
          <Button variant="ghost" className="h-10 gap-2" onClick={onNoSePresento} disabled={ocupado}>
            <UserX aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('reserva.noShow')}
          </Button>
          <Button variant="outline" className="h-10 gap-2" onClick={onCambiarMesa} disabled={ocupado}>
            <ArrowLeftRight aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('reserva.cambiarMesa')}
          </Button>
          <Button className="h-10 gap-2" onClick={onSentar} disabled={ocupado}>
            <UtensilsCrossed aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('reserva.sentar')}
          </Button>
        </>
      }
    >
      {reserva && activa && (
        <ListaDatos etiqueta={t('reserva.detalle')}>
          <FilaDato etiqueta={t('reserva.cliente')} valor={reserva.customer_name} />
          <FilaDato etiqueta={t('reserva.personas')} valor={t('reserva.personasValor', { n: reserva.party_size })} />
          <FilaDato
            etiqueta={t('reserva.hora')}
            valor={t('reserva.horaValor', { hora: horaDeReserva(activa), min: reserva.duration_minutes ?? 90 })}
            descripcion={llegada}
            tono={activa.minutosParaInicio < 0 ? 'advertencia' : 'neutro'}
          />
          {reserva.customer_phone && <FilaDato etiqueta={t('reserva.telefono')} valor={reserva.customer_phone} />}
          {reserva.notes && <FilaDato etiqueta={t('reserva.nota')} valor={reserva.notes} />}
          {reserva.special_requests && <FilaDato etiqueta={t('reserva.solicitudes')} valor={reserva.special_requests} />}
        </ListaDatos>
      )}
    </HojaDetalle>
  );
}
