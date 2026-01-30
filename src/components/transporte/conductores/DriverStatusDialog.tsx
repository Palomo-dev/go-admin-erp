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
import { DriverCredential } from '@/lib/services/transportService';
import { 
  Loader2, 
  CheckCircle2, 
  XCircle,
  User,
  AlertTriangle
} from 'lucide-react';

interface DriverStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driver: DriverCredential | null;
  onToggleStatus: (driverId: string, isActive: boolean) => Promise<void>;
  isUpdating?: boolean;
}

export function DriverStatusDialog({
  open,
  onOpenChange,
  driver,
  onToggleStatus,
  isUpdating,
}: DriverStatusDialogProps) {
  if (!driver) return null;

  const profile = driver.employments?.organization_members?.profiles;
  const fullName = profile 
    ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() 
    : driver.license_number;
  const isCurrentlyActive = driver.is_active_driver;
  const newStatus = !isCurrentlyActive;

  const handleConfirm = async () => {
    await onToggleStatus(driver.id, newStatus);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {newStatus ? (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            ) : (
              <XCircle className="h-5 w-5 text-red-600" />
            )}
            {newStatus ? 'Activar Conductor' : 'Desactivar Conductor'}
          </DialogTitle>
          <DialogDescription>
            {newStatus 
              ? 'El conductor podrá ser asignado a viajes y despachos.'
              : 'El conductor no podrá ser asignado a nuevos viajes.'}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="p-2 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
              <User className="h-6 w-6" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">
                {fullName}
              </p>
              <p className="text-sm text-gray-500">
                Licencia: {driver.license_number} • Cat. {driver.license_category}
              </p>
            </div>
          </div>

          {!newStatus && (
            <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                Al desactivar este conductor, no podrá ser asignado a nuevos viajes o manifiestos.
                Los viajes ya asignados no se verán afectados.
              </p>
            </div>
          )}

          {newStatus && (
            <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg flex items-start gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-green-700 dark:text-green-300">
                Al activar este conductor, estará disponible para ser asignado a viajes y despachos.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isUpdating}
            className={newStatus 
              ? 'bg-green-600 hover:bg-green-700' 
              : 'bg-red-600 hover:bg-red-700'}
          >
            {isUpdating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {newStatus ? 'Activar' : 'Desactivar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
