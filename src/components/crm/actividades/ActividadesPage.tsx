'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Plus, RefreshCw, ArrowLeft, CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { ActividadesFiltros } from './ActividadesFiltros';
import { ActividadesStats } from './ActividadesStats';
import { ActividadesTable } from './ActividadesTable';
import { ActividadForm } from './ActividadForm';
import { ActividadesPagination } from './ActividadesPagination';
import { actividadesService } from './ActividadesService';
import {
  Activity,
  ActivityFilters,
  ActivityStats,
  CreateActivityInput,
  UpdateActivityInput,
} from './types';
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

export function ActividadesPage() {
  const { toast } = useToast();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [stats, setStats] = useState<ActivityStats>({
    total: 0,
    calls: 0,
    emails: 0,
    meetings: 0,
    notes: 0,
    visits: 0,
    whatsapp: 0,
  });
  const [filters, setFilters] = useState<ActivityFilters>({});
  const [users, setUsers] = useState<{ id: string; email: string; full_name?: string }[]>([]);
  const [customers, setCustomers] = useState<{ id: string; full_name: string; email?: string }[]>([]);
  const [opportunities, setOpportunities] = useState<{ id: string; title: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteActivity, setDeleteActivity] = useState<Activity | null>(null);
  
  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [activitiesData, statsData, usersData, customersData, opportunitiesData] =
        await Promise.all([
          actividadesService.getActivities(filters),
          actividadesService.getStats(),
          actividadesService.getUsers(),
          actividadesService.getCustomers(),
          actividadesService.getOpportunities(),
        ]);

      setActivities(activitiesData);
      setStats(statsData);
      setUsers(usersData);
      setCustomers(customersData);
      setOpportunities(opportunitiesData);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las actividades',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [filters, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Resetear página cuando cambian filtros o pageSize
  useEffect(() => {
    setCurrentPage(1);
  }, [filters, pageSize]);

  // Calcular paginación
  const totalItems = activities.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedActivities = activities.slice(startIndex, startIndex + pageSize);

  const handleFiltersChange = (newFilters: ActivityFilters) => {
    setFilters(newFilters);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
  };

  const handleNewActivity = () => {
    setEditingActivity(null);
    setIsFormOpen(true);
  };

  const handleEditActivity = (activity: Activity) => {
    setEditingActivity(activity);
    setIsFormOpen(true);
  };

  const handleDuplicateActivity = async (activity: Activity) => {
    try {
      const duplicated = await actividadesService.duplicateActivity(activity.id);
      if (duplicated) {
        toast({
          title: 'Actividad duplicada',
          description: 'La actividad se ha duplicado correctamente',
        });
        loadData();
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo duplicar la actividad',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteActivity = async () => {
    if (!deleteActivity) return;

    try {
      const success = await actividadesService.deleteActivity(deleteActivity.id);
      if (success) {
        toast({
          title: 'Actividad eliminada',
          description: 'La actividad se ha eliminado correctamente',
        });
        loadData();
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la actividad',
        variant: 'destructive',
      });
    } finally {
      setDeleteActivity(null);
    }
  };

  const handleSaveActivity = async (data: CreateActivityInput | UpdateActivityInput) => {
    setIsSaving(true);
    try {
      if (editingActivity) {
        const updated = await actividadesService.updateActivity(editingActivity.id, data);
        if (updated) {
          toast({
            title: 'Actividad actualizada',
            description: 'Los cambios se han guardado correctamente',
          });
        }
      } else {
        const created = await actividadesService.createActivity(data as CreateActivityInput);
        if (created) {
          toast({
            title: 'Actividad creada',
            description: 'La actividad se ha registrado correctamente',
          });
        }
      }
      setIsFormOpen(false);
      loadData();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo guardar la actividad',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/crm">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                <CalendarClock className="h-6 w-6 text-blue-600" />
              </div>
              Actividades
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              CRM / Actividades
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={loadData}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            onClick={handleNewActivity}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nueva Actividad
          </Button>
        </div>
      </div>

      {/* Stats */}
      <ActividadesStats stats={stats} isLoading={isLoading} />

      {/* Filtros */}
      <ActividadesFiltros
        filters={filters}
        onFiltersChange={handleFiltersChange}
        users={users}
      />

      {/* Tabla */}
      <ActividadesTable
        activities={paginatedActivities}
        isLoading={isLoading}
        onEdit={handleEditActivity}
        onDuplicate={handleDuplicateActivity}
        onDelete={setDeleteActivity}
      />

      {/* Paginación */}
      <ActividadesPagination
        currentPage={currentPage}
        totalPages={totalPages}
        pageSize={pageSize}
        totalItems={totalItems}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
      />

      {/* Formulario */}
      <ActividadForm
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        activity={editingActivity}
        customers={customers}
        opportunities={opportunities}
        onSave={handleSaveActivity}
        isLoading={isSaving}
      />

      {/* Confirmación de eliminación */}
      <AlertDialog open={!!deleteActivity} onOpenChange={() => setDeleteActivity(null)}>
        <AlertDialogContent className="bg-white dark:bg-gray-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-gray-100">
              ¿Eliminar actividad?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              Esta acción no se puede deshacer. La actividad será eliminada permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-gray-200 dark:border-gray-700">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteActivity}
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
