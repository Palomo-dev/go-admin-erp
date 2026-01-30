'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Car, Clock, AlertTriangle, MapPin, ExternalLink } from 'lucide-react';
import { cn } from '@/utils/Utils';
import Link from 'next/link';

interface ActiveSession {
  id: string;
  vehicle_plate: string;
  vehicle_type: string;
  entry_at: string;
  duration_minutes: number;
  space_label?: string;
  zone?: string;
  is_at_risk: boolean;
}

interface ActiveSessionsListProps {
  sessions: ActiveSession[];
  atRiskCount: number;
}

export function ActiveSessionsList({ sessions, atRiskCount }: ActiveSessionsListProps) {
  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getVehicleIcon = (type: string) => {
    return <Car className="h-4 w-4" />;
  };

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-600" />
            Sesiones Activas
            <Badge variant="secondary" className="ml-2">
              {sessions.length}
            </Badge>
          </CardTitle>
          {atRiskCount > 0 && (
            <Badge variant="destructive" className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {atRiskCount} en riesgo
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <Car className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No hay sesiones activas</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={cn(
                  'flex items-center justify-between p-3 rounded-lg border transition-colors',
                  session.is_at_risk
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                    : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600'
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'p-2 rounded-full',
                    session.is_at_risk
                      ? 'bg-red-100 dark:bg-red-800 text-red-600 dark:text-red-300'
                      : 'bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-300'
                  )}>
                    {getVehicleIcon(session.vehicle_type)}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">
                      {session.vehicle_plate}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span>Entrada: {formatTime(session.entry_at)}</span>
                      {session.space_label && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {session.space_label}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className={cn(
                      'font-semibold',
                      session.is_at_risk
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-gray-900 dark:text-gray-100'
                    )}>
                      {formatDuration(session.duration_minutes)}
                    </p>
                    {session.is_at_risk && (
                      <Badge variant="destructive" className="text-xs">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Mucho tiempo
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {sessions.length > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
            <Link href="/app/pms/parking">
              <Button variant="outline" size="sm" className="w-full">
                Ver todas las sesiones
                <ExternalLink className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
