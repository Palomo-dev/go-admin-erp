'use client';

import React from 'react';
import { Users, Clock, DollarSign, ChefHat, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/Utils';
import type { TableWithSession } from './types';

interface MesaCardProps {
  mesa: TableWithSession;
  onClick?: () => void;
  isSelected?: boolean;
}

export function MesaCard({ mesa, onClick, isSelected = false }: MesaCardProps) {
  // Determinar estado visual
  const getEstadoBadge = () => {
    if (mesa.session) {
      if (mesa.session.status === 'bill_requested') {
        return { label: 'Cuenta', variant: 'warning' as const, icon: '⏳' };
      }
      return { label: 'Ocupada', variant: 'destructive' as const, icon: '🔴' };
    }
    if (mesa.state === 'reserved') {
      return { label: 'Reservada', variant: 'secondary' as const, icon: '🟡' };
    }
    return { label: 'Libre', variant: 'default' as const, icon: '🟢' };
  };

  const estado = getEstadoBadge();

  // Minutos transcurridos desde que se abrió la sesión
  const minutosAbierta = mesa.session?.opened_at
    ? Math.floor((Date.now() - new Date(mesa.session.opened_at).getTime()) / 60000)
    : null;

  // Calcular tiempo de sesión
  const getTiempoSesion = () => {
    if (minutosAbierta === null) return null;
    if (minutosAbierta < 60) return `${minutosAbierta} min`;
    const horas = Math.floor(minutosAbierta / 60);
    const minutos = minutosAbierta % 60;
    return `${horas}h ${minutos}m`;
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
        'relative cursor-pointer transition-all hover:shadow-lg',
        'border-2 p-4 min-h-32',
        isSelected && 'ring-2 ring-blue-500 ring-offset-2',
        mesa.state === 'free' && 'border-green-500 bg-green-50 dark:bg-green-950/20',
        mesa.state === 'occupied' && 'border-red-500 bg-red-50 dark:bg-red-950/20',
        mesa.state === 'reserved' && 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20',
        mesa.session?.status === 'bill_requested' && 'border-orange-500 bg-orange-50 dark:bg-orange-950/20',
        esMesaOlvidada && 'ring-2 ring-red-400 dark:ring-red-600'
      )}
      onClick={onClick}
    >
      {/* Estado Badge */}
      <div className="absolute top-2 right-2">
        <Badge variant={estado.variant} className="text-xs">
          {estado.icon} {estado.label}
        </Badge>
      </div>

      {/* Nombre de Mesa */}
      <div className="mb-2">
        <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">
          {mesa.name}
        </h3>
        {mesa.zone && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {mesa.zone}
          </p>
        )}
      </div>

      {/* Información adicional */}
      <div className="space-y-1">
        {/* Capacidad */}
        <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
          <Users className="h-3 w-3" />
          <span>
            {mesa.session?.customers || 0} / {mesa.capacity} personas
          </span>
        </div>

        {/* Tiempo de sesión */}
        {mesa.session && (
          <div className={cn('flex items-center gap-1 text-xs', esMesaOlvidada ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-600 dark:text-gray-400')}>
            <Clock className="h-3 w-3" />
            <span>{getTiempoSesion()}</span>
            {esMesaOlvidada && <AlertTriangle className="h-3 w-3" />}
          </div>
        )}

        {/* Total (si existe) */}
        {mesa.totalAmount ? (
          <div className="flex items-center gap-1 text-xs font-semibold text-gray-900 dark:text-gray-100">
            <DollarSign className="h-3 w-3" />
            <span>${mesa.totalAmount.toLocaleString()}</span>
          </div>
        ) : null}

        {/* Items pendientes en cocina */}
        {pendientesCocina > 0 && (
          <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 text-xs inline-flex items-center gap-1">
            <ChefHat className="h-3 w-3" />
            {pendientesCocina} en cocina
          </Badge>
        )}
      </div>

      {/* Aviso de mesa olvidada */}
      {esMesaOlvidada && (
        <div className="absolute -top-2 -left-2">
          <Badge className="bg-red-600 text-white text-[10px] px-1.5 py-0 shadow flex items-center gap-1">
            <AlertTriangle className="h-2.5 w-2.5" />
            Revisar
          </Badge>
        </div>
      )}
    </Card>
  );
}
