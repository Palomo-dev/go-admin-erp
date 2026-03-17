'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  MoreVertical,
  CheckCircle,
  XCircle,
  Lock,
  Send,
  Clock,
  AlertTriangle,
  FileEdit,
  Eye,
} from 'lucide-react';
import { cn, formatDate } from '@/utils/Utils';
import type { Timesheet, TimesheetStatus } from '@/lib/services/timesheetsService';

interface TimesheetTableProps {
  timesheets: Timesheet[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onLock: (id: string) => void;
  onCreateAdjustment: (timesheetId: string) => void;
  onView: (id: string) => void;
  isLoading?: boolean;
}

const STATUS_CONFIG: Record<TimesheetStatus, { label: string; color: string; icon: typeof Clock }> = {
  open: { label: 'Abierto', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: Clock },
  submitted: { label: 'Enviado', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', icon: Send },
  approved: { label: 'Aprobado', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle },
  rejected: { label: 'Rechazado', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: XCircle },
  locked: { label: 'Bloqueado', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400', icon: Lock },
};

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

export function TimesheetTable({
  timesheets,
  onApprove,
  onReject,
  onLock,
  onCreateAdjustment,
  onView,
  isLoading,
}: TimesheetTableProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 sm:py-12">
        <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-blue-600 dark:border-blue-400" />
      </div>
    );
  }

  if (timesheets.length === 0) {
    return (
      <div className="text-center py-8 sm:py-12 text-gray-500 dark:text-gray-400">
        <Clock className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 text-gray-300 dark:text-gray-600" />
        <p className="text-sm sm:text-base">No hay timesheets para mostrar</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
              <TableHead className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300">Fecha</TableHead>
              <TableHead className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300">Empleado</TableHead>
              <TableHead className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 hidden lg:table-cell">Sede</TableHead>
              <TableHead className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 text-right">Trabajado</TableHead>
              <TableHead className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 text-right hidden md:table-cell">Extra</TableHead>
              <TableHead className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 text-right hidden lg:table-cell">Nocturno</TableHead>
              <TableHead className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 text-right hidden md:table-cell">Tardanza</TableHead>
              <TableHead className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 text-center">Estado</TableHead>
              <TableHead className="w-10 sm:w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {timesheets.map((timesheet) => {
              const statusConfig = STATUS_CONFIG[timesheet.status];
              const StatusIcon = statusConfig.icon;

              return (
                <TableRow
                  key={timesheet.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer border-b border-gray-100 dark:border-gray-700/50"
                  onClick={() => onView(timesheet.id)}
                >
                  <TableCell className="py-2 sm:py-3">
                    <span className="font-medium text-xs sm:text-sm text-gray-900 dark:text-white">
                      {formatDate(timesheet.work_date)}
                    </span>
                  </TableCell>
                  <TableCell className="py-2 sm:py-3">
                    <div className="min-w-0">
                      <p className="font-medium text-xs sm:text-sm text-gray-900 dark:text-white truncate">
                        {timesheet.employee_name}
                      </p>
                      {timesheet.employee_code && (
                        <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                          {timesheet.employee_code}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-2 sm:py-3 hidden lg:table-cell">
                    <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-300">
                      {timesheet.branch_name || 'Sin asignar'}
                    </span>
                  </TableCell>
                  <TableCell className="py-2 sm:py-3 text-right">
                    <span className="font-mono text-xs sm:text-sm text-gray-900 dark:text-white">
                      {formatMinutes(timesheet.worked_minutes)}
                    </span>
                  </TableCell>
                  <TableCell className="py-2 sm:py-3 text-right hidden md:table-cell">
                    {timesheet.overtime_minutes > 0 ? (
                      <Tooltip>
                        <TooltipTrigger>
                          <span className="font-mono text-xs sm:text-sm text-orange-600 dark:text-orange-400">
                            {formatMinutes(timesheet.overtime_minutes)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100">Horas extra</TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">-</span>
                    )}
                  </TableCell>
                  <TableCell className="py-2 sm:py-3 text-right hidden lg:table-cell">
                    {timesheet.night_minutes > 0 ? (
                      <Tooltip>
                        <TooltipTrigger>
                          <span className="font-mono text-xs sm:text-sm text-purple-600 dark:text-purple-400">
                            {formatMinutes(timesheet.night_minutes)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100">Horas nocturnas</TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">-</span>
                    )}
                  </TableCell>
                  <TableCell className="py-2 sm:py-3 text-right hidden md:table-cell">
                    {timesheet.late_minutes > 0 ? (
                      <Tooltip>
                        <TooltipTrigger>
                          <span className="font-mono text-xs sm:text-sm text-red-600 dark:text-red-400 flex items-center justify-end gap-1">
                            <AlertTriangle className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                            {formatMinutes(timesheet.late_minutes)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100">Llegada tarde</TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">-</span>
                    )}
                  </TableCell>
                  <TableCell className="py-2 sm:py-3 text-center">
                    <Badge className={cn('gap-1 text-[10px] sm:text-xs', statusConfig.color)}>
                      <StatusIcon className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                      {statusConfig.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2 sm:py-3" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
                          <MoreVertical className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                        <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onView(timesheet.id)}>
                          <Eye className="h-4 w-4 mr-2" />
                          Ver Detalle
                        </DropdownMenuItem>
                        {(timesheet.status === 'open' || timesheet.status === 'submitted') && (
                          <>
                            <DropdownMenuItem onClick={() => onApprove(timesheet.id)}>
                              <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                              Aprobar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onReject(timesheet.id)}>
                              <XCircle className="h-4 w-4 mr-2 text-red-600" />
                              Rechazar
                            </DropdownMenuItem>
                          </>
                        )}
                        {timesheet.status === 'approved' && (
                          <DropdownMenuItem onClick={() => onLock(timesheet.id)}>
                            <Lock className="h-4 w-4 mr-2" />
                            Bloquear
                          </DropdownMenuItem>
                        )}
                        {timesheet.status !== 'locked' && (
                          <DropdownMenuItem onClick={() => onCreateAdjustment(timesheet.id)}>
                            <FileEdit className="h-4 w-4 mr-2" />
                            Crear Ajuste
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>
      </div>
    </TooltipProvider>
  );
}
