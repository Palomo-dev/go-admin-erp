'use client';

import React, { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';
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
import {
  EspaciosPageHeader,
  EspaciosFilters,
  BulkActionsBar,
  EspaciosGrid,
  EspaciosEmptyState,
  EspaciosLoadingState,
  SpaceDialog,
  CreateSpaceTypeDialog,
  EspaciosPagination,
} from '@/components/pms/espacios';
import { Badge } from '@/components/ui/badge';
import { Layers } from 'lucide-react';
import SpacesService, { type Space, type SpaceType, type SpaceStatus, type SpaceCategory } from '@/lib/services/spacesService';
import { useOrganization } from '@/lib/hooks/useOrganization';

export default function EspaciosPage() {
  const { toast } = useToast();
  const { organization } = useOrganization();

  const [spaces, setSpaces] = useState<Space[]>([]);
  const [spaceTypes, setSpaceTypes] = useState<SpaceType[]>([]);
  const [spaceCategories, setSpaceCategories] = useState<SpaceCategory[]>([]);
  const [floorZones, setFloorZones] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<SpaceStatus | 'all'>('all');
  const [zoneFilter, setZoneFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  
  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(9);
  
  // Selección múltiple
  const [selectedSpaces, setSelectedSpaces] = useState<Set<string>>(new Set());
  
  // Dialogs
  const [showDialog, setShowDialog] = useState(false);
  const [showTypeDialog, setShowTypeDialog] = useState(false);
  const [showMaintenanceDialog, setShowMaintenanceDialog] = useState(false);
  const [showCleaningDialog, setShowCleaningDialog] = useState(false);
  const [editingSpace, setEditingSpace] = useState<Space | null>(null);
  
  // Estados para mantenimiento masivo
  const [maintenanceNotes, setMaintenanceNotes] = useState('');
  const [maintenancePriority, setMaintenancePriority] = useState<'low' | 'med' | 'high'>('med');
  
  // Estados para limpieza masiva
  const [cleaningNotes, setCleaningNotes] = useState('');
  const [cleaningDate, setCleaningDate] = useState(new Date().toISOString().split('T')[0]);

  // Cargar datos iniciales
  useEffect(() => {
    if (organization?.id) {
      loadData();
    }
  }, [organization?.id]);

  const loadData = async () => {
    if (!organization?.id) return;

    try {
      setIsLoading(true);
      const [spacesData, typesData, categoriesData, zonesData] = await Promise.all([
        SpacesService.getSpaces({ branchId: organization.id }),
        SpacesService.getSpaceTypes(organization.id),
        SpacesService.getSpaceCategories(),
        SpacesService.getFloorZones(organization.id),
      ]);

      setSpaces(spacesData);
      setSpaceTypes(typesData);
      setSpaceCategories(categoriesData);
      setFloorZones(zonesData);
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los espacios',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Filtrar espacios
  const filteredSpaces = spaces.filter((space) => {
    const matchesSearch = space.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      space.space_types?.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || space.status === statusFilter;
    const matchesZone = zoneFilter === 'all' || space.floor_zone === zoneFilter;
    const matchesType = typeFilter === 'all' || space.space_type_id === typeFilter;

    return matchesSearch && matchesStatus && matchesZone && matchesType;
  });

  // Calcular paginación
  const totalPages = Math.ceil(filteredSpaces.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedSpaces = filteredSpaces.slice(startIndex, endIndex);

  // Resetear página cuando cambian los filtros
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, zoneFilter, typeFilter, pageSize]);

  // Manejar selección
  const handleSelect = (id: string, selected: boolean) => {
    const newSelected = new Set(selectedSpaces);
    if (selected) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedSpaces(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedSpaces.size === filteredSpaces.length) {
      setSelectedSpaces(new Set());
    } else {
      setSelectedSpaces(new Set(filteredSpaces.map((s) => s.id)));
    }
  };

  // CRUD operations
  const handleSave = async (data: any) => {
    try {
      if (editingSpace) {
        await SpacesService.updateSpace(editingSpace.id, data);
        toast({
          title: 'Éxito',
          description: 'Espacio actualizado correctamente',
        });
      } else {
        await SpacesService.createSpace({
          ...data,
          branch_id: organization!.id,
        });
        toast({
          title: 'Éxito',
          description: 'Espacio creado correctamente',
        });
      }
      
      loadData();
      setEditingSpace(null);
    } catch (error) {
      console.error('Error guardando espacio:', error);
      toast({
        title: 'Error',
        description: 'No se pudo guardar el espacio',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleEdit = (space: Space) => {
    setEditingSpace(space);
    setShowDialog(true);
  };

  const handleDelete = async (space: Space) => {
    if (!confirm(`¿Estás seguro de eliminar "${space.label}"?`)) return;

    try {
      await SpacesService.deleteSpace(space.id);
      toast({
        title: 'Éxito',
        description: 'Espacio eliminado correctamente',
      });
      loadData();
    } catch (error) {
      console.error('Error eliminando espacio:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el espacio',
        variant: 'destructive',
      });
    }
  };

  // Acciones masivas
  const handleBulkMaintenance = () => {
    if (selectedSpaces.size === 0) return;
    setShowMaintenanceDialog(true);
  };

  const handleBulkCleaning = () => {
    if (selectedSpaces.size === 0) return;
    setShowCleaningDialog(true);
  };

  const handleSaveBulkMaintenance = async () => {
    if (!maintenanceNotes.trim()) {
      toast({
        title: 'Nota requerida',
        description: 'Por favor ingresa el motivo del mantenimiento',
        variant: 'destructive',
      });
      return;
    }

    try {
      const selectedSpacesArray = Array.from(selectedSpaces);
      const spacesToUpdate = spaces.filter(s => selectedSpacesArray.includes(s.id));
      
      // Crear órdenes de mantenimiento para cada espacio
      await Promise.all(
        spacesToUpdate.map(space => 
          SpacesService.createMaintenanceOrder({
            space_id: space.id,
            branch_id: space.branch_id,
            description: maintenanceNotes,
            priority: maintenancePriority,
          })
        )
      );

      // Actualizar estado de los espacios
      await SpacesService.updateMultipleSpaces(
        selectedSpacesArray,
        { 
          status: 'maintenance',
          maintenance_notes: maintenanceNotes,
        }
      );

      toast({
        title: 'Éxito',
        description: `${selectedSpaces.size} órdenes de mantenimiento creadas correctamente`,
      });

      setShowMaintenanceDialog(false);
      setMaintenanceNotes('');
      setMaintenancePriority('med');
      setSelectedSpaces(new Set());
      loadData();
    } catch (error) {
      console.error('Error creando órdenes de mantenimiento:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron crear las órdenes de mantenimiento',
        variant: 'destructive',
      });
    }
  };

  const handleSaveBulkCleaning = async () => {
    try {
      const selectedSpacesArray = Array.from(selectedSpaces);
      
      // Crear tareas de limpieza para cada espacio
      await Promise.all(
        selectedSpacesArray.map(spaceId => 
          SpacesService.createHousekeepingTask({
            space_id: spaceId,
            task_date: cleaningDate,
            notes: cleaningNotes,
          })
        )
      );

      toast({
        title: 'Éxito',
        description: `${selectedSpaces.size} tareas de limpieza creadas correctamente`,
      });

      setShowCleaningDialog(false);
      setCleaningNotes('');
      setCleaningDate(new Date().toISOString().split('T')[0]);
      setSelectedSpaces(new Set());
      loadData();
    } catch (error) {
      console.error('Error creando tareas de limpieza:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron crear las tareas de limpieza',
        variant: 'destructive',
      });
    }
  };

  const handleBulkAvailable = async () => {
    if (selectedSpaces.size === 0) return;

    try {
      await SpacesService.updateMultipleSpaces(
        Array.from(selectedSpaces),
        { 
          status: 'available',
          maintenance_notes: '', // Limpiar notas de mantenimiento
        }
      );
      toast({
        title: 'Éxito',
        description: `${selectedSpaces.size} espacios marcados como disponibles`,
      });

      loadData();
      setSelectedSpaces(new Set());
    } catch (error) {
      console.error('Error en acción masiva:', error);
      toast({
        title: 'Error',
        description: 'No se pudo completar la acción',
        variant: 'destructive',
      });
    }
  };

  const handleExport = () => {
    SpacesService.exportToCSV(filteredSpaces);
    toast({
      title: 'Exportado',
      description: 'Archivo CSV descargado correctamente',
    });
  };

  const handleCreateType = async (data: any) => {
    try {
      await SpacesService.createSpaceType({
        ...data,
        organization_id: organization!.id,
      });
      
      toast({
        title: 'Éxito',
        description: 'Tipo de espacio creado correctamente',
      });
      
      // Recargar tipos
      const typesData = await SpacesService.getSpaceTypes(organization!.id);
      setSpaceTypes(typesData);
    } catch (error) {
      console.error('Error creando tipo:', error);
      toast({
        title: 'Error',
        description: 'No se pudo crear el tipo de espacio',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const hasFilters = searchTerm !== '' || statusFilter !== 'all' || zoneFilter !== 'all' || typeFilter !== 'all';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <EspaciosPageHeader
        onRefresh={loadData}
        onExport={handleExport}
        onNew={() => {
          setEditingSpace(null);
          setShowDialog(true);
        }}
        isLoading={isLoading}
        canExport={filteredSpaces.length > 0}
      />

      {/* Filters y Bulk Actions */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="container mx-auto px-6 py-4 space-y-3">
          <EspaciosFilters
            searchTerm={searchTerm}
            statusFilter={statusFilter}
            zoneFilter={zoneFilter}
            typeFilter={typeFilter}
            floorZones={floorZones}
            spaceTypes={spaceTypes}
            onSearchChange={setSearchTerm}
            onStatusChange={setStatusFilter}
            onZoneChange={setZoneFilter}
            onTypeChange={setTypeFilter}
          />

          <BulkActionsBar
            selectedCount={selectedSpaces.size}
            totalCount={filteredSpaces.length}
            allSelected={selectedSpaces.size === filteredSpaces.length}
            onSelectAll={handleSelectAll}
            onBulkMaintenance={handleBulkMaintenance}
            onBulkAvailable={handleBulkAvailable}
            onBulkCleaning={handleBulkCleaning}
          />
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-6 py-6">
        {isLoading ? (
          <EspaciosLoadingState />
        ) : filteredSpaces.length === 0 ? (
          <EspaciosEmptyState
            hasFilters={hasFilters}
            onCreateNew={!hasFilters ? () => setShowDialog(true) : undefined}
          />
        ) : (
          <>
            {/* Espacios agrupados por zona */}
            {zoneFilter === 'all' ? (
              <div className="space-y-6">
                {/* Espacios sin zona */}
                {paginatedSpaces.filter(s => !s.floor_zone).length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                      <Layers className="h-5 w-5 text-gray-500" />
                      Sin zona
                      <Badge variant="secondary" className="ml-2">
                        {filteredSpaces.filter(s => !s.floor_zone).length} {filteredSpaces.filter(s => !s.floor_zone).length === 1 ? 'espacio' : 'espacios'}
                      </Badge>
                    </h3>
                    <EspaciosGrid
                      spaces={paginatedSpaces.filter(s => !s.floor_zone)}
                      selectedSpaces={selectedSpaces}
                      onSelect={handleSelect}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                    />
                  </div>
                )}

                {/* Espacios agrupados por zona */}
                {floorZones.map(zona => {
                  const espaciosZona = paginatedSpaces.filter(s => s.floor_zone === zona);
                  if (espaciosZona.length === 0) return null;

                  const totalZona = filteredSpaces.filter(s => s.floor_zone === zona).length;

                  return (
                    <div key={zona}>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                        <Layers className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        {zona}
                        <Badge variant="secondary" className="ml-2">
                          {totalZona} {totalZona === 1 ? 'espacio' : 'espacios'}
                        </Badge>
                      </h3>
                      <EspaciosGrid
                        spaces={espaciosZona}
                        selectedSpaces={selectedSpaces}
                        onSelect={handleSelect}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              // Mostrar zona específica o filtro sin zona
              <EspaciosGrid
                spaces={paginatedSpaces}
                selectedSpaces={selectedSpaces}
                onSelect={handleSelect}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            )}

            {/* Paginación */}
            {filteredSpaces.length > 0 && (
              <div className="mt-6 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <EspaciosPagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  pageSize={pageSize}
                  totalItems={filteredSpaces.length}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={setPageSize}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Dialogs */}
      <SpaceDialog
        open={showDialog}
        onOpenChange={(open) => {
          setShowDialog(open);
          if (!open) setEditingSpace(null);
        }}
        space={editingSpace}
        spaceTypes={spaceTypes}
        availableZones={floorZones}
        onSave={handleSave}
        onCreateType={() => setShowTypeDialog(true)}
      />

      <CreateSpaceTypeDialog
        open={showTypeDialog}
        onOpenChange={setShowTypeDialog}
        categories={spaceCategories}
        onSave={handleCreateType}
      />

      {/* Dialog de Mantenimiento Masivo */}
      <Dialog open={showMaintenanceDialog} onOpenChange={setShowMaintenanceDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear Órdenes de Mantenimiento</DialogTitle>
            <DialogDescription>
              Se creará una orden de mantenimiento para cada uno de los {selectedSpaces.size} espacios seleccionados
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="bulk_maintenance_priority">
                Prioridad <span className="text-red-500">*</span>
              </Label>
              <Select
                value={maintenancePriority}
                onValueChange={(value: 'low' | 'med' | 'high') => setMaintenancePriority(value)}
              >
                <SelectTrigger id="bulk_maintenance_priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-green-500" />
                      Baja
                    </span>
                  </SelectItem>
                  <SelectItem value="med">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-yellow-500" />
                      Media
                    </span>
                  </SelectItem>
                  <SelectItem value="high">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-red-500" />
                      Alta
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="bulk_maintenance_notes">
                Descripción del Problema <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="bulk_maintenance_notes"
                value={maintenanceNotes}
                onChange={(e) => setMaintenanceNotes(e.target.value)}
                placeholder="Ej: Reparación de aire acondicionado, cambio de cerraduras, pintura..."
                rows={4}
                required
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowMaintenanceDialog(false);
                setMaintenanceNotes('');
                setMaintenancePriority('med');
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveBulkMaintenance}>
              Crear {selectedSpaces.size} Orden{selectedSpaces.size > 1 ? 'es' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Limpieza Masiva */}
      <Dialog open={showCleaningDialog} onOpenChange={setShowCleaningDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asignar Tareas de Limpieza</DialogTitle>
            <DialogDescription>
              Se creará una tarea de limpieza para cada uno de los {selectedSpaces.size} espacios seleccionados
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="bulk_cleaning_date">Fecha</Label>
              <Input
                id="bulk_cleaning_date"
                type="date"
                value={cleaningDate}
                onChange={(e) => setCleaningDate(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="bulk_cleaning_notes">Notas (opcional)</Label>
              <Textarea
                id="bulk_cleaning_notes"
                value={cleaningNotes}
                onChange={(e) => setCleaningNotes(e.target.value)}
                placeholder="Instrucciones especiales o notas..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCleaningDialog(false);
                setCleaningNotes('');
                setCleaningDate(new Date().toISOString().split('T')[0]);
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveBulkCleaning}>
              Crear {selectedSpaces.size} Tarea{selectedSpaces.size > 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
