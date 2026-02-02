'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Car,
  Calendar,
  User,
  MoreVertical,
  Edit,
  Copy,
  XCircle,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Settings2,
} from 'lucide-react';
import { cn, formatCurrency } from '@/utils/Utils';
import type { ParkingPass } from '@/lib/services/parkingService';

interface PassCardProps {
  pass: ParkingPass;
  onEdit: (pass: ParkingPass) => void;
  onDuplicate: (pass: ParkingPass) => void;
  onManageVehicles: (pass: ParkingPass) => void;
  onSuspend: (pass: ParkingPass) => void;
  onCancel: (pass: ParkingPass) => void;
  onReactivate: (pass: ParkingPass) => void;
  onRenew: (pass: ParkingPass) => void;
}

const STATUS_CONFIG: Record<string, { label: string; className: string; barColor: string }> = {
  active: {
    label: 'Activo',
    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800',
    barColor: 'bg-green-500',
  },
  expired: {
    label: 'Vencido',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800',
    barColor: 'bg-red-500',
  },
  cancelled: {
    label: 'Cancelado',
    className: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600',
    barColor: 'bg-gray-500',
  },
  suspended: {
    label: 'Suspendido',
    className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800',
    barColor: 'bg-orange-500',
  },
};

export function PassCard({
  pass,
  onEdit,
  onDuplicate,
  onManageVehicles,
  onSuspend,
  onCancel,
  onReactivate,
  onRenew,
}: PassCardProps) {
  const statusConfig = STATUS_CONFIG[pass.status] || STATUS_CONFIG.active;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const getDaysRemaining = () => {
    const end = new Date(pass.end_date);
    const today = new Date();
    return Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const daysRemaining = getDaysRemaining();
  const isExpiringSoon = pass.status === 'active' && daysRemaining <= 7 && daysRemaining > 0;
  const isExpired = daysRemaining < 0;

  // Obtener placas de vehículos
  const vehiclePlates = pass.vehicles?.map(v => v.vehicle?.plate).filter(Boolean) || [];
  const primaryPlate = pass.vehicles?.find(v => v.is_primary)?.vehicle?.plate;
  const displayPlate = primaryPlate || vehiclePlates[0] || 'Sin vehículo';

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow dark:bg-gray-800 dark:border-gray-700">
      {/* Barra de estado superior */}
      <div className={cn('h-1', statusConfig.barColor)} />

      <div className="p-4">
        {/* Header con placa y acciones */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Car className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-bold text-lg text-gray-900 dark:text-white">
                  {displayPlate}
                </p>
                {vehiclePlates.length > 1 && (
                  <Badge variant="secondary" className="text-xs">
                    +{vehiclePlates.length - 1}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {pass.pass_type?.name || pass.plan_name}
              </p>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="dark:bg-gray-800 dark:border-gray-700">
              <DropdownMenuItem onClick={() => onEdit(pass)} className="dark:hover:bg-gray-700">
                <Edit className="h-4 w-4 mr-2" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate(pass)} className="dark:hover:bg-gray-700">
                <Copy className="h-4 w-4 mr-2" />
                Duplicar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onManageVehicles(pass)} className="dark:hover:bg-gray-700">
                <Settings2 className="h-4 w-4 mr-2" />
                Gestionar Placas
              </DropdownMenuItem>

              <DropdownMenuSeparator className="dark:bg-gray-700" />

              {pass.status === 'active' && (
                <>
                  <DropdownMenuItem
                    onClick={() => onSuspend(pass)}
                    className="text-orange-600 dark:text-orange-400 dark:hover:bg-gray-700"
                  >
                    <PauseCircle className="h-4 w-4 mr-2" />
                    Suspender
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onCancel(pass)}
                    className="text-red-600 dark:text-red-400 dark:hover:bg-gray-700"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Cancelar
                  </DropdownMenuItem>
                </>
              )}

              {pass.status === 'suspended' && (
                <>
                  <DropdownMenuItem
                    onClick={() => onReactivate(pass)}
                    className="text-green-600 dark:text-green-400 dark:hover:bg-gray-700"
                  >
                    <PlayCircle className="h-4 w-4 mr-2" />
                    Reactivar
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onCancel(pass)}
                    className="text-red-600 dark:text-red-400 dark:hover:bg-gray-700"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Cancelar
                  </DropdownMenuItem>
                </>
              )}

              {(pass.status === 'expired' || isExpiringSoon) && (
                <DropdownMenuItem
                  onClick={() => onRenew(pass)}
                  className="text-blue-600 dark:text-blue-400 dark:hover:bg-gray-700"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Renovar
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Info del cliente */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-gray-400" />
            <span className="text-gray-700 dark:text-gray-300 font-medium">
              {pass.customer?.full_name || 'Sin cliente asignado'}
            </span>
          </div>
          {pass.customer?.phone && (
            <p className="text-xs text-gray-500 dark:text-gray-400 ml-6">
              {pass.customer.phone}
            </p>
          )}
        </div>

        {/* Fechas */}
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-4">
          <Calendar className="h-4 w-4" />
          <span>
            {formatDate(pass.start_date)} → {formatDate(pass.end_date)}
          </span>
        </div>

        {/* Footer con estado y precio */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Badge className={cn('text-xs border', statusConfig.className)}>
              {statusConfig.label}
            </Badge>
            {isExpiringSoon && (
              <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 text-xs border border-yellow-200 dark:border-yellow-800">
                {daysRemaining} días
              </Badge>
            )}
            {isExpired && pass.status === 'active' && (
              <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-xs border border-red-200 dark:border-red-800">
                Vencido
              </Badge>
            )}
          </div>
          <span className="font-bold text-lg text-blue-600 dark:text-blue-400">
            {formatCurrency(Number(pass.price))}
          </span>
        </div>
      </div>
    </Card>
  );
}

export default PassCard;
