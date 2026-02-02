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
  MoreHorizontal,
  Edit,
  Copy,
  CheckCircle,
  XCircle,
  Car,
  Bike,
  Truck,
  Sparkles,
  Users,
} from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import type { ParkingPassType } from '@/lib/services/parkingService';

interface PlanesTableProps {
  plans: ParkingPassType[];
  subscriberCounts: Record<string, number>;
  onEdit: (plan: ParkingPassType) => void;
  onDuplicate: (plan: ParkingPassType) => void;
  onToggleStatus: (plan: ParkingPassType) => void;
}

const VEHICLE_TYPE_ICONS: Record<string, React.ReactNode> = {
  car: <Car className="h-3.5 w-3.5" />,
  motorcycle: <Bike className="h-3.5 w-3.5" />,
  truck: <Truck className="h-3.5 w-3.5" />,
};

const VEHICLE_TYPE_LABELS: Record<string, string> = {
  car: 'Carro',
  motorcycle: 'Moto',
  truck: 'Camión',
};

export function PlanesTable({
  plans,
  subscriberCounts,
  onEdit,
  onDuplicate,
  onToggleStatus,
}: PlanesTableProps) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 dark:bg-gray-900/50">
            <TableHead className="font-semibold">Plan</TableHead>
            <TableHead className="font-semibold">Duración</TableHead>
            <TableHead className="font-semibold">Precio</TableHead>
            <TableHead className="font-semibold">Vehículos</TableHead>
            <TableHead className="font-semibold">Beneficios</TableHead>
            <TableHead className="font-semibold">Suscriptores</TableHead>
            <TableHead className="font-semibold">Estado</TableHead>
            <TableHead className="w-[60px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {plans.map((plan) => {
            const subscribers = subscriberCounts[plan.id] || 0;
            
            return (
              <TableRow
                key={plan.id}
                className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                {/* Plan */}
                <TableCell>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {plan.name}
                    </p>
                    {plan.description && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-xs">
                        {plan.description}
                      </p>
                    )}
                  </div>
                </TableCell>

                {/* Duración */}
                <TableCell>
                  <span className="text-gray-700 dark:text-gray-300">
                    {plan.duration_days} días
                  </span>
                </TableCell>

                {/* Precio */}
                <TableCell>
                  <span className="font-semibold text-blue-600 dark:text-blue-400">
                    {formatCurrency(plan.price)}
                  </span>
                </TableCell>

                {/* Vehículos */}
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    {plan.allowed_vehicle_types?.map((type) => (
                      <Badge
                        key={type}
                        variant="secondary"
                        className="flex items-center gap-1 text-xs"
                      >
                        {VEHICLE_TYPE_ICONS[type]}
                        {VEHICLE_TYPE_LABELS[type]}
                      </Badge>
                    ))}
                  </div>
                </TableCell>

                {/* Beneficios */}
                <TableCell>
                  <div className="flex items-center gap-2">
                    {plan.includes_car_wash && (
                      <Badge className="bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400 text-xs">
                        <Sparkles className="h-3 w-3 mr-1" />
                        Lavado
                      </Badge>
                    )}
                    {plan.includes_valet && (
                      <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 text-xs">
                        <Users className="h-3 w-3 mr-1" />
                        Valet
                      </Badge>
                    )}
                    {plan.max_entries_per_day && (
                      <Badge variant="outline" className="text-xs">
                        {plan.max_entries_per_day} entradas/día
                      </Badge>
                    )}
                  </div>
                </TableCell>

                {/* Suscriptores */}
                <TableCell>
                  <div className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
                    <Users className="h-4 w-4 text-gray-400" />
                    <span>{subscribers}</span>
                  </div>
                </TableCell>

                {/* Estado */}
                <TableCell>
                  <Badge
                    className={
                      plan.is_active
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                    }
                  >
                    {plan.is_active ? 'Activo' : 'Inactivo'}
                  </Badge>
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
                      <DropdownMenuItem onClick={() => onEdit(plan)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDuplicate(plan)}>
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicar
                      </DropdownMenuItem>

                      <DropdownMenuSeparator />

                      <DropdownMenuItem
                        onClick={() => onToggleStatus(plan)}
                        className={
                          plan.is_active
                            ? 'text-orange-600 dark:text-orange-400'
                            : 'text-green-600 dark:text-green-400'
                        }
                      >
                        {plan.is_active ? (
                          <>
                            <XCircle className="h-4 w-4 mr-2" />
                            Desactivar
                          </>
                        ) : (
                          <>
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Activar
                          </>
                        )}
                      </DropdownMenuItem>
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

export default PlanesTable;
