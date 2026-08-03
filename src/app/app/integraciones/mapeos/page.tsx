'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import {
  integrationsService,
  IntegrationConnection,
  IntegrationMapping,
} from '@/lib/services/integrationsService';
import {
  MapeosHeader,
  MapeosFilters,
  MapeosList,
  MappingDialog,
  MappingFormData,
} from '@/components/integraciones/mapeos';
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

export default function MapeosPage() {
  const { organization } = useOrganization();
  const { toast } = useToast();

  // Estados principales
  const [mappings, setMappings] = useState<IntegrationMapping[]>([]);
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [externalTypes, setExternalTypes] = useState<string[]>([]);
  const [internalTables, setInternalTables] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalMappings, setTotalMappings] = useState(0);
  const [deletedCount, setDeletedCount] = useState(0);

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(50);

  // Filtros
  const [filters, setFilters] = useState({
    connectionId: 'all',
    externalType: 'all',
    internalTable: 'all',
  });
  const [showDeleted, setShowDeleted] = useState(false);

  // Dialogs
  const [mappingDialogOpen, setMappingDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedMapping, setSelectedMapping] = useState<IntegrationMapping | null>(null);

  // Cargar datos
  const loadData = useCallback(async () => {
    if (!organization?.id) return;

    try {
      const offset = (currentPage - 1) * pageSize;

      // Preparar filtros para la API
      const apiFilters: any = { showDeleted };
      if (filters.connectionId !== 'all') apiFilters.connectionId = filters.connectionId;
      if (filters.externalType !== 'all') apiFilters.externalType = filters.externalType;
      if (filters.internalTable !== 'all') apiFilters.internalTable = filters.internalTable;

      const [mappingsResult, connectionsData, typesData, deletedResult] = await Promise.all([
        integrationsService.getMappings(organization.id, apiFilters, pageSize, offset),
        integrationsService.getConnections(organization.id),
        integrationsService.getMappingTypes(organization.id),
        integrationsService.getMappings(organization.id, { showDeleted: true }, 1000, 0),
      ]);

      setMappings(mappingsResult.data);
      setTotalMappings(mappingsResult.total);
      setConnections(connectionsData);
      setExternalTypes(typesData.externalTypes);
      setInternalTables(typesData.internalTables);
      
      // Contar eliminados
      const deleted = deletedResult.data.filter(m => m.deleted_at).length;
      setDeletedCount(deleted);
    } catch (error) {
      console.error('Error loading mappings:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudieron cargar los mapeos',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organization?.id, currentPage, pageSize, filters, showDeleted, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handlers
  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setFilters({
      connectionId: 'all',
      externalType: 'all',
      internalTable: 'all',
    });
    setCurrentPage(1);
  };

  const handleNewMapping = () => {
    setSelectedMapping(null);
    setMappingDialogOpen(true);
  };

  const handleEdit = (mapping: IntegrationMapping) => {
    setSelectedMapping(mapping);
    setMappingDialogOpen(true);
  };

  const handleSaveMapping = async (data: MappingFormData): Promise<boolean> => {
    if (selectedMapping) {
      // Editar
      const success = await integrationsService.updateMapping(selectedMapping.id, {
        external_type: data.externalType,
        external_id: data.externalId,
        internal_table: data.internalTable,
        internal_id: data.internalId,
      });

      if (success) {
        toast({
          title: 'Mapeo actualizado',
          description: 'Los cambios se han guardado correctamente',
        });
        loadData();
        return true;
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'No se pudo actualizar el mapeo',
        });
        return false;
      }
    } else {
      // Crear
      const result = await integrationsService.createMapping(data.connectionId, {
        external_type: data.externalType,
        external_id: data.externalId,
        internal_table: data.internalTable,
        internal_id: data.internalId,
      });

      if (result) {
        toast({
          title: 'Mapeo creado',
          description: 'El mapeo se ha creado correctamente',
        });
        loadData();
        return true;
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'No se pudo crear el mapeo',
        });
        return false;
      }
    }
  };

  const handleDuplicate = async (mapping: IntegrationMapping) => {
    const result = await integrationsService.duplicateMapping(mapping.id);

    if (result) {
      toast({
        title: 'Mapeo duplicado',
        description: 'Se ha creado una copia del mapeo',
      });
      loadData();
    } else {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo duplicar el mapeo',
      });
    }
  };

  const handleRevalidate = async (mapping: IntegrationMapping) => {
    const success = await integrationsService.revalidateMapping(mapping.id);

    if (success) {
      toast({
        title: 'Mapeo revalidado',
        description: 'Se ha actualizado la marca de tiempo',
      });
      loadData();
    } else {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo revalidar el mapeo',
      });
    }
  };

  const handleDelete = (mapping: IntegrationMapping) => {
    setSelectedMapping(mapping);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!selectedMapping) return;

    const success = await integrationsService.deleteMapping(selectedMapping.id);

    if (success) {
      toast({
        title: 'Mapeo eliminado',
        description: 'El mapeo ha sido marcado como eliminado',
      });
      loadData();
    } else {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo eliminar el mapeo',
      });
    }

    setDeleteDialogOpen(false);
    setSelectedMapping(null);
  };

  const handleRestore = async (mapping: IntegrationMapping) => {
    const success = await integrationsService.restoreMapping(mapping.id);

    if (success) {
      toast({
        title: 'Mapeo restaurado',
        description: 'El mapeo ha sido restaurado correctamente',
      });
      loadData();
    } else {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo restaurar el mapeo',
      });
    }
  };

  const handleImport = () => {
    toast({
      title: 'Importación',
      description: 'Funcionalidad de importación próximamente disponible',
    });
  };

  // Skeleton de carga
  if (loading) {
    return (
      <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-950">
        <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 p-6">
          <div className="animate-pulse space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 bg-gray-200 dark:bg-gray-700 rounded-xl" />
              <div className="space-y-2">
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-48" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-64" />
              </div>
            </div>
          </div>
        </div>
        <div className="flex-1 p-6">
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 animate-pulse"
              >
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <MapeosHeader
        totalMappings={totalMappings}
        deletedCount={deletedCount}
        showDeleted={showDeleted}
        onShowDeletedChange={setShowDeleted}
        onRefresh={handleRefresh}
        onNewMapping={handleNewMapping}
        onImport={handleImport}
        refreshing={refreshing}
      />

      {/* Filtros */}
      <MapeosFilters
        connections={connections}
        externalTypes={externalTypes}
        internalTables={internalTables}
        filters={filters}
        onFilterChange={handleFilterChange}
        onClearFilters={handleClearFilters}
      />

      {/* Lista de mapeos */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 sm:px-6 lg:px-8 py-6">
          <MapeosList
            mappings={mappings}
            loading={refreshing}
            onEdit={handleEdit}
            onDuplicate={handleDuplicate}
            onRevalidate={handleRevalidate}
            onDelete={handleDelete}
            onRestore={handleRestore}
          />
        </div>
      </div>

      {/* Dialog de crear/editar mapeo */}
      <MappingDialog
        open={mappingDialogOpen}
        onOpenChange={setMappingDialogOpen}
        connections={connections}
        mapping={selectedMapping}
        onSave={handleSaveMapping}
      />

      {/* Dialog de confirmación de eliminación */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="dark:bg-gray-900 dark:border-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white">
              ¿Eliminar mapeo?
            </AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              El mapeo será marcado como eliminado pero podrás restaurarlo más tarde si activas
              &quot;Mostrar eliminados&quot;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:border-gray-700 dark:text-gray-300">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
