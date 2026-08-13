'use client';

import React from 'react';
import { supabase } from '@/lib/supabase/config';
import { useToast } from '@/components/ui/use-toast';
import { EspacioDialog } from '@/components/parking/espacios/EspacioDialog';
import { ParkingSpace, ParkingZone, SpaceType } from '@/components/parking/espacios/types';

interface EspacioFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: number;
  branchId: number;
  zones: ParkingZone[];
  /** Se llama con el espacio creado; el diálogo se cierra automáticamente */
  onCreated: (space: ParkingSpace) => void;
  /** Tipo de vehículo por defecto (cuando se invoca desde EntryDialog) */
  defaultType?: SpaceType;
  /** Zona por defecto */
  defaultZoneId?: string;
}

/**
 * Diálogo compartido que reutiliza el formulario COMPLETO de espacio (EspacioDialog).
 * Inserta directamente en Supabase (tabla parking_spaces) y notifica via onCreated.
 * Cualquier cambio en EspacioDialog se refleja aquí automáticamente.
 */
export function EspacioFormDialog({
  open,
  onOpenChange,
  branchId,
  zones,
  onCreated,
}: EspacioFormDialogProps) {
  const { toast } = useToast();

  const handleSave = async (data: Partial<ParkingSpace>) => {
    const { data: newSpace, error } = await supabase
      .from('parking_spaces')
      .insert({
        branch_id: branchId,
        label: data.label,
        type: data.type,
        state: 'free',
        zone_id: data.zone_id,
      })
      .select('*')
      .single();

    if (error) {
      toast({
        title: 'Error',
        description: 'No se pudo crear el espacio.',
        variant: 'destructive',
      });
      throw error;
    }

    toast({ title: 'Espacio creado' });
    onCreated(newSpace as ParkingSpace);
  };

  return (
    <EspacioDialog
      open={open}
      onOpenChange={onOpenChange}
      space={null}
      zones={zones}
      onSave={handleSave}
    />
  );
}

export default EspacioFormDialog;
