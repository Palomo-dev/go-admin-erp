'use client';

import React from 'react';
import { supabase } from '@/lib/supabase/config';
import { useToast } from '@/components/ui/use-toast';
import { ZonaDialog } from '@/components/parking/zonas/ZonaDialog';
import { ParkingZone } from '@/components/parking/zonas/types';

interface ZonaFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId?: number;
  branchId?: number;
  /** Se llama con la zona creada; el diálogo se cierra automáticamente */
  onCreated: (zone: ParkingZone) => void;
}

/**
 * Diálogo compartido que reutiliza el formulario COMPLETO de zona (ZonaDialog).
 * Inserta la zona en Supabase (tabla parking_zones) y notifica vía onCreated.
 * Cualquier cambio en ZonaDialog se refleja aquí automáticamente.
 */
export function ZonaFormDialog({
  open,
  onOpenChange,
  organizationId,
  branchId,
  onCreated,
}: ZonaFormDialogProps) {
  const { toast } = useToast();

  const handleSave = async (data: Partial<ParkingZone>): Promise<void> => {
    if (!branchId) {
      toast({
        title: 'Error',
        description: 'No hay sucursal seleccionada para crear la zona',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { data: newZone, error } = await supabase
        .from('parking_zones')
        .insert({
          branch_id: branchId,
          name: data.name,
          description: data.description,
          capacity: data.capacity || 10,
          rate_multiplier: data.rate_multiplier || 1,
          is_covered: data.is_covered || false,
          is_vip: data.is_vip || false,
          is_active: data.is_active ?? true,
        })
        .select()
        .single();

      if (error) throw error;

      toast({ title: 'Zona creada' });
      onCreated(newZone as ParkingZone);
      onOpenChange(false);
    } catch (err) {
      console.error('Error creating zone:', err);
      toast({
        title: 'Error',
        description: 'No se pudo crear la zona',
        variant: 'destructive',
      });
      throw err;
    }
  };

  // organizationId se conserva para compatibilidad futura (p.ej. validaciones multi-org)
  void organizationId;

  return (
    <ZonaDialog
      open={open}
      onOpenChange={onOpenChange}
      zone={null}
      onSave={handleSave}
    />
  );
}

export default ZonaFormDialog;
