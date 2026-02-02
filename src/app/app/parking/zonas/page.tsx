'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import {
  ZonasHeader,
  ZonasStats,
  ZonasFilters,
  ZonasList,
  ZonaDialog,
  ParkingZone,
  ZoneFilters,
  ZoneStats,
} from '@/components/parking/zonas';
import { Building2 } from 'lucide-react';

const defaultFilters: ZoneFilters = {
  search: '',
  is_active: '',
  is_covered: '',
  is_vip: '',
};

const defaultStats: ZoneStats = {
  total: 0,
  active: 0,
  inactive: 0,
  totalCapacity: 0,
  covered: 0,
  vip: 0,
};

export default function ParkingZonasPage() {
  const { organization } = useOrganization();
  const { toast } = useToast();

  const [branchId, setBranchId] = useState<number | null>(null);
  const [zones, setZones] = useState<ParkingZone[]>([]);
  const [stats, setStats] = useState<ZoneStats>(defaultStats);
  const [filters, setFilters] = useState<ZoneFilters>(defaultFilters);
  const [isLoading, setIsLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<ParkingZone | null>(null);

  // Obtener el branch de la organización actual
  useEffect(() => {
    async function fetchBranch() {
      if (!organization?.id) return;
      
      const { data, error } = await supabase
        .from('branches')
        .select('id')
        .eq('organization_id', organization.id)
        .order('id', { ascending: true })
        .limit(1);
      
      if (error) {
        console.error('Error obteniendo branch:', error);
        setIsLoading(false);
        return;
      }
      
      const firstBranch = data?.[0];
      setBranchId(firstBranch?.id || null);
      
      if (!firstBranch?.id) {
        setIsLoading(false);
      }
    }

    fetchBranch();
  }, [organization?.id]);

  const loadZones = useCallback(async () => {
    if (!branchId) return;

    setIsLoading(true);
    try {
      let query = supabase
        .from('parking_zones')
        .select('*')
        .eq('branch_id', branchId)
        .order('name');

      if (filters.search) {
        query = query.ilike('name', `%${filters.search}%`);
      }
      if (filters.is_active) {
        query = query.eq('is_active', filters.is_active === 'true');
      }
      if (filters.is_covered) {
        query = query.eq('is_covered', filters.is_covered === 'true');
      }
      if (filters.is_vip) {
        query = query.eq('is_vip', filters.is_vip === 'true');
      }

      const { data, error } = await query;

      if (error) throw error;

      // Obtener conteo de espacios por zona
      const { data: spaceCounts } = await supabase
        .from('parking_spaces')
        .select('zone_id')
        .eq('branch_id', branchId);

      const zoneSpaceCounts: Record<string, number> = {};
      (spaceCounts || []).forEach((space) => {
        if (space.zone_id) {
          zoneSpaceCounts[space.zone_id] = (zoneSpaceCounts[space.zone_id] || 0) + 1;
        }
      });

      const zonesWithCounts = (data || []).map((zone) => ({
        ...zone,
        spaces_count: zoneSpaceCounts[zone.id] || 0,
      }));

      setZones(zonesWithCounts);

      // Calcular estadísticas
      const allZones = data || [];
      const newStats: ZoneStats = {
        total: allZones.length,
        active: allZones.filter((z) => z.is_active).length,
        inactive: allZones.filter((z) => !z.is_active).length,
        totalCapacity: allZones.reduce((sum, z) => sum + (z.capacity || 0), 0),
        covered: allZones.filter((z) => z.is_covered).length,
        vip: allZones.filter((z) => z.is_vip).length,
      };

      setStats(newStats);
    } catch (err) {
      console.error('Error loading zones:', err);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las zonas',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [branchId, filters, toast]);

  useEffect(() => {
    loadZones();
  }, [loadZones]);

  const handleRefresh = () => {
    loadZones();
  };

  const handleAdd = () => {
    setEditingZone(null);
    setDialogOpen(true);
  };

  const handleEdit = (zone: ParkingZone) => {
    setEditingZone(zone);
    setDialogOpen(true);
  };

  const handleDuplicate = async (zone: ParkingZone) => {
    if (!branchId) return;

    try {
      const { error } = await supabase
        .from('parking_zones')
        .insert({
          branch_id: branchId,
          name: `${zone.name} (copia)`,
          description: zone.description,
          capacity: zone.capacity,
          rate_multiplier: zone.rate_multiplier,
          is_covered: zone.is_covered,
          is_vip: zone.is_vip,
          is_active: false,
        });

      if (error) throw error;

      toast({ title: 'Zona duplicada' });
      loadZones();
    } catch (err) {
      console.error('Error duplicating zone:', err);
      toast({
        title: 'Error',
        description: 'No se pudo duplicar la zona',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (zone: ParkingZone) => {
    try {
      // Verificar si hay espacios asignados a la zona
      const { data: spaces } = await supabase
        .from('parking_spaces')
        .select('id')
        .eq('zone_id', zone.id)
        .limit(1);

      if (spaces && spaces.length > 0) {
        toast({
          title: 'No se puede eliminar',
          description: 'La zona tiene espacios asignados. Reasigna o elimina los espacios primero.',
          variant: 'destructive',
        });
        return;
      }

      const { error } = await supabase
        .from('parking_zones')
        .delete()
        .eq('id', zone.id);

      if (error) throw error;

      toast({ title: 'Zona eliminada' });
      loadZones();
    } catch (err) {
      console.error('Error deleting zone:', err);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la zona',
        variant: 'destructive',
      });
    }
  };

  const handleToggleActive = async (zone: ParkingZone) => {
    try {
      const { error } = await supabase
        .from('parking_zones')
        .update({
          is_active: !zone.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', zone.id);

      if (error) throw error;

      toast({
        title: zone.is_active ? 'Zona desactivada' : 'Zona activada',
      });
      loadZones();
    } catch (err) {
      console.error('Error toggling zone:', err);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la zona',
        variant: 'destructive',
      });
    }
  };

  const handleSaveZone = async (data: Partial<ParkingZone>) => {
    if (!branchId) return;

    try {
      if (data.id) {
        const { error } = await supabase
          .from('parking_zones')
          .update({
            name: data.name,
            description: data.description,
            capacity: data.capacity,
            rate_multiplier: data.rate_multiplier,
            is_covered: data.is_covered,
            is_vip: data.is_vip,
            is_active: data.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq('id', data.id);

        if (error) throw error;
        toast({ title: 'Zona actualizada' });
      } else {
        const { error } = await supabase
          .from('parking_zones')
          .insert({
            branch_id: branchId,
            name: data.name,
            description: data.description,
            capacity: data.capacity || 10,
            rate_multiplier: data.rate_multiplier || 1,
            is_covered: data.is_covered || false,
            is_vip: data.is_vip || false,
            is_active: data.is_active !== false,
          });

        if (error) throw error;
        toast({ title: 'Zona creada' });
      }

      loadZones();
    } catch (err) {
      console.error('Error saving zone:', err);
      toast({
        title: 'Error',
        description: 'No se pudo guardar la zona',
        variant: 'destructive',
      });
      throw err;
    }
  };

  const handleImport = () => {
    toast({ title: 'Función de importación próximamente' });
  };

  const handleExport = () => {
    const csvContent = [
      ['Nombre', 'Descripción', 'Capacidad', 'Multiplicador', 'Cubierta', 'VIP', 'Activa'].join(','),
      ...zones.map((z) =>
        [
          z.name,
          z.description || '',
          z.capacity,
          z.rate_multiplier,
          z.is_covered ? 'Sí' : 'No',
          z.is_vip ? 'Sí' : 'No',
          z.is_active ? 'Sí' : 'No',
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `zonas-parking-${new Date().toISOString().split('T')[0]}.csv`;
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
            Para gestionar las zonas de parqueo, primero selecciona una organización.
          </p>
        </div>
      </div>
    );
  }

  if (!branchId) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center min-h-[400px] bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8">
          <Building2 className="h-16 w-16 text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Configura una sucursal
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-center">
            Se requiere una sucursal configurada para gestionar las zonas.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <ZonasHeader
        onRefresh={handleRefresh}
        onAdd={handleAdd}
        onImport={handleImport}
        onExport={handleExport}
        isLoading={isLoading}
      />

      <ZonasStats stats={stats} isLoading={isLoading} />

      <ZonasFilters
        filters={filters}
        onFiltersChange={setFilters}
        onClear={() => setFilters(defaultFilters)}
      />

      <ZonasList
        zones={zones}
        onEdit={handleEdit}
        onDuplicate={handleDuplicate}
        onDelete={handleDelete}
        onToggleActive={handleToggleActive}
        isLoading={isLoading}
      />

      <ZonaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        zone={editingZone}
        onSave={handleSaveZone}
      />
    </div>
  );
}
