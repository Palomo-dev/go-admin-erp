'use client';

import React from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Users, LogIn, LogOut, BedDouble, DollarSign, Calendar } from 'lucide-react';
import type { TapeChartReservation } from '@/lib/services/tapeChartService';

interface ReservationHoverCardProps {
  reservation: TapeChartReservation;
  onCheckin?: (id: string) => void;
  onCheckout?: (id: string) => void;
  anchorRect: DOMRect;
  onHide: () => void;
  onHoverEnter?: () => void;
  onHoverLeave?: () => void;
}

const statusLabels: Record<string, string> = {
  confirmed: 'Confirmada',
  tentative: 'Tentativa',
  checked_in: 'Check-in realizado',
  checked_out: 'Check-out realizado',
  cancelled: 'Cancelada',
  no_show: 'No show',
};

const statusBadgeColors: Record<string, string> = {
  confirmed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  tentative: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  checked_in: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  checked_out: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  no_show: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

export function ReservationHoverCard({
  reservation,
  onCheckin,
  onCheckout,
  anchorRect,
  onHide,
  onHoverEnter,
  onHoverLeave,
}: ReservationHoverCardProps) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return format(date, "dd 'de' MMM, yyyy", { locale: es });
  };

  const nights = Math.ceil(
    (new Date(reservation.checkout + 'T00:00:00').getTime() - new Date(reservation.checkin + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24)
  );

  const canCheckin = reservation.status === 'confirmed' || reservation.status === 'tentative';
  const canCheckout = reservation.status === 'checked_in';

  const top = anchorRect.bottom + 4;
  const left = Math.min(anchorRect.left, window.innerWidth - 300);

  return (
    <div
      className="fixed z-[9999] pointer-events-auto"
      style={{ top, left }}
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
    >
      <div className="w-72 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl overflow-hidden">
        {/* Header con color de la reserva */}
        <div className="px-4 py-3" style={{ backgroundColor: reservation.color }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-semibold text-sm truncate">
                {reservation.customerName}
              </p>
              <p className="text-white/80 text-xs">{reservation.code}</p>
            </div>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusBadgeColors[reservation.status] || 'bg-gray-100 text-gray-600'}`}>
              {statusLabels[reservation.status] || reservation.status}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-2.5">
          {/* Habitacion */}
          {reservation.spaceLabel && (
            <div className="flex items-center gap-2 text-sm">
              <BedDouble className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="text-gray-500 dark:text-gray-400">Habitación:</span>
              <span className="font-medium text-gray-900 dark:text-white">{reservation.spaceLabel}</span>
            </div>
          )}

          {/* Check-in */}
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="text-gray-500 dark:text-gray-400">Check-in:</span>
            <span className="font-medium text-gray-900 dark:text-white">{formatDate(reservation.checkin)}</span>
          </div>

          {/* Check-out */}
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="text-gray-500 dark:text-gray-400">Check-out:</span>
            <span className="font-medium text-gray-900 dark:text-white">{formatDate(reservation.checkout)}</span>
          </div>

          {/* Noches */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-400 text-xs">─</span>
            <span className="text-gray-500 dark:text-gray-400">{nights} noche(s)</span>
          </div>

          {/* Huespedes */}
          <div className="flex items-center gap-2 text-sm">
            <Users className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="text-gray-500 dark:text-gray-400">Huéspedes:</span>
            <span className="font-medium text-gray-900 dark:text-white">{reservation.occupantCount}</span>
          </div>

          {/* Tarifa */}
          {reservation.totalEstimated > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <DollarSign className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="text-gray-500 dark:text-gray-400">Tarifa:</span>
              <span className="font-medium text-gray-900 dark:text-white">
                ${reservation.totalEstimated.toLocaleString('es-CO')}
              </span>
            </div>
          )}
        </div>

        {/* Botones */}
        {(canCheckin || canCheckout) && (
          <div className="px-4 pb-3 flex gap-2">
            {canCheckin && (
              <button
                onClick={() => {
                  onCheckin?.(reservation.id);
                  onHide();
                }}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" />
                Check-in
              </button>
            )}
            {canCheckout && (
              <button
                onClick={() => {
                  onCheckout?.(reservation.id);
                  onHide();
                }}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                Check-out
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
