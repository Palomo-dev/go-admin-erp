'use client';

import React, { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';
import {
  SpaceTypesHeader,
  SpaceTypesFilters,
  SpaceTypesGrid,
  SpaceTypesEmptyState,
  SpaceTypesLoadingState,
  SpaceTypeDialog,
  SpaceTypesStats,
  SpaceTypesPagination,
} from '@/components/pms/tipos-espacio';
import SpaceTypesService, {
  type SpaceType,
  type SpaceCategory,
} from '@/lib/services/spaceTypesService';
import { useOrganization } from '@/lib/hooks/useOrganization';

export default function TiposEspacioPage() {
  const { toast } = useToast();
  const { organization } = useOrganization();

  const [spaceTypes, setSpaceTypes] = useState<SpaceType[]>([]);
  const [categories, setCategories] = useState<SpaceCategory[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    inactive: 0,
    totalSpaces: 0,
    avgRate: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(9);

  // Dialogs
  const [showDialog, setShowDialog] = useState(false);
  const [editingSpaceType, setEditingSpaceType] = useState<SpaceType | null>(null);

  // Cargar datos iniciales
  useEffect(() => {
    if (organization?.id) {
      loadData();
      loadCategories();
    }
  }, [organization?.id]);

  const loadData = async () => {
    if (!organization?.id) return;

    try {
      setIsLoading(true);
      const [typesData, statsData] = await Promise.all([
        SpaceTypesService.getSpaceTypes(organization.id),
        SpaceTypesService.getStats(organization.id),
      ]);

      setSpaceTypes(typesData);
      setStats(statsData);
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los tipos de espacio',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const categoriesData = await SpaceTypesService.getSpaceCategories();
      setCategories(categoriesData);
    } catch (error) {
      console.error('Error cargando categorías:', error);
    }
  };

  // Filtrar tipos de espacio
  const filteredSpaceTypes = spaceTypes.filter((spaceType) => {
    const matchesSearch =
      spaceType.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      spaceType.short_name?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory =
      categoryFilter === 'all' || spaceType.category_code === categoryFilter;

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && spaceType.is_active) ||
      (statusFilter === 'inactive' && !spaceType.is_active);

    return matchesSearch && matchesCategory && matchesStatus;
  });

  // Calcular paginación
  const totalPages = Math.ceil(filteredSpaceTypes.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedSpaceTypes = filteredSpaceTypes.slice(startIndex, endIndex);

  // Resetear página cuando cambian los filtros
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, categoryFilter, statusFilter, pageSize]);

  // Handlers
  const handleEdit = (spaceType: SpaceType) => {
    setEditingSpaceType(spaceType);
    setShowDialog(true);
  };

  const handleDelete = async (spaceType: SpaceType) => {
    if (
      !confirm(
        `¿Estás seguro de eliminar "${spaceType.name}"?${
          spaceType.spaces_count && spaceType.spaces_count > 0
            ? `\n\nEste tipo tiene ${spaceType.spaces_count} espacios asociados.`
            : ''
        }`
      )
    )
      return;

    try {
      await SpaceTypesService.deleteSpaceType(spaceType.id);
      toast({
        title: 'Éxito',
        description: 'Tipo de espacio eliminado correctamente',
      });
      loadData();
    } catch (error: any) {
      console.error('Error eliminando tipo:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo eliminar el tipo de espacio',
        variant: 'destructive',
      });
    }
  };

  const handleToggleActive = async (spaceType: SpaceType, isActive: boolean) => {
    try {
      await SpaceTypesService.toggleActive(spaceType.id, isActive);
      toast({
        title: 'Éxito',
        description: `Tipo de espacio ${isActive ? 'activado' : 'desactivado'} correctamente`,
      });
      loadData();
    } catch (error) {
      console.error('Error actualizando estado:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el estado',
        variant: 'destructive',
      });
    }
  };

  const handleSave = async (data: any) => {
    try {
      if (editingSpaceType) {
        await SpaceTypesService.updateSpaceType(editingSpaceType.id, data);
        toast({
          title: 'Éxito',
          description: 'Tipo de espacio actualizado correctamente',
        });
      } else {
        await SpaceTypesService.createSpaceType({
          ...data,
          organization_id: organization!.id,
        });
        toast({
          title: 'Éxito',
          description: 'Tipo de espacio creado correctamente',
        });
      }

      loadData();
      setEditingSpaceType(null);
    } catch (error) {
      console.error('Error guardando tipo:', error);
      toast({
        title: 'Error',
        description: 'No se pudo guardar el tipo de espacio',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const hasFilters = searchTerm !== '' || categoryFilter !== 'all' || statusFilter !== 'all';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <SpaceTypesHeader
        onRefresh={loadData}
        onNew={() => {
          setEditingSpaceType(null);
          setShowDialog(true);
        }}
        isLoading={isLoading}
      />

      {/* Stats */}
      {!isLoading && spaceTypes.length > 0 && (
        <div className="container mx-auto px-6 py-6">
          <SpaceTypesStats stats={stats} />
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="container mx-auto px-6 py-4">
          <SpaceTypesFilters
            searchTerm={searchTerm}
            categoryFilter={categoryFilter}
            statusFilter={statusFilter}
            categories={categories}
            onSearchChange={setSearchTerm}
            onCategoryChange={setCategoryFilter}
            onStatusChange={setStatusFilter}
          />
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-6 py-6">
        {isLoading ? (
          <SpaceTypesLoadingState />
        ) : filteredSpaceTypes.length === 0 ? (
          <SpaceTypesEmptyState
            hasFilters={hasFilters}
            onCreateNew={!hasFilters ? () => setShowDialog(true) : undefined}
          />
        ) : (
          <>
            <SpaceTypesGrid
              spaceTypes={paginatedSpaceTypes}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onToggleActive={handleToggleActive}
            />

            {/* Paginación */}
            {filteredSpaceTypes.length > 0 && (
              <div className="mt-6 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <SpaceTypesPagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  pageSize={pageSize}
                  totalItems={filteredSpaceTypes.length}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={setPageSize}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Dialog */}
      <SpaceTypeDialog
        open={showDialog}
        onOpenChange={(open) => {
          setShowDialog(open);
          if (!open) setEditingSpaceType(null);
        }}
        spaceType={editingSpaceType}
        categories={categories}
        onSave={handleSave}
      />
    </div>
  );
}
