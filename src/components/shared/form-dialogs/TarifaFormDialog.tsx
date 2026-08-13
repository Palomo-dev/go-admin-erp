'use client';

import React from 'react';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { TarifaDialog } from '@/components/parking/tarifas/TarifaDialog';
import type { ParkingRate, VehicleType } from '@/components/parking/tarifas/types';

interface TarifaFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: number;
  /** Se llama con la tarifa creada; el diálogo se cierra automáticamente */
  onCreated: (rate: ParkingRate) => void;
  /** Preseleccionar el tipo de vehículo al crear desde ExitDialog */
  defaultVehicleType?: string;
}

/**
 * Diálogo compartido que reutiliza el formulario COMPLETO de TarifaDialog.
 * Inserta directamente en Supabase (parking_rates) y notifica vía onCreated.
 */
export function TarifaFormDialog({
  open,
  onOpenChange,
  organizationId,
  onCreated,
  defaultVehicleType,
}: TarifaFormDialogProps) {
  const { toast } = useToast();

  const handleSave = async (data: Partial<ParkingRate>): Promise<void> => {
    if (!organizationId) return;

    try {
      const insertPayload = {
        organization_id: organizationId,
        rate_name: data.rate_name,
        vehicle_type: data.vehicle_type,
        unit: data.unit,
        price: data.price,
        grace_period_min: data.grace_period_min ?? 0,
        lost_ticket_fee: data.lost_ticket_fee ?? null,
        is_active: data.is_active !== false,
      };

      const { data: newRate, error } = await supabase
        .from('parking_rates')
        .insert(insertPayload)
        .select('*')
        .single();

      if (error) throw error;

      toast({
        title: 'Tarifa creada',
        description: `Tarifa "${newRate.rate_name}" creada correctamente.`,
      });

      onCreated(newRate as ParkingRate);
      onOpenChange(false);
    } catch (error) {
      console.error('Error creando tarifa:', error);
      toast({
        title: 'Error',
        description: 'No se pudo crear la tarifa.',
        variant: 'destructive',
      });
      throw error;
    }
  };

  return (
    <TarifaDialog
      open={open}
      onOpenChange={onOpenChange}
      rate={null}
      onSave={handleSave}
      defaultVehicleType={defaultVehicleType as VehicleType | undefined}
    />
  );
}

export default TarifaFormDialog;
