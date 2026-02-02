'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import {
  EspaciosHeader,
  EspaciosFilters,
  EspaciosStats,
  EspaciosGrid,
  EspacioDialog,
  BulkActionsBar,
  ZoneAvailability,
  ImportDialog,
  ParkingSpace,
  ParkingZone,
  SpaceFilters,
  SpaceStats,
  SpaceState,
  ImportedSpace,
} from '@/components/parking/espacios';
import { Loader2, Building2 } from 'lucide-react';

const defaultFilters: SpaceFilters = {
  search: '',
  zone_id: '',
  type: '',
  state: '',
};

const defaultStats: SpaceStats = {
  total: 0,
  free: 0,
  occupied: 0,
  reserved: 0,
  maintenance: 0,
  byType: { car: 0, motorcycle: 0, truck: 0, bicycle: 0 },
  byZone: {},
};

export default function ParkingEspaciosPage() {
  const { organization } = useOrganization();
  const { toast } = useToast();

  const [branchId, setBranchId] = useState<number | null>(null);
  const [spaces, setSpaces] = useState<ParkingSpace[]>([]);
  const [zones, setZones] = useState<ParkingZone[]>([]);
  const [stats, setStats] = useState<SpaceStats>(defaultStats);
  const [filters, setFilters] = useState<SpaceFilters>(defaultFilters);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isLoading, setIsLoading] = useState(true);

  const [selectedSpaces, setSelectedSpaces] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [editingSpace, setEditingSpace] = useState<ParkingSpace | null>(null);

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

    try {
      const { data, error } = await supabase
        .from('parking_zones')
        .select('*')
        .eq('branch_id', branchId)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setZones(data || []);
    } catch (err) {
      console.error('Error loading zones:', err);
    }
  }, [branchId]);

  const loadSpaces = useCallback(async () => {
    if (!branchId) return;

    setIsLoading(true);
    try {
      let query = supabase
        .from('parking_spaces')
        .select(`
          *,
          parking_zones (
            id,
            name,
            is_vip,
            is_covered
          )
        `)
        .eq('branch_id', branchId)
        .order('label');

      if (filters.search) {
        query = query.ilike('label', `%${filters.search}%`);
      }
      if (filters.zone_id) {
        query = query.eq('zone_id', filters.zone_id);
      }
      if (filters.type) {
        query = query.eq('type', filters.type);
      }
      if (filters.state) {
        query = query.eq('state', filters.state);
      }

      const { data, error } = await query;

      if (error) throw error;
      setSpaces(data || []);

      // Calcular estadísticas
      const allSpaces = data || [];
      const newStats: SpaceStats = {
        total: allSpaces.length,
        free: allSpaces.filter((s) => s.state === 'free').length,
        occupied: allSpaces.filter((s) => s.state === 'occupied').length,
        reserved: allSpaces.filter((s) => s.state === 'reserved').length,
        maintenance: allSpaces.filter((s) => s.state === 'maintenance' || s.state === 'disabled').length,
        byType: {
          car: allSpaces.filter((s) => s.type === 'car').length,
          motorcycle: allSpaces.filter((s) => s.type === 'motorcycle').length,
          truck: allSpaces.filter((s) => s.type === 'truck').length,
          bicycle: allSpaces.filter((s) => s.type === 'bicycle').length,
        },
        byZone: {},
      };

      // Estadísticas por zona
      allSpaces.forEach((space) => {
        const zoneId = space.zone_id || 'no-zone';
        if (!newStats.byZone[zoneId]) {
          newStats.byZone[zoneId] = { total: 0, occupied: 0 };
        }
        newStats.byZone[zoneId].total++;
        if (space.state === 'occupied') {
          newStats.byZone[zoneId].occupied++;
        }
      });

      setStats(newStats);
    } catch (err) {
      console.error('Error loading spaces:', err);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los espacios',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [branchId, filters, toast]);

  useEffect(() => {
    loadZones();
  }, [loadZones]);

  useEffect(() => {
    loadSpaces();
  }, [loadSpaces]);

  const handleRefresh = () => {
    loadZones();
    loadSpaces();
  };

  const handleAdd = () => {
    setEditingSpace(null);
    setDialogOpen(true);
  };

  const handleEdit = (space: ParkingSpace) => {
    setEditingSpace(space);
    setDialogOpen(true);
  };

  const handleDuplicate = async (space: ParkingSpace) => {
    if (!branchId) return;

    try {
      const { error } = await supabase
        .from('parking_spaces')
        .insert({
          branch_id: branchId,
          label: `${space.label}-copia`,
          type: space.type,
          state: 'free',
          zone_id: space.zone_id,
        });

      if (error) throw error;

      toast({ title: 'Espacio duplicado' });
      loadSpaces();
    } catch (err) {
      console.error('Error duplicating space:', err);
      toast({
        title: 'Error',
        description: 'No se pudo duplicar el espacio',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (space: ParkingSpace) => {
    try {
      const { error } = await supabase
        .from('parking_spaces')
        .delete()
        .eq('id', space.id);

      if (error) throw error;

      toast({ title: 'Espacio eliminado' });
      loadSpaces();
    } catch (err) {
      console.error('Error deleting space:', err);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el espacio',
        variant: 'destructive',
      });
    }
  };

  const handleSaveSpace = async (data: Partial<ParkingSpace>) => {
    if (!branchId) return;

    try {
      if (data.id) {
        const { error } = await supabase
          .from('parking_spaces')
          .update({
            label: data.label,
            type: data.type,
            state: data.state,
            zone_id: data.zone_id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', data.id);

        if (error) throw error;
        toast({ title: 'Espacio actualizado' });
      } else {
        const { error } = await supabase
          .from('parking_spaces')
          .insert({
            branch_id: branchId,
            label: data.label,
            type: data.type,
            state: data.state || 'free',
            zone_id: data.zone_id,
          });

        if (error) throw error;
        toast({ title: 'Espacio creado' });
      }

      loadSpaces();
    } catch (err) {
      console.error('Error saving space:', err);
      toast({
        title: 'Error',
        description: 'No se pudo guardar el espacio',
        variant: 'destructive',
      });
      throw err;
    }
  };

  const handleSelectSpace = (id: string, selected: boolean) => {
    setSelectedSpaces((prev) =>
      selected ? [...prev, id] : prev.filter((s) => s !== id)
    );
  };

  const handleBulkChangeState = async (state: SpaceState) => {
    if (selectedSpaces.length === 0) return;

    try {
      const { error } = await supabase
        .from('parking_spaces')
        .update({ state, updated_at: new Date().toISOString() })
        .in('id', selectedSpaces);

      if (error) throw error;

      toast({ title: `${selectedSpaces.length} espacios actualizados` });
      setSelectedSpaces([]);
      loadSpaces();
    } catch (err) {
      console.error('Error updating spaces:', err);
      toast({
        title: 'Error',
        description: 'No se pudieron actualizar los espacios',
        variant: 'destructive',
      });
    }
  };

  const handleBulkAssignZone = async (zoneId: string) => {
    if (selectedSpaces.length === 0) return;

    try {
      const { error } = await supabase
        .from('parking_spaces')
        .update({ 
          zone_id: zoneId === 'none' ? null : zoneId, 
          updated_at: new Date().toISOString() 
        })
        .in('id', selectedSpaces);

      if (error) throw error;

      toast({ title: `${selectedSpaces.length} espacios actualizados` });
      setSelectedSpaces([]);
      loadSpaces();
    } catch (err) {
      console.error('Error assigning zone:', err);
      toast({
        title: 'Error',
        description: 'No se pudo asignar la zona',
        variant: 'destructive',
      });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedSpaces.length === 0) return;

    try {
      const { error } = await supabase
        .from('parking_spaces')
        .delete()
        .in('id', selectedSpaces);

      if (error) throw error;

      toast({ title: `${selectedSpaces.length} espacios eliminados` });
      setSelectedSpaces([]);
      loadSpaces();
    } catch (err) {
      console.error('Error deleting spaces:', err);
      toast({
        title: 'Error',
        description: 'No se pudieron eliminar los espacios',
        variant: 'destructive',
      });
    }
  };

  const handleImport = () => {
    setImportDialogOpen(true);
  };

  const handleImportSpaces = async (importedSpaces: ImportedSpace[]): Promise<{ success: number; errors: number }> => {
    if (!branchId) return { success: 0, errors: importedSpaces.length };

    let success = 0;
    let errors = 0;

    for (const space of importedSpaces) {
      try {
        const { error } = await supabase
          .from('parking_spaces')
          .insert({
            branch_id: branchId,
            label: space.label,
            type: space.type,
            state: space.state,
            zone_id: space.zone_id || null,
          });

        if (error) {
          console.error('Error importing space:', error);
          errors++;
        } else {
          success++;
        }
      } catch (err) {
        console.error('Error importing space:', err);
        errors++;
      }
    }

    if (success > 0) {
      toast({ title: `${success} espacios importados correctamente` });
      loadSpaces();
    }

    return { success, errors };
  };

  const handleExport = () => {
    const csvContent = [
      ['Etiqueta', 'Tipo', 'Estado', 'Zona'].join(','),
      ...spaces.map((s) =>
        [s.label, s.type, s.state, s.parking_zones?.name || ''].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `espacios-parking-${new Date().toISOString().split('T')[0]}.csv`;
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
            Para gestionar los espacios de parqueo, primero selecciona una organización.
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
            Se requiere una sucursal configurada para gestionar los espacios.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <EspaciosHeader
        onRefresh={handleRefresh}
        onAdd={handleAdd}
        onImport={handleImport}
        onExport={handleExport}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        isLoading={isLoading}
      />

      <EspaciosStats stats={stats} isLoading={isLoading} />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-4">
          <EspaciosFilters
            filters={filters}
            zones={zones}
            onFiltersChange={setFilters}
            onClear={() => setFilters(defaultFilters)}
          />

          <EspaciosGrid
            spaces={spaces}
            selectedSpaces={selectedSpaces}
            onSelectSpace={handleSelectSpace}
            onEdit={handleEdit}
            onDuplicate={handleDuplicate}
            onDelete={handleDelete}
            isLoading={isLoading}
            viewMode={viewMode}
          />
        </div>

        <div>
          <ZoneAvailability zones={zones} stats={stats} isLoading={isLoading} />
        </div>
      </div>

      <EspacioDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        space={editingSpace}
        zones={zones}
        onSave={handleSaveSpace}
      />

      <BulkActionsBar
        selectedCount={selectedSpaces.length}
        zones={zones}
        onClearSelection={() => setSelectedSpaces([])}
        onChangeState={handleBulkChangeState}
        onAssignZone={handleBulkAssignZone}
        onDelete={handleBulkDelete}
      />

      <ImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        zones={zones}
        onImport={handleImportSpaces}
      />
    </div>
  );
}
