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
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (timesheets.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <Clock className="h-12 w-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
        <p>No hay timesheets para mostrar</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 dark:bg-gray-800/50">
              <TableHead>Fecha</TableHead>
              <TableHead>Empleado</TableHead>
              <TableHead>Sede</TableHead>
              <TableHead className="text-right">Trabajado</TableHead>
              <TableHead className="text-right">Extra</TableHead>
              <TableHead className="text-right">Nocturno</TableHead>
              <TableHead className="text-right">Tardanza</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {timesheets.map((timesheet) => {
              const statusConfig = STATUS_CONFIG[timesheet.status];
              const StatusIcon = statusConfig.icon;

              return (
                <TableRow
                  key={timesheet.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                  onClick={() => onView(timesheet.id)}
                >
                  <TableCell>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {formatDate(timesheet.work_date)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {timesheet.employee_name}
                      </p>
                      {timesheet.employee_code && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {timesheet.employee_code}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-gray-600 dark:text-gray-300">
                      {timesheet.branch_name || 'Sin asignar'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="font-mono text-sm text-gray-900 dark:text-white">
                      {formatMinutes(timesheet.worked_minutes)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {timesheet.overtime_minutes > 0 ? (
                      <Tooltip>
                        <TooltipTrigger>
                          <span className="font-mono text-sm text-orange-600 dark:text-orange-400">
                            {formatMinutes(timesheet.overtime_minutes)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Horas extra</TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {timesheet.night_minutes > 0 ? (
                      <Tooltip>
                        <TooltipTrigger>
                          <span className="font-mono text-sm text-purple-600 dark:text-purple-400">
                            {formatMinutes(timesheet.night_minutes)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Horas nocturnas</TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {timesheet.late_minutes > 0 ? (
                      <Tooltip>
                        <TooltipTrigger>
                          <span className="font-mono text-sm text-red-600 dark:text-red-400 flex items-center justify-end gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {formatMinutes(timesheet.late_minutes)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Llegada tarde</TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge className={cn('gap-1', statusConfig.color)}>
                      <StatusIcon className="h-3 w-3" />
                      {statusConfig.label}
                    </Badge>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
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
    </TooltipProvider>
  );
}
