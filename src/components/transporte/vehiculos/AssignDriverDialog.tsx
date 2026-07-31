'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Vehicle, DriverCredential } from '@/lib/services/transportService';
import { Search, User, Phone, Mail, Loader2, UserX, CheckCircle2 } from 'lucide-react';

interface AssignDriverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: Vehicle | null;
  drivers: DriverCredential[];
  onAssignDriver: (vehicleId: string, driverId: string | null) => Promise<void>;
  isUpdating?: boolean;
}

export function AssignDriverDialog({
  open,
  onOpenChange,
  vehicle,
  drivers,
  onAssignDriver,
  isUpdating,
}: AssignDriverDialogProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);

  useEffect(() => {
    if (vehicle) {
      setSelectedDriverId(vehicle.current_driver_id || null);
    }
  }, [vehicle]);

  if (!vehicle) return null;

  const filteredDrivers = drivers.filter((driver) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const profile = driver.employments?.organization_members?.profiles;
    const fullName = profile 
      ? `${profile.first_name} ${profile.last_name}`.toLowerCase()
      : '';
    return (
      fullName.includes(term) ||
      driver.license_number.toLowerCase().includes(term) ||
      (profile?.phone && profile.phone.includes(term))
    );
  });

  const handleAssign = async () => {
    await onAssignDriver(vehicle.id, selectedDriverId);
  };

  const handleRemoveDriver = async () => {
    setSelectedDriverId(null);
    await onAssignDriver(vehicle.id, null);
  };

  const getDriverName = (driver: DriverCredential) => {
    const profile = driver.employments?.organization_members?.profiles;
    return profile ? `${profile.first_name} ${profile.last_name}` : 'Sin nombre';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Asignar Conductor - {vehicle.plate_number}</DialogTitle>
          <DialogDescription>
            Selecciona un conductor para asignar a este vehículo
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar por nombre, licencia o teléfono..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {vehicle.current_driver_id && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-blue-600" />
                <span className="text-sm text-blue-700 dark:text-blue-300">
                  Conductor actual asignado
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRemoveDriver}
                disabled={isUpdating}
                className="text-red-600 hover:text-red-700"
              >
                <UserX className="h-4 w-4 mr-1" />
                Remover
              </Button>
            </div>
          )}

          <div className="max-h-64 overflow-y-auto space-y-2">
            {filteredDrivers.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <User className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No se encontraron conductores</p>
              </div>
            ) : (
              filteredDrivers.map((driver) => {
                const profile = driver.employments?.organization_members?.profiles;
                const isSelected = selectedDriverId === driver.employment_id;
                const isCurrent = vehicle.current_driver_id === driver.employment_id;

                return (
                  <button
                    key={driver.id}
                    onClick={() => setSelectedDriverId(driver.employment_id)}
                    disabled={isUpdating}
                    className={`w-full p-3 rounded-lg border text-left transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                          <User className="h-5 w-5 text-gray-600" />
                        </div>
                        <div>
                          <p className="font-medium flex items-center gap-2">
                            {getDriverName(driver)}
                            {isCurrent && (
                              <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full">
                                Actual
                              </span>
                            )}
                          </p>
                          <p className="text-sm text-gray-500">
                            Licencia: {driver.license_number} ({driver.license_category})
                          </p>
                          <div className="flex items-center gap-3 text-xs text-gray-400">
                            {profile?.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {profile.phone}
                              </span>
                            )}
                            {profile?.email && (
                              <span className="flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {profile.email}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {isSelected && (
                        <CheckCircle2 className="h-5 w-5 text-blue-600" />
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isUpdating}>
            Cancelar
          </Button>
          <Button
            onClick={handleAssign}
            disabled={isUpdating || selectedDriverId === vehicle.current_driver_id}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isUpdating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Asignar Conductor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
