'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { transportService, TransportStop } from '@/lib/services/transportService';
import { 
  StopsHeader, 
  StopsList, 
  StopDialog,
  StopsMap,
  ImportStopsDialog
} from '@/components/transporte/paradas';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type ViewMode = 'list' | 'map';

export default function ParadasPage() {
  const { toast } = useToast();
  const { organization } = useOrganization();
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [stops, setStops] = useState<TransportStop[]>([]);
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  
  // Filtros y vista
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  
  // Dialogs
  const [showDialog, setShowDialog] = useState(false);
  const [selectedStop, setSelectedStop] = useState<TransportStop | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [stopToDelete, setStopToDelete] = useState<TransportStop | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [mapSelectedStop, setMapSelectedStop] = useState<TransportStop | null>(null);

  const loadData = useCallback(async () => {
    if (!organization?.id) return;
    
    setIsLoading(true);
    try {
      const [stopsData, branchesData] = await Promise.all([
        transportService.getStops(organization.id),
        transportService.getBranches(organization.id),
      ]);
      setStops(stopsData);
      setBranches(branchesData);
    } catch (error) {
      console.error('Error cargando paradas:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las paradas',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredStops = stops.filter((s) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      s.name.toLowerCase().includes(term) ||
      s.code.toLowerCase().includes(term) ||
      (s.city && s.city.toLowerCase().includes(term));
    const matchesType = typeFilter === 'all' || s.stop_type === typeFilter;
    return matchesSearch && matchesType;
  });

  const handleNew = () => {
    setSelectedStop(null);
    setShowDialog(true);
  };

  const handleEdit = (stop: TransportStop) => {
    setSelectedStop(stop);
    setShowDialog(true);
  };

  const handleDelete = (stop: TransportStop) => {
    setStopToDelete(stop);
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!stopToDelete) return;
    
    try {
      await transportService.deleteStop(stopToDelete.id);
      toast({
        title: 'Éxito',
        description: 'Parada eliminada correctamente',
      });
      loadData();
    } catch (error) {
      console.error('Error eliminando parada:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la parada',
        variant: 'destructive',
      });
    } finally {
      setShowDeleteDialog(false);
      setStopToDelete(null);
    }
  };

  const handleSave = async (data: Partial<TransportStop>) => {
    if (!organization?.id) return;
    
    setIsSaving(true);
    try {
      if (selectedStop) {
        await transportService.updateStop(selectedStop.id, data);
        toast({
          title: 'Éxito',
          description: 'Parada actualizada correctamente',
        });
      } else {
        await transportService.createStop({
          ...data,
          organization_id: organization.id,
        });
        toast({
          title: 'Éxito',
          description: 'Parada creada correctamente',
        });
      }
      setShowDialog(false);
      loadData();
    } catch (error) {
      console.error('Error guardando parada:', error);
      toast({
        title: 'Error',
        description: 'No se pudo guardar la parada',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDuplicate = (stop: TransportStop) => {
    setSelectedStop({
      ...stop,
      id: '',
      code: `${stop.code}-COPIA`,
      name: `${stop.name} (Copia)`,
    });
    setShowDialog(true);
  };

  const handleShowOnMap = (stop: TransportStop) => {
    setViewMode('map');
    setMapSelectedStop(stop);
  };

  const handleImport = async (stopsData: Partial<TransportStop>[]) => {
    if (!organization?.id) return { success: 0, errors: [] };
    
    let successCount = 0;
    const errors: string[] = [];

    for (const stopData of stopsData) {
      try {
        await transportService.createStop({
          ...stopData,
          organization_id: organization.id,
        });
        successCount++;
      } catch (error) {
        errors.push(`Error al importar ${stopData.name}: ${String(error)}`);
      }
    }

    if (successCount > 0) {
      loadData();
    }

    return { success: successCount, errors };
  };

  return (
    <div className="p-6 space-y-6">
      <StopsHeader
        searchTerm={searchTerm}
        typeFilter={typeFilter}
        viewMode={viewMode}
        onSearchChange={setSearchTerm}
        onTypeChange={setTypeFilter}
        onViewModeChange={setViewMode}
        onNew={handleNew}
        onImport={() => setShowImportDialog(true)}
        onRefresh={loadData}
        isLoading={isLoading}
      />

      {viewMode === 'list' ? (
        <StopsList
          stops={filteredStops}
          isLoading={isLoading}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onDuplicate={handleDuplicate}
          onShowOnMap={handleShowOnMap}
        />
      ) : (
        <StopsMap
          stops={filteredStops}
          isLoading={isLoading}
          selectedStop={mapSelectedStop}
          onStopClick={setMapSelectedStop}
          onEditStop={handleEdit}
        />
      )}

      <StopDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        stop={selectedStop}
        branches={branches}
        onSave={handleSave}
        isSaving={isSaving}
      />

      <ImportStopsDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        onImport={handleImport}
      />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar parada?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará la parada
              <strong> {stopToDelete?.name}</strong> permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
