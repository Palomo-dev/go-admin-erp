'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  LogIn,
  LogOut,
  Coffee,
  MapPin,
  AlertTriangle,
  Hand,
  QrCode,
  Smartphone,
  Clock,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { AttendanceEventListItem } from '@/lib/services/attendanceService';

interface AttendanceTableProps {
  events: AttendanceEventListItem[];
  onEventClick?: (id: string) => void;
  isLoading?: boolean;
}

const EVENT_TYPE_CONFIG: Record<string, { label: string; icon: typeof LogIn; color: string }> = {
  check_in: { label: 'Entrada', icon: LogIn, color: 'text-green-600' },
  check_out: { label: 'Salida', icon: LogOut, color: 'text-red-600' },
  break_start: { label: 'Inicio Descanso', icon: Coffee, color: 'text-orange-600' },
  break_end: { label: 'Fin Descanso', icon: Coffee, color: 'text-blue-600' },
};

const SOURCE_CONFIG: Record<string, { label: string; icon: typeof QrCode }> = {
  qr: { label: 'Código QR', icon: QrCode },
  geo: { label: 'Geolocalización', icon: MapPin },
  manual: { label: 'Manual', icon: Hand },
  biometric: { label: 'Biométrico', icon: Smartphone },
  nfc: { label: 'NFC', icon: Smartphone },
};

export function AttendanceTable({
  events,
  onEventClick,
  isLoading,
}: AttendanceTableProps) {
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <Clock className="h-12 w-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
        <p>No hay marcaciones registradas</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 dark:bg-gray-800/50">
              <TableHead>Empleado</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Hora</TableHead>
              <TableHead>Fuente</TableHead>
              <TableHead>Sede</TableHead>
              <TableHead>Dispositivo</TableHead>
              <TableHead className="text-center">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((event) => {
              const typeConfig = EVENT_TYPE_CONFIG[event.event_type] || {
                label: event.event_type,
                icon: Clock,
                color: 'text-gray-600',
              };
              const sourceConfig = SOURCE_CONFIG[event.source] || {
                label: event.source,
                icon: Smartphone,
              };
              const TypeIcon = typeConfig.icon;
              const SourceIcon = sourceConfig.icon;

              const hasAnomaly =
                event.is_manual_entry || event.geo_validated === false;

              return (
                <TableRow
                  key={event.id}
                  className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                    hasAnomaly ? 'bg-yellow-50/50 dark:bg-yellow-900/10' : ''
                  }`}
                  onClick={() => onEventClick?.(event.id)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-xs">
                          {getInitials(event.employee_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white text-sm">
                          {event.employee_name}
                        </p>
                        {event.employee_code && (
                          <p className="text-xs text-gray-500 font-mono">
                            {event.employee_code}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <TypeIcon className={`h-4 w-4 ${typeConfig.color}`} />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {typeConfig.label}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-mono text-sm text-gray-900 dark:text-white">
                      {format(new Date(event.event_at), 'HH:mm:ss')}
                    </div>
                    <div className="text-xs text-gray-500">
                      {format(new Date(event.event_at), "d MMM yyyy", { locale: es })}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-2">
                          <SourceIcon className="h-4 w-4 text-gray-400" />
                          <span className="text-sm text-gray-600 dark:text-gray-300">
                            {sourceConfig.label}
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Fuente: {sourceConfig.label}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-gray-600 dark:text-gray-300">
                      {event.branch_name || '-'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-gray-600 dark:text-gray-300">
                      {event.time_clock_name || '-'}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      {event.is_manual_entry && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge
                              variant="outline"
                              className="border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-900/30 dark:text-orange-400"
                            >
                              <Hand className="h-3 w-3 mr-1" />
                              Manual
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Razón: {event.manual_reason || 'No especificada'}</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {event.geo_validated === false && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge
                              variant="outline"
                              className="border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400"
                            >
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Geo
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Fuera de zona permitida</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {!hasAnomaly && (
                        <Badge
                          variant="secondary"
                          className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        >
                          OK
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}

export default AttendanceTable;
