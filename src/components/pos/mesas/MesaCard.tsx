'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Users, Clock, DollarSign, ChefHat, AlertTriangle, CircleCheck, Receipt, CalendarClock } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge, type TonoBadge } from '@/components/kit';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { cn } from '@/utils/Utils';
import type { TableWithSession } from './types';
import { estadoVisualMesa, horaDeReserva, type EstadoVisualMesa, type ReservaActivaMesa } from './reservasProximas';

interface MesaCardProps {
  mesa: TableWithSession;
  onClick?: () => void;
  isSelected?: boolean;
  /** Reserva confirmada que aparta la mesa ahora (ventana de 60 min). */
  reserva?: ReservaActivaMesa;
}

type EstadoMesa = EstadoVisualMesa;

/**
 * Tono por estado de mesa (POS-MESAS-VISTAS §3.4). Interino: `estadoTono` del
 * kit aún no conoce `free/occupied/reserved/bill_requested`, así que se pasa
 * el tono explícito hasta que se añadan a su tabla.
 */
const APARIENCIA_ESTADO: Record<EstadoMesa, { tono: TonoBadge; icono: LucideIcon; tarjeta: string }> = {
  free: { tono: 'exito', icono: CircleCheck, tarjeta: 'border-line-success bg-success-subtle' },
  occupied: { tono: 'peligro', icono: Users, tarjeta: 'border-line-danger bg-danger-subtle' },
  reserved: { tono: 'informacion', icono: CalendarClock, tarjeta: 'border-line-info bg-info-subtle' },
  bill_requested: { tono: 'advertencia', icono: Receipt, tarjeta: 'border-line-warning bg-warning-subtle' },
};

export function MesaCard({ mesa, onClick, isSelected = false, reserva }: MesaCardProps) {
  const t = useTranslations('posMesas');
  const { formatear } = useMonedaOrganizacion();

  // Estado visual: cuenta solicitada > ocupada > reservada (reserva en ventana) > libre.
  const estado: EstadoMesa = estadoVisualMesa(mesa, reserva);
  const reservaVisible = estado === 'reserved' ? reserva : undefined;
  const apariencia = APARIENCIA_ESTADO[estado];

  // Minutos transcurridos desde que se abrió la sesión
  const minutosAbierta = mesa.session?.opened_at
    ? Math.floor((Date.now() - new Date(mesa.session.opened_at).getTime()) / 60000)
    : null;

  // Calcular tiempo de sesión
  const getTiempoSesion = () => {
    if (minutosAbierta === null) return null;
    if (minutosAbierta < 60) return t('tiempo.minutos', { m: minutosAbierta });
    return t('tiempo.horasMinutos', { h: Math.floor(minutosAbierta / 60), m: minutosAbierta % 60 });
  };

  // Mesa "olvidada": lleva mucho tiempo abierta sin solicitar la cuenta
  const MINUTOS_MESA_OLVIDADA = 45;
  const esMesaOlvidada =
    minutosAbierta !== null &&
    minutosAbierta >= MINUTOS_MESA_OLVIDADA &&
    mesa.session?.status !== 'bill_requested';

  const pendientesCocina = mesa.session?.pendingKitchenItems || 0;

  return (
    <Card
      className={cn(
        'relative min-h-32 cursor-pointer border-2 p-4 transition-shadow hover:shadow-lg',
        apariencia.tarjeta,
        isSelected && 'ring-2 ring-brand ring-offset-2',
        esMesaOlvidada && 'ring-2 ring-line-danger'
      )}
      onClick={onClick}
    >
      {/* Estado */}
      <div className="absolute right-2 top-2">
        <StatusBadge
          estado={estado}
          etiqueta={t(`estadosCorto.${estado}`)}
          tono={apariencia.tono}
          icono={apariencia.icono}
          tamano="sm"
        />
      </div>

      {/* Nombre de Mesa */}
      <div className="mb-2">
        <h3 className="text-lg font-bold text-fg">{mesa.name}</h3>
        {mesa.zone && <p className="text-xs text-fg-secondary">{mesa.zone}</p>}
      </div>

      {/* Información adicional */}
      <div className="space-y-1">
        {reservaVisible ? (
          <>
            {/* Reserva: «20:30 · 6 pers.» y a nombre de quién (Figma 868:31742) */}
            <div className="flex items-center gap-1 text-xs text-fg-secondary">
              <CalendarClock aria-hidden="true" className="h-3 w-3" />
              <span className="tabular-nums">
                {t('tarjeta.reserva', { hora: horaDeReserva(reservaVisible), n: reservaVisible.reserva.party_size })}
              </span>
            </div>
            <p className="truncate text-sm font-medium text-fg">
              {t('tarjeta.reservaDe', { nombre: reservaVisible.reserva.customer_name })}
            </p>
          </>
        ) : (
          /* Capacidad */
          <div className="flex items-center gap-1 text-xs text-fg-secondary">
            <Users aria-hidden="true" className="h-3 w-3" />
            <span>{t('tarjeta.personas', { n: mesa.session?.customers || 0, capacidad: mesa.capacity })}</span>
          </div>
        )}

        {/* Tiempo de sesión */}
        {mesa.session && (
          <div className={cn('flex items-center gap-1 text-xs', esMesaOlvidada ? 'font-semibold text-danger-text' : 'text-fg-secondary')}>
            <Clock aria-hidden="true" className="h-3 w-3" />
            <span>{getTiempoSesion()}</span>
            {esMesaOlvidada && <AlertTriangle aria-hidden="true" className="h-3 w-3" />}
          </div>
        )}

        {/* Total (si existe) */}
        {mesa.totalAmount ? (
          <div className="flex items-center gap-1 text-xs font-semibold text-fg">
            <DollarSign aria-hidden="true" className="h-3 w-3" />
            <span className="tabular-nums">{formatear(mesa.totalAmount)}</span>
          </div>
        ) : null}

        {/* Items pendientes en cocina */}
        {pendientesCocina > 0 && (
          <Badge tono="advertencia" apariencia="suave" tamano="sm" icono={ChefHat}>
            {t('tarjeta.enCocina', { n: pendientesCocina })}
          </Badge>
        )}
      </div>

      {/* Aviso de mesa olvidada */}
      {esMesaOlvidada && (
        <div className="absolute -left-2 -top-2">
          <Badge tono="peligro" apariencia="solido" tamano="sm" icono={AlertTriangle}>
            {t('tarjeta.revisar')}
          </Badge>
        </div>
      )}
    </Card>
  );
}
