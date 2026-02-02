'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertTriangle, Save, Loader2 } from 'lucide-react';
import { ParkingSession } from './SesionesTable';

interface ParkingSpace {
  id: string;
  name: string;
  status: string;
}

interface EditSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: ParkingSession | null;
  spaces: ParkingSpace[];
  onSave: (sessionId: string, updates: {
    vehicle_plate: string;
    vehicle_type: string;
    parking_space_id: string | null;
    audit_reason: string;
  }) => Promise<void>;
}

export function EditSessionDialog({
  open,
  onOpenChange,
  session,
  spaces,
  onSave,
}: EditSessionDialogProps) {
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleType, setVehicleType] = useState('car');
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [auditReason, setAuditReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session) {
      setVehiclePlate(session.vehicle_plate);
      setVehicleType(session.vehicle_type);
      setSpaceId(session.parking_space_id);
      setAuditReason('');
      setError(null);
    }
  }, [session]);

  const handleSave = async () => {
    if (!session) return;

    if (!vehiclePlate.trim()) {
      setError('La placa es requerida');
      return;
    }

    if (!auditReason.trim()) {
      setError('Debe indicar el motivo de la corrección');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await onSave(session.id, {
        vehicle_plate: vehiclePlate.toUpperCase().trim(),
        vehicle_type: vehicleType,
        parking_space_id: spaceId,
        audit_reason: auditReason.trim(),
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setIsSaving(false);
    }
  };

  const availableSpaces = spaces.filter(
    (s) => s.status === 'available' || s.id === session?.parking_space_id
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Editar Sesión (Auditable)
          </DialogTitle>
          <DialogDescription>
            Cualquier cambio quedará registrado en el historial de auditoría.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="plate">Placa del vehículo</Label>
            <Input
              id="plate"
              value={vehiclePlate}
              onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
              placeholder="ABC123"
              className="font-mono uppercase"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Tipo de vehículo</Label>
            <Select value={vehicleType} onValueChange={setVehicleType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="car">Carro</SelectItem>
                <SelectItem value="motorcycle">Moto</SelectItem>
                <SelectItem value="bicycle">Bicicleta</SelectItem>
                <SelectItem value="truck">Camión</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="space">Espacio asignado</Label>
            <Select 
              value={spaceId || 'none'} 
              onValueChange={(v) => setSpaceId(v === 'none' ? null : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sin espacio asignado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin espacio asignado</SelectItem>
                {availableSpaces.map((space) => (
                  <SelectItem key={space.id} value={space.id}>
                    {space.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason" className="flex items-center gap-1">
              Motivo de la corrección
              <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="reason"
              value={auditReason}
              onChange={(e) => setAuditReason(e.target.value)}
              placeholder="Ej: Error de digitación en la placa, cliente solicitó corrección..."
              rows={3}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Este motivo quedará registrado en el historial de auditoría.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Guardar cambios
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
