'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import {
  TarifasHeader,
  TarifasStats,
  TarifasFilters,
  TarifasList,
  TarifaDialog,
  ImportDialog,
  ParkingRate,
  RateFilters,
  RateStats,
  ImportedRate,
} from '@/components/parking/tarifas';
import { Building2 } from 'lucide-react';

const defaultFilters: RateFilters = {
  search: '',
  vehicle_type: '',
  unit: '',
  is_active: '',
};

const defaultStats: RateStats = {
  total: 0,
  active: 0,
  inactive: 0,
  byVehicleType: { car: 0, motorcycle: 0, truck: 0, bicycle: 0 },
  byUnit: { minute: 0, hour: 0, day: 0 },
};

export default function ParkingTarifasPage() {
  const { organization } = useOrganization();
  const { toast } = useToast();

  const [rates, setRates] = useState<ParkingRate[]>([]);
  const [stats, setStats] = useState<RateStats>(defaultStats);
  const [filters, setFilters] = useState<RateFilters>(defaultFilters);
  const [isLoading, setIsLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<ParkingRate | null>(null);

  const loadRates = useCallback(async () => {
    if (!organization?.id) return;

    setIsLoading(true);
    try {
      let query = supabase
        .from('parking_rates')
        .select('*')
        .eq('organization_id', organization.id)
        .order('rate_name');

      if (filters.search) {
        query = query.ilike('rate_name', `%${filters.search}%`);
      }
      if (filters.vehicle_type) {
        query = query.eq('vehicle_type', filters.vehicle_type);
      }
      if (filters.unit) {
        query = query.eq('unit', filters.unit);
      }

      const { data, error } = await query;
      if (error) throw error;

      let filteredData = data || [];

      // Filtrar por estado activo (campo que puede no existir)
      if (filters.is_active === 'active') {
        filteredData = filteredData.filter((r) => r.is_active !== false);
      } else if (filters.is_active === 'inactive') {
        filteredData = filteredData.filter((r) => r.is_active === false);
      }

      setRates(filteredData);
      calculateStats(data || []);
    } catch (err) {
      console.error('Error loading rates:', err);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las tarifas',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id, filters, toast]);

  const calculateStats = (allRates: ParkingRate[]) => {
    const newStats: RateStats = {
      total: allRates.length,
      active: allRates.filter((r) => r.is_active !== false).length,
      inactive: allRates.filter((r) => r.is_active === false).length,
      byVehicleType: { car: 0, motorcycle: 0, truck: 0, bicycle: 0 },
      byUnit: { minute: 0, hour: 0, day: 0 },
    };

    allRates.forEach((rate) => {
      if (rate.vehicle_type in newStats.byVehicleType) {
        newStats.byVehicleType[rate.vehicle_type as keyof typeof newStats.byVehicleType]++;
      }
      if (rate.unit in newStats.byUnit) {
        newStats.byUnit[rate.unit as keyof typeof newStats.byUnit]++;
      }
    });

    setStats(newStats);
  };

  useEffect(() => {
    loadRates();
  }, [loadRates]);

  const handleRefresh = () => {
    loadRates();
  };

  const handleAdd = () => {
    setEditingRate(null);
    setDialogOpen(true);
  };

  const handleEdit = (rate: ParkingRate) => {
    setEditingRate(rate);
    setDialogOpen(true);
  };

  const handleDuplicate = (rate: ParkingRate) => {
    setEditingRate({
      ...rate,
      id: '', // Limpiar ID para crear nuevo
      rate_name: `${rate.rate_name} (copia)`,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (rate: ParkingRate) => {
    if (!confirm(`¿Eliminar la tarifa "${rate.rate_name}"?`)) return;

    try {
      const { error } = await supabase
        .from('parking_rates')
        .delete()
        .eq('id', rate.id);

      if (error) throw error;

      toast({ title: 'Tarifa eliminada' });
      loadRates();
    } catch (err) {
      console.error('Error deleting rate:', err);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la tarifa',
        variant: 'destructive',
      });
    }
  };

  const handleToggleActive = async (rate: ParkingRate) => {
    try {
      const newActiveState = rate.is_active === false;
      const { error } = await supabase
        .from('parking_rates')
        .update({
          is_active: newActiveState,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rate.id);

      if (error) throw error;

      toast({
        title: newActiveState ? 'Tarifa activada' : 'Tarifa desactivada',
      });
      loadRates();
    } catch (err) {
      console.error('Error toggling rate:', err);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el estado',
        variant: 'destructive',
      });
    }
  };

  const handleSaveRate = async (data: Partial<ParkingRate>) => {
    if (!organization?.id) return;

    try {
      if (data.id) {
        // Actualizar
        const { error } = await supabase
          .from('parking_rates')
          .update({
            rate_name: data.rate_name,
            vehicle_type: data.vehicle_type,
            unit: data.unit,
            price: data.price,
            grace_period_min: data.grace_period_min,
            lost_ticket_fee: data.lost_ticket_fee,
            is_active: data.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq('id', data.id);

        if (error) throw error;
        toast({ title: 'Tarifa actualizada' });
      } else {
        // Crear nueva
        const { error } = await supabase.from('parking_rates').insert({
          organization_id: organization.id,
          rate_name: data.rate_name,
          vehicle_type: data.vehicle_type,
          unit: data.unit,
          price: data.price,
          grace_period_min: data.grace_period_min,
          lost_ticket_fee: data.lost_ticket_fee,
          is_active: data.is_active !== false,
        });

        if (error) throw error;
        toast({ title: 'Tarifa creada' });
      }

      loadRates();
    } catch (err) {
      console.error('Error saving rate:', err);
      toast({
        title: 'Error',
        description: 'No se pudo guardar la tarifa',
        variant: 'destructive',
      });
      throw err;
    }
  };

  const handleImport = () => {
    setImportDialogOpen(true);
  };

  const handleImportRates = async (
    importedRates: ImportedRate[]
  ): Promise<{ success: number; errors: number }> => {
    if (!organization?.id) return { success: 0, errors: importedRates.length };

    let success = 0;
    let errors = 0;

    for (const rate of importedRates) {
      try {
        const { error } = await supabase.from('parking_rates').insert({
          organization_id: organization.id,
          rate_name: rate.rate_name,
          vehicle_type: rate.vehicle_type,
          unit: rate.unit,
          price: rate.price,
          grace_period_min: rate.grace_period_min,
          lost_ticket_fee: rate.lost_ticket_fee,
          is_active: true,
        });

        if (error) {
          console.error('Error importing rate:', error);
          errors++;
        } else {
          success++;
        }
      } catch (err) {
        console.error('Error importing rate:', err);
        errors++;
      }
    }

    if (success > 0) {
      toast({ title: `${success} tarifas importadas correctamente` });
      loadRates();
    }

    return { success, errors };
  };

  const handleExport = () => {
    const csvContent = [
      ['Nombre', 'Tipo Vehículo', 'Unidad', 'Precio', 'Periodo Gracia', 'Ticket Perdido'].join(','),
      ...rates.map((r) =>
        [
          r.rate_name,
          r.vehicle_type,
          r.unit,
          r.price,
          r.grace_period_min || 0,
          r.lost_ticket_fee || '',
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `tarifas-parking-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  if (!organization?.id) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center min-h-[400px] bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8">
          <Building2 className="h-16 w-16 text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Selecciona una organización
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-center">
            Para gestionar las tarifas de parqueo, primero selecciona una organización.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <TarifasHeader
        onRefresh={handleRefresh}
        onAdd={handleAdd}
        onImport={handleImport}
        onExport={handleExport}
        isLoading={isLoading}
      />

      <TarifasStats stats={stats} isLoading={isLoading} />

      <TarifasFilters
        filters={filters}
        onFiltersChange={setFilters}
        onClear={() => setFilters(defaultFilters)}
      />

      <TarifasList
        rates={rates}
        onEdit={handleEdit}
        onDuplicate={handleDuplicate}
        onDelete={handleDelete}
        onToggleActive={handleToggleActive}
        isLoading={isLoading}
      />

      <TarifaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        rate={editingRate}
        onSave={handleSaveRate}
      />

      <ImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImport={handleImportRates}
      />
    </div>
  );
}
