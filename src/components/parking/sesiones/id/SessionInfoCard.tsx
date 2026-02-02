'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Car,
  Bike,
  Truck,
  Clock,
  MapPin,
  CreditCard,
  Calendar,
  Timer,
  DollarSign,
} from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';

interface ParkingSession {
  id: string;
  branch_id: number;
  parking_space_id: string | null;
  vehicle_plate: string;
  vehicle_type: string;
  entry_at: string;
  exit_at: string | null;
  duration_min: number | null;
  rate_id: string | null;
  amount: number | null;
  status: string;
  created_at: string;
  updated_at: string;
  parking_spaces?: {
    id: string;
    label: string;
    zone: string | null;
    type: string;
  } | null;
}

interface SessionInfoCardProps {
  session: ParkingSession | null;
  isLoading: boolean;
}

const getVehicleTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    car: 'Automóvil',
    motorcycle: 'Motocicleta',
    truck: 'Camión/Camioneta',
    bicycle: 'Bicicleta',
  };
  return labels[type] || type;
};

const getVehicleIcon = (type: string) => {
  const icons: Record<string, React.ReactNode> = {
    car: <Car className="h-4 w-4 text-blue-600 dark:text-blue-400" />,
    motorcycle: <Bike className="h-4 w-4 text-blue-600 dark:text-blue-400" />,
    truck: <Truck className="h-4 w-4 text-blue-600 dark:text-blue-400" />,
  };
  return icons[type] || <Car className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
};

const formatDuration = (minutes: number | null) => {
  if (!minutes) return '-';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
};

const calculateCurrentDuration = (entryAt: string) => {
  const entry = new Date(entryAt);
  const now = new Date();
  const diffMs = now.getTime() - entry.getTime();
  const minutes = Math.floor(diffMs / 60000);
  return formatDuration(minutes);
};

export function SessionInfoCard({ session, isLoading }: SessionInfoCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Información de la Sesión</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-6 bg-gray-200 dark:bg-gray-700 rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!session) return null;

  const isOpen = session.status === 'open';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Car className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          Información de la Sesión
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            {getVehicleIcon(session.vehicle_type)}
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Vehículo</p>
              <p className="font-semibold text-gray-900 dark:text-white">
                {session.vehicle_plate}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {getVehicleTypeLabel(session.vehicle_type)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <MapPin className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Espacio</p>
              <p className="font-semibold text-gray-900 dark:text-white">
                {session.parking_spaces?.label || 'Sin asignar'}
              </p>
              {session.parking_spaces?.zone && (
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Zona: {session.parking_spaces.zone}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <Calendar className="h-4 w-4 text-green-600 dark:text-green-400" />
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Entrada</p>
              <p className="font-semibold text-gray-900 dark:text-white">
                {new Date(session.entry_at).toLocaleString('es-ES', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <Clock className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Salida</p>
              <p className="font-semibold text-gray-900 dark:text-white">
                {session.exit_at
                  ? new Date(session.exit_at).toLocaleString('es-ES', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })
                  : 'En curso'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <Timer className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Duración</p>
              <p className="font-semibold text-gray-900 dark:text-white">
                {isOpen
                  ? calculateCurrentDuration(session.entry_at)
                  : formatDuration(session.duration_min)}
              </p>
              {isOpen && (
                <Badge className="mt-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                  En tiempo real
                </Badge>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Monto</p>
              <p className="font-semibold text-gray-900 dark:text-white text-lg">
                {session.amount ? formatCurrency(session.amount) : 'Pendiente'}
              </p>
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">ID de Sesión:</span>
            <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
              {session.id.substring(0, 8)}...
            </code>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
