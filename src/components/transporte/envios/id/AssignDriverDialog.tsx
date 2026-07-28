'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Search, User, Phone, IdCard, UserPlus, UserMinus } from 'lucide-react';

export interface AvailableDriver {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  avatar_url?: string;
  license_number?: string;
  license_category?: string;
}

interface AssignDriverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drivers: AvailableDriver[];
  isLoading: boolean;
  currentDriverId?: string;
  currentDriverName?: string;
  onAssign: (driverId: string) => Promise<void>;
  onUnassign?: () => Promise<void>;
}

export function AssignDriverDialog({
  open,
  onOpenChange,
  drivers,
  isLoading,
  currentDriverId,
  currentDriverName,
  onAssign,
  onUnassign,
}: AssignDriverDialogProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedDriverId(currentDriverId || null);
      setSearchTerm('');
    }
  }, [open, currentDriverId]);

  const filteredDrivers = drivers.filter((d) =>
    d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.phone?.includes(searchTerm) ||
    d.license_number?.includes(searchTerm)
  );

  const handleAssign = useCallback(async () => {
    if (!selectedDriverId) return;
    setAssigning(true);
    try {
      await onAssign(selectedDriverId);
      onOpenChange(false);
    } finally {
      setAssigning(false);
    }
  }, [selectedDriverId, onAssign, onOpenChange]);

  const handleUnassign = useCallback(async () => {
    if (!onUnassign) return;
    setAssigning(true);
    try {
      await onUnassign();
      onOpenChange(false);
    } finally {
      setAssigning(false);
    }
  }, [onUnassign, onOpenChange]);

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Asignar Conductor
          </DialogTitle>
          <DialogDescription>
            Selecciona un conductor disponible para este envío
          </DialogDescription>
        </DialogHeader>

        {currentDriverId && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-medium">
                {getInitials(currentDriverName || '')}
              </div>
              <div>
                <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                  Conductor actual: {currentDriverName}
                </p>
              </div>
            </div>
            {onUnassign && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleUnassign}
              disabled={assigning}
              className="text-red-600 border-red-300 hover:bg-red-50 dark:border-red-700 dark:hover:bg-red-900/20"
            >
              <UserMinus className="h-4 w-4 mr-1" />
              Desasignar
            </Button>
            )}
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por nombre, teléfono o licencia..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        <ScrollArea className="h-[300px] rounded-lg border">
          {isLoading ? (
            <div className="flex items-center justify-center h-full py-8">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              <span className="ml-2 text-sm text-gray-500">Cargando conductores...</span>
            </div>
          ) : filteredDrivers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-8 text-gray-500">
              <User className="h-8 w-8 mb-2 text-gray-300" />
              <p className="text-sm">No se encontraron conductores</p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredDrivers.map((driver) => {
                const isSelected = selectedDriverId === driver.id;
                const isCurrent = currentDriverId === driver.id;
                return (
                  <button
                    key={driver.id}
                    onClick={() => setSelectedDriverId(driver.id)}
                    className={`w-full flex items-center gap-3 p-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 ${
                      isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                    }`}
                  >
                    {driver.avatar_url ? (
                      <img
                        src={driver.avatar_url}
                        alt={driver.name}
                        className="w-10 h-10 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-white text-sm font-medium shrink-0">
                        {getInitials(driver.name)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {driver.name}
                        {isCurrent && (
                          <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">(actual)</span>
                        )}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                        {driver.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {driver.phone}
                          </span>
                        )}
                        {driver.license_number && (
                          <span className="flex items-center gap-1">
                            <IdCard className="h-3 w-3" />
                            {driver.license_number}
                            {driver.license_category && ` (${driver.license_category})`}
                          </span>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={assigning}>
            Cancelar
          </Button>
          <Button
            onClick={handleAssign}
            disabled={!selectedDriverId || assigning || selectedDriverId === currentDriverId}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {assigning ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4 mr-2" />
            )}
            {currentDriverId ? 'Cambiar Conductor' : 'Asignar Conductor'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
