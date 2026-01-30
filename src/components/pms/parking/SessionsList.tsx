'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LogOut, Car } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { ParkingSession } from '@/lib/services/parkingService';

interface SessionsListProps {
  sessions: ParkingSession[];
  onExit: (session: ParkingSession) => void;
  onSessionClick?: (session: ParkingSession) => void;
}

const getStatusInfo = (status: string) => {
  switch (status) {
    case 'active':
      return {
        label: 'Activa',
        color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      };
    case 'completed':
      return {
        label: 'Completada',
        color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
      };
    default:
      return {
        label: status,
        color: 'bg-gray-100 text-gray-800',
      };
  }
};

export function SessionsList({ sessions, onExit, onSessionClick }: SessionsListProps) {
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Car className="h-16 w-16 text-gray-400 dark:text-gray-600 mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
          No hay sesiones
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          No se encontraron sesiones de parqueo.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {sessions.map((session) => {
        const statusInfo = getStatusInfo(session.status);
        
        return (
          <Card 
            key={session.id} 
            className="p-5 cursor-pointer hover:border-blue-400 hover:shadow-md transition-all"
            onClick={() => onSessionClick?.(session)}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-gray-100">
                  {session.vehicle_plate}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {session.vehicle_type}
                </p>
              </div>
              <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Entrada:</span>
                <span className="font-medium">
                  {format(new Date(session.entry_at), 'HH:mm - dd MMM', { locale: es })}
                </span>
              </div>

              {session.exit_at && (
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Salida:</span>
                  <span className="font-medium">
                    {format(new Date(session.exit_at), 'HH:mm - dd MMM', { locale: es })}
                  </span>
                </div>
              )}

              {session.duration_min && (
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Duración:</span>
                  <span className="font-medium">{session.duration_min} min</span>
                </div>
              )}

              {session.amount && (
                <div className="flex justify-between pt-2 border-t">
                  <span className="text-gray-600 dark:text-gray-400">Total:</span>
                  <span className="font-bold text-green-600 dark:text-green-400">
                    ${session.amount}
                  </span>
                </div>
              )}
            </div>

            {session.status === 'open' && (
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  onExit(session);
                }}
                className="w-full mt-4 bg-blue-600 hover:bg-blue-700"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Registrar Salida
              </Button>
            )}
          </Card>
        );
      })}
    </div>
  );
}
