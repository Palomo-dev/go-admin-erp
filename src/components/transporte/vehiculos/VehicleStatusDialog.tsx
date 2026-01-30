'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Vehicle } from '@/lib/services/transportService';
import { CheckCircle2, Clock, Wrench, XCircle, Loader2 } from 'lucide-react';

interface VehicleStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: Vehicle | null;
  onStatusChange: (vehicleId: string, status: string) => Promise<void>;
  isUpdating?: boolean;
}

const statusOptions = [
  { 
    value: 'available', 
    label: 'Disponible', 
    description: 'Listo para asignar a viajes o envíos',
    icon: CheckCircle2, 
    color: 'bg-green-100 text-green-700 border-green-300 hover:bg-green-200' 
  },
  { 
    value: 'in_use', 
    label: 'En uso', 
    description: 'Actualmente en un viaje o servicio',
    icon: Clock, 
    color: 'bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200' 
  },
  { 
    value: 'maintenance', 
    label: 'Mantenimiento', 
    description: 'En reparación o mantenimiento preventivo',
    icon: Wrench, 
    color: 'bg-yellow-100 text-yellow-700 border-yellow-300 hover:bg-yellow-200' 
  },
  { 
    value: 'inactive', 
    label: 'Inactivo', 
    description: 'Fuera de servicio temporalmente',
    icon: XCircle, 
    color: 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200' 
  },
];

export function VehicleStatusDialog({
  open,
  onOpenChange,
  vehicle,
  onStatusChange,
  isUpdating,
}: VehicleStatusDialogProps) {
  if (!vehicle) return null;

  const handleStatusChange = async (status: string) => {
    await onStatusChange(vehicle.id, status);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cambiar Estado - {vehicle.plate_number}</DialogTitle>
          <DialogDescription>
            Selecciona el nuevo estado del vehículo
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          {statusOptions.map((option) => {
            const Icon = option.icon;
            const isCurrentStatus = vehicle.status === option.value;
            
            return (
              <button
                key={option.value}
                onClick={() => handleStatusChange(option.value)}
                disabled={isUpdating || isCurrentStatus}
                className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                  isCurrentStatus 
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                    : `border-gray-200 dark:border-gray-700 hover:border-gray-300 ${option.color}`
                } ${isUpdating ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`h-5 w-5 ${isCurrentStatus ? 'text-blue-600' : ''}`} />
                  <div className="flex-1">
                    <p className={`font-medium ${isCurrentStatus ? 'text-blue-600' : ''}`}>
                      {option.label}
                      {isCurrentStatus && (
                        <span className="ml-2 text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full">
                          Actual
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {option.description}
                    </p>
                  </div>
                  {isUpdating && !isCurrentStatus && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
