'use client';

import { Card, CardContent } from '@/components/ui/card';
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
  MoreVertical, 
  Edit, 
  Trash2, 
  Car,
  Truck,
  Bus,
  AlertTriangle,
  Calendar,
  User,
  Copy,
  Wrench,
  PlayCircle,
  PauseCircle,
  History,
  UserCog
} from 'lucide-react';
import { Vehicle } from '@/lib/services/transportService';
import { format, isPast, addDays } from 'date-fns';

interface VehiclesListProps {
  vehicles: Vehicle[];
  isLoading?: boolean;
  onEdit: (vehicle: Vehicle) => void;
  onDelete: (vehicle: Vehicle) => void;
  onDuplicate: (vehicle: Vehicle) => void;
  onChangeStatus: (vehicle: Vehicle) => void;
  onAssignDriver: (vehicle: Vehicle) => void;
  onViewHistory: (vehicle: Vehicle) => void;
}

const vehicleTypeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  motorcycle: Car,
  car: Car,
  van: Truck,
  truck: Truck,
  minibus: Bus,
  bus: Bus,
};

const vehicleTypeLabels: Record<string, string> = {
  motorcycle: 'Moto',
  car: 'Auto',
  van: 'Van',
  truck: 'Camión',
  minibus: 'Minibús',
  bus: 'Bus',
};

const statusConfig: Record<string, { label: string; color: string }> = {
  available: { label: 'Disponible', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  in_use: { label: 'En uso', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  maintenance: { label: 'Mantenimiento', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  inactive: { label: 'Inactivo', color: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400' },
};

function getExpiryStatus(date?: string): 'ok' | 'warning' | 'expired' | null {
  if (!date) return null;
  const expiryDate = new Date(date);
  if (isPast(expiryDate)) return 'expired';
  if (expiryDate <= addDays(new Date(), 30)) return 'warning';
  return 'ok';
}

export function VehiclesList({ 
  vehicles, 
  isLoading, 
  onEdit, 
  onDelete,
  onDuplicate,
  onChangeStatus,
  onAssignDriver,
  onViewHistory
}: VehiclesListProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-40 bg-gray-200 dark:bg-gray-700 rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (vehicles.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Truck className="h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No hay vehículos
          </h3>
          <p className="text-gray-600 dark:text-gray-400 text-center">
            Agrega tu primer vehículo para comenzar a gestionar tu flota.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {vehicles.map((vehicle) => {
        const Icon = vehicleTypeIcons[vehicle.vehicle_type] || Car;
        const status = statusConfig[vehicle.status] || statusConfig.inactive;
        const soatStatus = getExpiryStatus(vehicle.soat_expiry);
        const techStatus = getExpiryStatus(vehicle.tech_review_expiry);
        const insuranceStatus = getExpiryStatus(vehicle.insurance_expiry);
        const hasWarnings = soatStatus === 'warning' || techStatus === 'warning' || insuranceStatus === 'warning';
        const hasExpired = soatStatus === 'expired' || techStatus === 'expired' || insuranceStatus === 'expired';

        return (
          <Card
            key={vehicle.id}
            className={`hover:shadow-md transition-shadow ${hasExpired ? 'border-red-300 dark:border-red-800' : hasWarnings ? 'border-yellow-300 dark:border-yellow-800' : ''}`}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                      {vehicle.plate_number}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {vehicle.brand} {vehicle.model} {vehicle.year}
                    </p>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(vehicle)}>
                      <Edit className="h-4 w-4 mr-2" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDuplicate(vehicle)}>
                      <Copy className="h-4 w-4 mr-2" />
                      Duplicar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onChangeStatus(vehicle)}>
                      {vehicle.status === 'available' ? (
                        <>
                          <PauseCircle className="h-4 w-4 mr-2" />
                          Cambiar Estado
                        </>
                      ) : vehicle.status === 'maintenance' ? (
                        <>
                          <Wrench className="h-4 w-4 mr-2" />
                          Cambiar Estado
                        </>
                      ) : (
                        <>
                          <PlayCircle className="h-4 w-4 mr-2" />
                          Cambiar Estado
                        </>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onAssignDriver(vehicle)}>
                      <UserCog className="h-4 w-4 mr-2" />
                      Asignar Conductor
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onViewHistory(vehicle)}>
                      <History className="h-4 w-4 mr-2" />
                      Ver Historial
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onDelete(vehicle)}
                      className="text-red-600"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Eliminar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex flex-wrap gap-2 mb-3">
                <Badge variant="outline">
                  {vehicleTypeLabels[vehicle.vehicle_type] || vehicle.vehicle_type}
                </Badge>
                <Badge className={status.color}>
                  {status.label}
                </Badge>
                {(hasWarnings || hasExpired) && (
                  <Badge variant={hasExpired ? 'destructive' : 'outline'} className={hasWarnings && !hasExpired ? 'border-yellow-500 text-yellow-600' : ''}>
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {hasExpired ? 'Docs vencidos' : 'Docs por vencer'}
                  </Badge>
                )}
              </div>

              <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                {vehicle.transport_carriers && (
                  <p className="flex items-center gap-2">
                    <Truck className="h-3 w-3" />
                    {vehicle.transport_carriers.name}
                  </p>
                )}
                {vehicle.branches && (
                  <p className="flex items-center gap-2">
                    <span className="font-medium">Sucursal:</span> {vehicle.branches.name}
                  </p>
                )}
                {vehicle.capacity_seats && (
                  <p className="flex items-center gap-2">
                    <User className="h-3 w-3" />
                    Capacidad: {vehicle.capacity_seats} pasajeros
                  </p>
                )}
                {vehicle.capacity_kg && (
                  <p>Carga máx: {vehicle.capacity_kg} kg</p>
                )}
                {vehicle.soat_expiry && (
                  <p className={`flex items-center gap-2 ${soatStatus === 'expired' ? 'text-red-600' : soatStatus === 'warning' ? 'text-yellow-600' : ''}`}>
                    <Calendar className="h-3 w-3" />
                    SOAT: {format(new Date(vehicle.soat_expiry), 'dd/MM/yyyy')}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
