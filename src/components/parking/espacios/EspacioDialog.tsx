'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, ParkingSquare, Plus } from 'lucide-react';
import { ParkingSpace, ParkingZone, SpaceType, SpaceState } from './types';
import { ZonaFormDialog } from '@/components/shared/form-dialogs/ZonaFormDialog';

interface EspacioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  space: ParkingSpace | null;
  zones: ParkingZone[];
  onSave: (data: Partial<ParkingSpace>) => Promise<void>;
  organizationId?: number;
  branchId?: number;
  onZoneCreated?: (zone: ParkingZone) => void;
}

const spaceTypes: { value: SpaceType; label: string }[] = [
  { value: 'car', label: 'Automóvil' },
  { value: 'motorcycle', label: 'Motocicleta' },
  { value: 'truck', label: 'Camión' },
  { value: 'bicycle', label: 'Bicicleta' },
];

const spaceStates: { value: SpaceState; label: string }[] = [
  { value: 'free', label: 'Libre' },
  { value: 'occupied', label: 'Ocupado' },
  { value: 'reserved', label: 'Reservado' },
  { value: 'maintenance', label: 'Mantenimiento' },
  { value: 'disabled', label: 'Deshabilitado' },
];

export function EspacioDialog({
  open,
  onOpenChange,
  space,
  zones,
  onSave,
  organizationId,
  branchId,
  onZoneCreated,
}: EspacioDialogProps) {
  const [label, setLabel] = useState('');
  const [type, setType] = useState<SpaceType>('car');
  const [state, setState] = useState<SpaceState>('free');
  const [zoneId, setZoneId] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [zonaDialogOpen, setZonaDialogOpen] = useState(false);

  const isEditing = !!space;

  useEffect(() => {
    if (space) {
      setLabel(space.label);
      setType(space.type);
      setState(space.state);
      setZoneId(space.zone_id || '');
    } else {
      setLabel('');
      setType('car');
      setState('free');
      setZoneId('');
    }
  }, [space, open]);

  const handleSubmit = async () => {
    if (!label.trim()) return;

    setIsSaving(true);
    try {
      await onSave({
        id: space?.id,
        label: label.trim(),
        type,
        state,
        zone_id: zoneId || null,
      });
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <ParkingSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            {isEditing ? 'Editar Espacio' : 'Nuevo Espacio'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="label">Etiqueta / Número</Label>
            <Input
              id="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ej: A-01, P1-001"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Tipo de Vehículo</Label>
            <Select value={type} onValueChange={(v) => setType(v as SpaceType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {spaceTypes.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="zone">Zona</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setZonaDialogOpen(true)}
                className="h-8 text-xs bg-white dark:bg-gray-800"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Crear Zona
              </Button>
            </div>
            <Select 
              value={zoneId || '__none__'} 
              onValueChange={(v) => setZoneId(v === '__none__' ? '' : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar zona" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sin zona</SelectItem>
                {zones.map((z) => (
                  <SelectItem key={z.id} value={z.id}>
                    {z.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {zones.length === 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                No hay zonas. Crea una con el botón superior.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="state">Estado</Label>
            <Select value={state} onValueChange={(v) => setState(v as SpaceState)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {spaceStates.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSaving || !label.trim()}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEditing ? 'Guardar' : 'Crear'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <ZonaFormDialog
      open={zonaDialogOpen}
      onOpenChange={setZonaDialogOpen}
      organizationId={organizationId}
      branchId={branchId}
      onCreated={(z) => {
        onZoneCreated?.(z);
        setZoneId(z.id);
        setZonaDialogOpen(false);
      }}
    />
    </>
  );
}
