'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/utils/Utils';
import {
  Plus,
  RefreshCw,
  FileDown,
  Search,
} from 'lucide-react';

import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import timelineExportsService, {
  type TimelineExport,
  type CreateExportInput,
} from '@/lib/services/timelineExportsService';

import {
  ExportsList,
  NewExportDialog,
} from '@/components/timeline/exportaciones';

export default function ExportacionesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const organizationId = getOrganizationId();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exports, setExports] = useState<TimelineExport[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [searchText, setSearchText] = useState('');
  const [userId, setUserId] = useState<string | null>(null);

  // Dialogs
  const [newExportOpen, setNewExportOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedExport, setSelectedExport] = useState<TimelineExport | null>(null);
  const [editName, setEditName] = useState('');

  // Obtener usuario actual
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
      }
    };
    getUser();
  }, []);

  // Cargar exportaciones
  const loadExports = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const result = await timelineExportsService.getExports(organizationId, {
        limit: 50,
      });

      setExports(result.data);
      setTotalCount(result.count);
    } catch (error) {
      console.error('Error loading exports:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las exportaciones',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organizationId, toast]);

  useEffect(() => {
    loadExports();
  }, [loadExports]);

  // Handlers
  const handleCreateExport = async (input: CreateExportInput) => {
    if (!userId) {
      toast({
        title: 'Error',
        description: 'No se pudo identificar al usuario',
        variant: 'destructive',
      });
      return;
    }

    try {
      await timelineExportsService.createExport(organizationId, userId, input);
      toast({
        title: 'Exportación completada',
        description: 'El archivo se ha descargado correctamente',
      });
      loadExports(true);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo crear la exportación',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleDuplicate = async (exportId: string) => {
    if (!userId) return;

    try {
      await timelineExportsService.duplicateExport(organizationId, userId, exportId);
      toast({
        title: 'Exportación duplicada',
        description: 'Se ha creado una copia con los mismos filtros',
      });
      loadExports(true);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo duplicar la exportación',
        variant: 'destructive',
      });
    }
  };

  const handleRerun = async (exportId: string) => {
    if (!userId) return;

    try {
      await timelineExportsService.rerunExport(organizationId, userId, exportId);
      toast({
        title: 'Exportación completada',
        description: 'El archivo se ha descargado correctamente',
      });
      loadExports(true);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo re-ejecutar la exportación',
        variant: 'destructive',
      });
    }
  };

  const handleEdit = (exportItem: TimelineExport) => {
    setSelectedExport(exportItem);
    setEditName(exportItem.name);
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedExport || !editName.trim()) return;

    try {
      await timelineExportsService.updateExport(selectedExport.id, {
        name: editName.trim(),
      });
      toast({
        title: 'Actualizado',
        description: 'El nombre se ha actualizado correctamente',
      });
      setEditDialogOpen(false);
      setSelectedExport(null);
      loadExports(true);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la exportación',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteClick = (exportId: string) => {
    const exportItem = exports.find(e => e.id === exportId);
    if (exportItem) {
      setSelectedExport(exportItem);
      setDeleteDialogOpen(true);
    }
  };

  const handleConfirmDelete = async () => {
    if (!selectedExport) return;

    try {
      await timelineExportsService.deleteExport(selectedExport.id);
      toast({
        title: 'Eliminada',
        description: 'La exportación se ha eliminado correctamente',
      });
      setDeleteDialogOpen(false);
      setSelectedExport(null);
      loadExports(true);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la exportación',
        variant: 'destructive',
      });
    }
  };

  // Filtrar exportaciones por búsqueda
  const filteredExports = exports.filter(e =>
    e.name.toLowerCase().includes(searchText.toLowerCase()) ||
    e.description?.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <FileDown className="h-6 w-6 text-blue-500" />
                Exportaciones
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Historial de exportaciones del timeline de auditoría
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => loadExports(true)}
                disabled={refreshing}
                className="border-gray-300 dark:border-gray-600"
              >
                <RefreshCw className={cn('h-4 w-4 mr-2', refreshing && 'animate-spin')} />
                Actualizar
              </Button>
              <Button
                onClick={() => setNewExportOpen(true)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Nueva Exportación
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        {/* Búsqueda */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar exportaciones..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="pl-10 bg-white dark:bg-gray-800"
            />
          </div>
        </div>

        {/* Estadísticas */}
        <div className="mb-6 text-sm text-gray-500 dark:text-gray-400">
          {totalCount > 0 ? (
            <>
              Mostrando {filteredExports.length} de {totalCount} exportaciones
            </>
          ) : (
            'No hay exportaciones registradas'
          )}
        </div>

        {/* Lista */}
        <ExportsList
          exports={filteredExports}
          loading={loading}
          onDuplicate={handleDuplicate}
          onRerun={handleRerun}
          onEdit={handleEdit}
          onDelete={handleDeleteClick}
        />
      </div>

      {/* Dialog: Nueva exportación */}
      <NewExportDialog
        open={newExportOpen}
        onClose={() => setNewExportOpen(false)}
        onSubmit={handleCreateExport}
      />

      {/* Dialog: Editar nombre */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Exportación</DialogTitle>
            <DialogDescription>
              Modifica el nombre de la exportación.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nombre</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Nombre de la exportación"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={!editName.trim()}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Confirmar eliminación */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar exportación?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará el registro de la exportación
              "{selectedExport?.name}".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
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
