'use client';

import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  MoreHorizontal,
  Edit,
  Copy,
  XCircle,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Settings2,
  User,
} from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import type { ParkingPass } from '@/lib/services/parkingService';

interface PassesTableProps {
  passes: ParkingPass[];
  onEdit: (pass: ParkingPass) => void;
  onDuplicate: (pass: ParkingPass) => void;
  onManageVehicles: (pass: ParkingPass) => void;
  onSuspend: (pass: ParkingPass) => void;
  onCancel: (pass: ParkingPass) => void;
  onReactivate: (pass: ParkingPass) => void;
  onRenew: (pass: ParkingPass) => void;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  active: {
    label: 'Activo',
    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  expired: {
    label: 'Vencido',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
  cancelled: {
    label: 'Cancelado',
    className: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  },
  suspended: {
    label: 'Suspendido',
    className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  },
};

export function PassesTable({
  passes,
  onEdit,
  onDuplicate,
  onManageVehicles,
  onSuspend,
  onCancel,
  onReactivate,
  onRenew,
}: PassesTableProps) {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const getDaysRemaining = (endDate: string) => {
    const end = new Date(endDate);
    const today = new Date();
    return Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 dark:bg-gray-900/50">
            <TableHead className="font-semibold">Placa / Cliente</TableHead>
            <TableHead className="font-semibold">Plan</TableHead>
            <TableHead className="font-semibold">Vigencia</TableHead>
            <TableHead className="font-semibold">Estado</TableHead>
            <TableHead className="font-semibold text-right">Precio</TableHead>
            <TableHead className="w-[60px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {passes.map((pass) => {
            const statusConfig = STATUS_CONFIG[pass.status] || STATUS_CONFIG.active;
            const daysRemaining = getDaysRemaining(pass.end_date);
            const isExpiringSoon = pass.status === 'active' && daysRemaining <= 7 && daysRemaining > 0;
            const vehiclePlates = pass.vehicles?.map(v => v.vehicle?.plate).filter(Boolean) || [];
            const primaryPlate = pass.vehicles?.find(v => v.is_primary)?.vehicle?.plate;
            const displayPlate = primaryPlate || vehiclePlates[0] || 'Sin placa';

            return (
              <TableRow
                key={pass.id}
                className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                {/* Placa / Cliente */}
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                      <Car className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900 dark:text-white">
                          {displayPlate}
                        </span>
                        {vehiclePlates.length > 1 && (
                          <Badge variant="secondary" className="text-xs">
                            +{vehiclePlates.length - 1}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                        <User className="h-3 w-3" />
                        <span>{pass.customer?.full_name || 'Sin cliente'}</span>
                      </div>
                    </div>
                  </div>
                </TableCell>

                {/* Plan */}
                <TableCell>
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {pass.pass_type?.name || pass.plan_name}
                  </span>
                </TableCell>

                {/* Vigencia */}
                <TableCell>
                  <div className="text-sm">
                    <span className="text-gray-700 dark:text-gray-300">
                      {formatDate(pass.start_date)}
                    </span>
                    <span className="mx-1 text-gray-400">→</span>
                    <span className="text-gray-700 dark:text-gray-300">
                      {formatDate(pass.end_date)}
                    </span>
                  </div>
                  {isExpiringSoon && (
                    <span className="text-xs text-yellow-600 dark:text-yellow-400">
                      Vence en {daysRemaining} días
                    </span>
                  )}
                </TableCell>

                {/* Estado */}
                <TableCell>
                  <Badge className={statusConfig.className}>
                    {statusConfig.label}
                  </Badge>
                </TableCell>

                {/* Precio */}
                <TableCell className="text-right">
                  <span className="font-semibold text-blue-600 dark:text-blue-400">
                    {formatCurrency(Number(pass.price))}
                  </span>
                </TableCell>

                {/* Acciones */}
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="dark:bg-gray-800 dark:border-gray-700">
                      <DropdownMenuItem onClick={() => onEdit(pass)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDuplicate(pass)}>
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onManageVehicles(pass)}>
                        <Settings2 className="h-4 w-4 mr-2" />
                        Gestionar Placas
                      </DropdownMenuItem>

                      <DropdownMenuSeparator />

                      {pass.status === 'active' && (
                        <>
                          <DropdownMenuItem
                            onClick={() => onSuspend(pass)}
                            className="text-orange-600 dark:text-orange-400"
                          >
                            <PauseCircle className="h-4 w-4 mr-2" />
                            Suspender
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onCancel(pass)}
                            className="text-red-600 dark:text-red-400"
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
                            className="text-green-600 dark:text-green-400"
                          >
                            <PlayCircle className="h-4 w-4 mr-2" />
                            Reactivar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onCancel(pass)}
                            className="text-red-600 dark:text-red-400"
                          >
                            <XCircle className="h-4 w-4 mr-2" />
                            Cancelar
                          </DropdownMenuItem>
                        </>
                      )}

                      {(pass.status === 'expired' || isExpiringSoon) && (
                        <DropdownMenuItem
                          onClick={() => onRenew(pass)}
                          className="text-blue-600 dark:text-blue-400"
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Renovar
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
  );
}

export default PassesTable;
