'use client';

import React, { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';
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
import {
  CategoriesHeader,
  CategoriesGrid,
  CategoriesLoadingState,
  CategoriesEmptyState,
  CategoryDialog,
  CategoriesPagination,
} from '@/components/pms/categorias';
import SpaceCategoriesService, { type SpaceCategory } from '@/lib/services/spaceCategoriesService';

export default function CategoriasPage() {
  const { toast } = useToast();

  const [categories, setCategories] = useState<SpaceCategory[]>([]);
  const [stats, setStats] = useState<Record<string, { total_types: number; total_spaces: number }>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Estados de diálogos
  const [showDialog, setShowDialog] = useState(false);
  const [editingCategory, setEditingCategory] = useState<SpaceCategory | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<SpaceCategory | null>(null);

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(9);

  // Cargar datos
  useEffect(() => {
    loadData();
  }, []);

  // Resetear página cuando cambia el tamaño de página
  useEffect(() => {
    setCurrentPage(1);
  }, [pageSize]);

  // Calcular paginación
  const totalPages = Math.ceil(categories.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedCategories = categories.slice(startIndex, endIndex);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [categoriesData, statsData] = await Promise.all([
        SpaceCategoriesService.getCategories(),
        SpaceCategoriesService.getCategoryStats(),
      ]);

      setCategories(categoriesData);
      setStats(statsData);
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las categorías',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleNew = () => {
    setEditingCategory(null);
    setShowDialog(true);
  };

  const handleEdit = (category: SpaceCategory) => {
    setEditingCategory(category);
    setShowDialog(true);
  };

  const handleSave = async (data: any) => {
    try {
      if (editingCategory) {
        // Actualizar
        await SpaceCategoriesService.updateCategory(editingCategory.code, data);
        toast({
          title: 'Categoría actualizada',
          description: `${data.display_name} se actualizó correctamente`,
        });
      } else {
        // Crear
        await SpaceCategoriesService.createCategory(data);
        toast({
          title: 'Categoría creada',
          description: `${data.display_name} se creó correctamente`,
        });
      }
      
      await loadData();
      setShowDialog(false);
      setEditingCategory(null);
    } catch (error: any) {
      console.error('Error guardando categoría:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo guardar la categoría',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleDeleteConfirm = async () => {
    if (!categoryToDelete) return;

    try {
      await SpaceCategoriesService.deleteCategory(categoryToDelete.code);
      toast({
        title: 'Categoría eliminada',
        description: `${categoryToDelete.display_name} se eliminó correctamente`,
      });
      await loadData();
    } catch (error: any) {
      console.error('Error eliminando categoría:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo eliminar la categoría',
        variant: 'destructive',
      });
    } finally {
      setCategoryToDelete(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <CategoriesHeader
        onNew={handleNew}
        onRefresh={loadData}
        isLoading={isLoading}
      />

      {/* Content */}
      <div className="container mx-auto px-6 py-6">
        {isLoading ? (
          <CategoriesLoadingState />
        ) : categories.length === 0 ? (
          <CategoriesEmptyState onCreateNew={handleNew} />
        ) : (
          <>
            <CategoriesGrid
              categories={paginatedCategories}
              stats={stats}
              onEdit={handleEdit}
              onDelete={setCategoryToDelete}
            />

            {/* Paginación */}
            {categories.length > 0 && (
              <div className="mt-6 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <CategoriesPagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  pageSize={pageSize}
                  totalItems={categories.length}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={setPageSize}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Dialog: Crear/Editar */}
      <CategoryDialog
        open={showDialog}
        onOpenChange={(open) => {
          setShowDialog(open);
          if (!open) setEditingCategory(null);
        }}
        category={editingCategory}
        onSave={handleSave}
      />

      {/* Dialog: Confirmar Eliminar */}
      <AlertDialog
        open={!!categoryToDelete}
        onOpenChange={() => setCategoryToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar categoría?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. La categoría{' '}
              <strong>{categoryToDelete?.display_name}</strong> será eliminada
              permanentemente.
              {stats[categoryToDelete?.code || '']?.total_types > 0 && (
                <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-yellow-800 dark:text-yellow-200">
                  ⚠️ Esta categoría tiene{' '}
                  {stats[categoryToDelete?.code || ''].total_types} tipo(s) de
                  espacio asociados. Debes eliminarlos o cambiarlos de categoría
                  primero.
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-600 hover:bg-red-700"
              disabled={
                !!categoryToDelete &&
                stats[categoryToDelete.code]?.total_types > 0
              }
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
