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
  Clock,
  FileText,
  Paperclip,
  Plus,
  Minus,
  Edit,
} from 'lucide-react';
import { cn, formatDate } from '@/utils/Utils';
import type { TimesheetAdjustment, AdjustmentStatus, AdjustmentType } from '@/lib/services/timesheetAdjustmentsService';

interface AdjustmentTableProps {
  adjustments: TimesheetAdjustment[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onViewDocument: (path: string) => void;
  isLoading?: boolean;
}

const STATUS_CONFIG: Record<AdjustmentStatus, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', icon: Clock },
  approved: { label: 'Aprobado', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle },
  rejected: { label: 'Rechazado', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: XCircle },
};

const TYPE_CONFIG: Record<AdjustmentType, { label: string; icon: typeof Plus }> = {
  add_time: { label: 'Agregar tiempo', icon: Plus },
  remove_time: { label: 'Restar tiempo', icon: Minus },
  change_check_in: { label: 'Cambiar entrada', icon: Edit },
  change_check_out: { label: 'Cambiar salida', icon: Edit },
  add_break: { label: 'Agregar descanso', icon: Clock },
  other: { label: 'Otro', icon: FileText },
};

function formatMinutes(minutes: number | null): string {
  if (!minutes) return '-';
  const sign = minutes > 0 ? '+' : '';
  const hours = Math.floor(Math.abs(minutes) / 60);
  const mins = Math.abs(minutes) % 60;
  return `${sign}${hours}h ${mins}m`;
}

export function AdjustmentTable({
  adjustments,
  onApprove,
  onReject,
  onViewDocument,
  isLoading,
}: AdjustmentTableProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (adjustments.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
        <p>No hay ajustes para mostrar</p>
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
              <TableHead>Tipo</TableHead>
              <TableHead>Razón</TableHead>
              <TableHead className="text-right">Delta</TableHead>
              <TableHead className="text-center">Soporte</TableHead>
              <TableHead>Solicitante</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {adjustments.map((adjustment) => {
              const statusConfig = STATUS_CONFIG[adjustment.status];
              const typeConfig = TYPE_CONFIG[adjustment.adjustment_type] || TYPE_CONFIG.other;
              const StatusIcon = statusConfig.icon;
              const TypeIcon = typeConfig.icon;

              return (
                <TableRow key={adjustment.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <TableCell>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {formatDate(adjustment.timesheet?.work_date)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-gray-600 dark:text-gray-300">
                      {adjustment.timesheet?.employee_name || 'Sin asignar'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="gap-1">
                      <TypeIcon className="h-3 w-3" />
                      {typeConfig.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger>
                        <span className="text-sm text-gray-600 dark:text-gray-300 line-clamp-1 max-w-[200px]">
                          {adjustment.reason}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        {adjustment.reason}
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={cn(
                      'font-mono text-sm',
                      adjustment.minutes_delta && adjustment.minutes_delta > 0
                        ? 'text-green-600 dark:text-green-400'
                        : adjustment.minutes_delta && adjustment.minutes_delta < 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-gray-500'
                    )}>
                      {formatMinutes(adjustment.minutes_delta)}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    {adjustment.supporting_document_path ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onViewDocument(adjustment.supporting_document_path!)}
                        className="text-blue-600 hover:text-blue-700"
                      >
                        <Paperclip className="h-4 w-4" />
                      </Button>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-gray-600 dark:text-gray-300">
                      {adjustment.creator_name}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge className={cn('gap-1', statusConfig.color)}>
                      <StatusIcon className="h-3 w-3" />
                      {statusConfig.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {adjustment.status === 'pending' && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => onApprove(adjustment.id)}>
                            <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                            Aprobar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onReject(adjustment.id)}>
                            <XCircle className="h-4 w-4 mr-2 text-red-600" />
                            Rechazar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
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
