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
  Calendar,
  FileText,
  Ban,
  Eye,
} from 'lucide-react';
import { cn, formatDate } from '@/utils/Utils';
import type { LeaveRequest, LeaveRequestStatus } from '@/lib/services/leaveRequestsService';

interface LeaveRequestsTableProps {
  requests: LeaveRequest[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onCancel: (id: string) => void;
  onView: (id: string) => void;
  isLoading?: boolean;
  isManager?: boolean;
}

const STATUS_CONFIG: Record<LeaveRequestStatus, { label: string; color: string; icon: typeof Clock }> = {
  requested: { label: 'Solicitado', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', icon: Clock },
  approved: { label: 'Aprobado', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle },
  rejected: { label: 'Rechazado', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: XCircle },
  cancelled: { label: 'Cancelado', color: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400', icon: Ban },
};

function formatDays(days: number): string {
  if (days === 1) return '1 día';
  return `${days} días`;
}

export function LeaveRequestsTable({
  requests,
  onApprove,
  onReject,
  onCancel,
  onView,
  isLoading,
  isManager = false,
}: LeaveRequestsTableProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
        <p>No hay solicitudes de ausencia</p>
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
              <TableHead>Fecha Inicio</TableHead>
              <TableHead>Fecha Fin</TableHead>
              <TableHead className="text-center">Días</TableHead>
              <TableHead>Razón</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((request) => {
              const statusConfig = STATUS_CONFIG[request.status];
              const StatusIcon = statusConfig.icon;

              return (
                <TableRow key={request.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <TableCell>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {request.employee_name}
                    </span>
                    {request.branch_name && (
                      <span className="block text-xs text-gray-500 dark:text-gray-400">
                        {request.branch_name}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      style={{
                        backgroundColor: request.leave_type_color
                          ? `${request.leave_type_color}20`
                          : undefined,
                        borderColor: request.leave_type_color || undefined,
                        color: request.leave_type_color || undefined,
                      }}
                    >
                      {request.leave_type_code} - {request.leave_type_name}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-gray-600 dark:text-gray-300">
                      {formatDate(request.start_date)}
                      {request.start_half_day && (
                        <span className="ml-1 text-xs text-gray-400">(½)</span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-gray-600 dark:text-gray-300">
                      {formatDate(request.end_date)}
                      {request.end_half_day && (
                        <span className="ml-1 text-xs text-gray-400">(½)</span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="font-mono text-sm text-gray-900 dark:text-white">
                      {formatDays(request.total_days)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger>
                        <span className="text-sm text-gray-600 dark:text-gray-300 line-clamp-1 max-w-[150px]">
                          {request.reason || '-'}
                        </span>
                      </TooltipTrigger>
                      {request.reason && (
                        <TooltipContent className="max-w-xs">
                          {request.reason}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge className={cn('gap-1', statusConfig.color)}>
                      <StatusIcon className="h-3 w-3" />
                      {statusConfig.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onView(request.id)}>
                          <Eye className="h-4 w-4 mr-2" />
                          Ver Detalle
                        </DropdownMenuItem>
                        {request.document_path && (
                          <DropdownMenuItem>
                            <FileText className="h-4 w-4 mr-2" />
                            Ver Documento
                          </DropdownMenuItem>
                        )}
                        {isManager && request.status === 'requested' && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => onApprove(request.id)}>
                              <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                              Aprobar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onReject(request.id)}>
                              <XCircle className="h-4 w-4 mr-2 text-red-600" />
                              Rechazar
                            </DropdownMenuItem>
                          </>
                        )}
                        {request.status === 'requested' && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => onCancel(request.id)}>
                              <Ban className="h-4 w-4 mr-2 text-gray-600" />
                              Cancelar
                            </DropdownMenuItem>
                          </>
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
