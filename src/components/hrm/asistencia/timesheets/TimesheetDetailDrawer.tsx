'use client';

import { useEffect, useState } from 'react';
import type { Timesheet } from '@/lib/services/timesheetsService';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Clock,
  Calendar,
  User,
  Building2,
  Timer,
  Moon,
  Coffee,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Lock,
  Send,
} from 'lucide-react';

interface TimesheetDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timesheet: Timesheet | null;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  open: { label: 'Abierto', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300', icon: <Clock className="h-4 w-4" /> },
  submitted: { label: 'Enviado', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300', icon: <Send className="h-4 w-4" /> },
  approved: { label: 'Aprobado', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300', icon: <CheckCircle className="h-4 w-4" /> },
  rejected: { label: 'Rechazado', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300', icon: <XCircle className="h-4 w-4" /> },
  locked: { label: 'Bloqueado', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300', icon: <Lock className="h-4 w-4" /> },
};

export function TimesheetDetailDrawer({ open, onOpenChange, timesheet }: TimesheetDetailDrawerProps) {
  if (!timesheet) return null;

  const formatMinutes = (minutes: number | null | undefined): string => {
    if (!minutes) return '0h 0m';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('es-CO', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = (dateStr: string | null): string => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const status = statusConfig[timesheet.status] || statusConfig.open;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-600" />
            Detalle de Timesheet
          </SheetTitle>
          <SheetDescription>
            Registro de tiempo del {formatDate(timesheet.work_date)}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Empleado y Estado */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">
                  {timesheet.employee_name || 'Sin nombre'}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {timesheet.employee_code || 'Sin código'}
                </p>
              </div>
            </div>
            <Badge className={`${status.color} flex items-center gap-1`}>
              {status.icon}
              {status.label}
            </Badge>
          </div>

          <Separator />

          {/* Fecha y Sucursal */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-500" />
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Fecha</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {new Date(timesheet.work_date).toLocaleDateString('es-CO')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-gray-500" />
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Sucursal</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {timesheet.branch_name || 'Sin asignar'}
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Horarios de Entrada/Salida */}
          <Card className="bg-gray-50 dark:bg-gray-800 border-0">
            <CardContent className="pt-4">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Registro de Marcación
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-white dark:bg-gray-900 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Entrada</p>
                  <p className="text-lg font-bold text-green-600 dark:text-green-400">
                    {formatTime(timesheet.first_check_in)}
                  </p>
                </div>
                <div className="text-center p-3 bg-white dark:bg-gray-900 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Salida</p>
                  <p className="text-lg font-bold text-red-600 dark:text-red-400">
                    {formatTime(timesheet.last_check_out)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Resumen de Horas */}
          <Card className="bg-blue-50 dark:bg-blue-900/20 border-0">
            <CardContent className="pt-4">
              <h4 className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-3">
                Resumen de Tiempo
              </h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-blue-600" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Trabajado</span>
                  </div>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatMinutes(timesheet.worked_minutes)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Coffee className="h-4 w-4 text-amber-600" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Descanso</span>
                  </div>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatMinutes(timesheet.break_minutes)}
                  </span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Timer className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Neto Trabajado</span>
                  </div>
                  <span className="font-bold text-green-600 dark:text-green-400">
                    {formatMinutes(timesheet.net_worked_minutes)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Horas Especiales */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="bg-purple-50 dark:bg-purple-900/20 border-0">
              <CardContent className="pt-3 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <Timer className="h-4 w-4 text-purple-600" />
                  <span className="text-xs text-purple-700 dark:text-purple-300">Extra</span>
                </div>
                <p className="text-lg font-bold text-purple-600 dark:text-purple-400">
                  {formatMinutes(timesheet.overtime_minutes)}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-indigo-50 dark:bg-indigo-900/20 border-0">
              <CardContent className="pt-3 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <Moon className="h-4 w-4 text-indigo-600" />
                  <span className="text-xs text-indigo-700 dark:text-indigo-300">Nocturno</span>
                </div>
                <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
                  {formatMinutes(timesheet.night_minutes)}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-orange-50 dark:bg-orange-900/20 border-0">
              <CardContent className="pt-3 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="h-4 w-4 text-orange-600" />
                  <span className="text-xs text-orange-700 dark:text-orange-300">Festivo</span>
                </div>
                <p className="text-lg font-bold text-orange-600 dark:text-orange-400">
                  {formatMinutes(timesheet.holiday_minutes)}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-red-50 dark:bg-red-900/20 border-0">
              <CardContent className="pt-3 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <span className="text-xs text-red-700 dark:text-red-300">Tardanza</span>
                </div>
                <p className="text-lg font-bold text-red-600 dark:text-red-400">
                  {formatMinutes(timesheet.late_minutes)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Notas */}
          {timesheet.notes && (
            <>
              <Separator />
              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Notas
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                  {timesheet.notes}
                </p>
              </div>
            </>
          )}

          {/* Razón de Rechazo */}
          {timesheet.status === 'rejected' && timesheet.rejection_reason && (
            <>
              <Separator />
              <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                <h4 className="text-sm font-medium text-red-700 dark:text-red-300 mb-2 flex items-center gap-2">
                  <XCircle className="h-4 w-4" />
                  Razón del Rechazo
                </h4>
                <p className="text-sm text-red-600 dark:text-red-400">
                  {timesheet.rejection_reason}
                </p>
              </div>
            </>
          )}

          {/* Información de Aprobación */}
          {timesheet.status === 'approved' && timesheet.approved_at && (
            <>
              <Separator />
              <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
                <h4 className="text-sm font-medium text-green-700 dark:text-green-300 mb-2 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Aprobación
                </h4>
                <p className="text-sm text-green-600 dark:text-green-400">
                  Aprobado el {new Date(timesheet.approved_at).toLocaleString('es-CO')}
                  {timesheet.approver_name && ` por ${timesheet.approver_name}`}
                </p>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default TimesheetDetailDrawer;
