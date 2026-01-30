'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Edit,
  MoreVertical,
  XCircle,
  CheckCircle,
  RefreshCw,
  Clock,
  AlertTriangle,
  UserMinus,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface ShiftDetailHeaderProps {
  shift: {
    id: string;
    employee_name: string;
    employee_code: string | null;
    work_date: string;
    status: string;
    template_name: string | null;
    template_start_time: string | null;
    template_end_time: string | null;
    template_color: string | null;
    branch_name: string | null;
  };
  onEdit: () => void;
  onChangeStatus: (status: string) => void;
  onRequestSwap: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: typeof Clock }> = {
  scheduled: {
    label: 'Programado',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    icon: Clock,
  },
  completed: {
    label: 'Completado',
    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    icon: CheckCircle,
  },
  cancelled: {
    label: 'Cancelado',
    className: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
    icon: XCircle,
  },
  swap_pending: {
    label: 'Swap Pendiente',
    className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    icon: RefreshCw,
  },
  absent: {
    label: 'Ausente',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    icon: UserMinus,
  },
  late: {
    label: 'Tardanza',
    className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    icon: AlertTriangle,
  },
};

export function ShiftDetailHeader({
  shift,
  onEdit,
  onChangeStatus,
  onRequestSwap,
}: ShiftDetailHeaderProps) {
  const statusConfig = STATUS_CONFIG[shift.status] || STATUS_CONFIG.scheduled;
  const StatusIcon = statusConfig.icon;

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatTime = (time: string | null) => {
    if (!time) return '--:--';
    return time.substring(0, 5);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
        {/* Info Principal */}
        <div className="flex items-start gap-4">
          {/* Color indicator */}
          <div
            className="w-2 h-full min-h-[80px] rounded-full"
            style={{ backgroundColor: shift.template_color || '#3b82f6' }}
          />

          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <Badge variant="secondary" className={statusConfig.className}>
                <StatusIcon className="h-3 w-3 mr-1" />
                {statusConfig.label}
              </Badge>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {format(new Date(shift.work_date), "EEEE, d 'de' MMMM yyyy", { locale: es })}
              </span>
            </div>

            <div className="flex items-center gap-4 mb-3">
              <Avatar className="h-12 w-12">
                <AvatarFallback className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-lg">
                  {getInitials(shift.employee_name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                  {shift.employee_name}
                </h1>
                {shift.employee_code && (
                  <p className="text-sm font-mono text-gray-500 dark:text-gray-400">
                    {shift.employee_code}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-300">
              {shift.template_name && (
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: shift.template_color || '#3b82f6' }}
                  />
                  <span className="font-medium">{shift.template_name}</span>
                </div>
              )}
              <div className="flex items-center gap-1 font-mono text-lg">
                <Clock className="h-4 w-4 text-gray-400" />
                {formatTime(shift.template_start_time)} - {formatTime(shift.template_end_time)}
              </div>
              {shift.branch_name && (
                <span className="text-gray-500">📍 {shift.branch_name}</span>
              )}
            </div>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2">
          <Button onClick={onEdit} disabled={shift.status === 'cancelled'}>
            <Edit className="h-4 w-4 mr-2" />
            Editar
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Acciones</DropdownMenuLabel>
              <DropdownMenuSeparator />

              {shift.status === 'scheduled' && (
                <>
                  <DropdownMenuItem onClick={onRequestSwap}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Solicitar Swap
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onChangeStatus('completed')}
                    className="text-green-600 dark:text-green-400"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Marcar Completado
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onChangeStatus('absent')}
                    className="text-red-600 dark:text-red-400"
                  >
                    <UserMinus className="h-4 w-4 mr-2" />
                    Marcar Ausente
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onChangeStatus('late')}
                    className="text-orange-600 dark:text-orange-400"
                  >
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    Marcar Tardanza
                  </DropdownMenuItem>
                </>
              )}

              {shift.status !== 'cancelled' && shift.status !== 'completed' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onChangeStatus('cancelled')}
                    className="text-red-600 dark:text-red-400"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Cancelar Turno
                  </DropdownMenuItem>
                </>
              )}

              {shift.status === 'cancelled' && (
                <DropdownMenuItem
                  onClick={() => onChangeStatus('scheduled')}
                  className="text-blue-600 dark:text-blue-400"
                >
                  <Clock className="h-4 w-4 mr-2" />
                  Reactivar Turno
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

export default ShiftDetailHeader;
